"use client";

import { useState, useCallback } from "react";

const CHARSETS = {
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  numbers: "0123456789",
  symbols: "!@#$%^&*()_+-=[]{}|;:,.<>?",
};

function generatePassword(length: number, options: Record<string, boolean>): string {
  let chars = "";
  if (options.uppercase) chars += CHARSETS.uppercase;
  if (options.lowercase) chars += CHARSETS.lowercase;
  if (options.numbers) chars += CHARSETS.numbers;
  if (options.symbols) chars += CHARSETS.symbols;
  if (!chars) chars = CHARSETS.lowercase + CHARSETS.numbers;
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

function getStrength(pw: string): { label: string; color: string; percent: number } {
  let score = 0;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (pw.length >= 20) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (score <= 2) return { label: "Weak", color: "bg-red-500", percent: 25 };
  if (score <= 3) return { label: "Fair", color: "bg-amber-500", percent: 50 };
  if (score <= 4) return { label: "Strong", color: "bg-blue-500", percent: 75 };
  return { label: "Excellent", color: "bg-green-500", percent: 100 };
}

export function PasswordGeneratorApp() {
  const [length, setLength] = useState(16);
  const [options, setOptions] = useState({ uppercase: true, lowercase: true, numbers: true, symbols: true });
  const [password, setPassword] = useState(() => generatePassword(16, { uppercase: true, lowercase: true, numbers: true, symbols: true }));
  const [history, setHistory] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(() => {
    const pw = generatePassword(length, options);
    setPassword(pw);
    setHistory((prev) => [pw, ...prev].slice(0, 10));
    setCopied(false);
  }, [length, options]);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const strength = getStrength(password);

  const toggle = (key: string) => setOptions((prev) => ({ ...prev, [key]: !prev[key as keyof typeof prev] }));

  return (
    <div className="flex flex-1 items-start justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        {/* Generated password display */}
        <div className="rounded-2xl border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-xl bg-muted/50 p-4 font-mono text-lg break-all tracking-wide leading-relaxed select-all">
              {password.split("").map((c, i) => (
                <span
                  key={i}
                  className={
                    /[A-Z]/.test(c) ? "text-blue-600 dark:text-blue-400" :
                    /\d/.test(c) ? "text-emerald-600 dark:text-emerald-400" :
                    /[^a-zA-Z0-9]/.test(c) ? "text-amber-600 dark:text-amber-400" :
                    "text-foreground"
                  }
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* Strength bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Strength</span>
              <span className="font-medium">{strength.label}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full transition-all ${strength.color}`} style={{ width: `${strength.percent}%` }} />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button onClick={() => copyToClipboard(password)} className="flex-1 h-10 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              {copied ? "Copied!" : "Copy"}
            </button>
            <button onClick={generate} className="flex-1 h-10 rounded-lg border text-sm font-medium hover:bg-muted transition-colors">
              Generate New
            </button>
          </div>
        </div>

        {/* Options */}
        <div className="rounded-2xl border bg-card p-5 space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Length</span>
              <span className="tabular-nums text-muted-foreground">{length}</span>
            </div>
            <input
              type="range" min={8} max={64} value={length}
              onChange={(e) => { setLength(Number(e.target.value)); }}
              onMouseUp={generate} onTouchEnd={generate}
              className="w-full accent-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(options) as Array<keyof typeof options>).map((key) => (
              <button
                key={key}
                onClick={() => { toggle(key); setTimeout(generate, 0); }}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  options[key] ? "bg-primary/10 border-primary/30 text-foreground" : "bg-muted/30 text-muted-foreground"
                }`}
              >
                <div className={`h-3.5 w-3.5 rounded-sm border flex items-center justify-center ${options[key] ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                  {options[key] && <svg className="h-2.5 w-2.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </div>
                <span className="capitalize">{key}</span>
                <span className="ml-auto text-[10px] text-muted-foreground font-mono">{CHARSETS[key].slice(0, 6)}…</span>
              </button>
            ))}
          </div>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Recent</h3>
            <div className="space-y-1">
              {history.map((pw, i) => (
                <button
                  key={i}
                  onClick={() => copyToClipboard(pw)}
                  className="w-full rounded-lg border bg-card px-3 py-2 text-left font-mono text-xs truncate hover:bg-muted/50 transition-colors"
                >
                  {pw}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
