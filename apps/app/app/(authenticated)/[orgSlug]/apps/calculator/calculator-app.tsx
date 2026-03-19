"use client";

import { useState, useCallback, useEffect } from "react";

type HistoryEntry = { expression: string; result: string };

export function CalculatorApp() {
  const [display, setDisplay] = useState("0");
  const [expression, setExpression] = useState("");
  const [newNumber, setNewNumber] = useState(true);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [lastOp, setLastOp] = useState<string | null>(null);

  const inputDigit = useCallback((digit: string) => {
    if (newNumber) {
      setDisplay(digit === "." ? "0." : digit);
      setNewNumber(false);
    } else {
      if (digit === "." && display.includes(".")) return;
      if (display.length >= 15) return;
      setDisplay((prev) => (prev === "0" && digit !== "." ? digit : prev + digit));
    }
    setLastOp(null);
  }, [display, newNumber]);

  const inputOperator = useCallback((op: string) => {
    if (lastOp) {
      setExpression((prev) => prev.slice(0, -3) + " " + op + " ");
      setLastOp(op);
      return;
    }
    setExpression((prev) => prev + display + " " + op + " ");
    setNewNumber(true);
    setLastOp(op);
  }, [display, lastOp]);

  const calculate = useCallback(() => {
    const fullExpr = expression + display;
    if (!fullExpr.trim() || !expression) return;
    try {
      const sanitized = fullExpr.replace(/[^0-9+\-*/.() ]/g, "");
      if (!sanitized.trim()) return;
      const result = new Function(`return (${sanitized})`)() as number;
      const resultStr = Number.isFinite(result) ? parseFloat(result.toFixed(10)).toString() : "Error";
      setHistory((prev) => [{ expression: fullExpr.trim(), result: resultStr }, ...prev].slice(0, 20));
      setDisplay(resultStr);
      setExpression("");
      setNewNumber(true);
      setLastOp(null);
    } catch {
      setDisplay("Error");
      setExpression("");
      setNewNumber(true);
      setLastOp(null);
    }
  }, [display, expression]);

  const clear = () => { setDisplay("0"); setExpression(""); setNewNumber(true); setLastOp(null); };
  const backspace = () => {
    if (display.length <= 1 || display === "Error") { setDisplay("0"); setNewNumber(true); }
    else setDisplay((prev) => prev.slice(0, -1));
  };
  const toggleSign = () => {
    if (display === "0" || display === "Error") return;
    setDisplay((prev) => prev.startsWith("-") ? prev.slice(1) : "-" + prev);
  };
  const percent = () => {
    const val = parseFloat(display);
    if (!Number.isFinite(val)) return;
    setDisplay((val / 100).toString());
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key >= "0" && e.key <= "9") inputDigit(e.key);
      else if (e.key === ".") inputDigit(".");
      else if (e.key === "+") inputOperator("+");
      else if (e.key === "-") inputOperator("-");
      else if (e.key === "*") inputOperator("*");
      else if (e.key === "/") { e.preventDefault(); inputOperator("/"); }
      else if (e.key === "Enter" || e.key === "=") { e.preventDefault(); calculate(); }
      else if (e.key === "Escape") clear();
      else if (e.key === "Backspace") backspace();
      else if (e.key === "%") percent();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const fontSize = display.length > 12 ? "text-2xl" : display.length > 8 ? "text-3xl" : "text-4xl";

  return (
    <div className="flex flex-1 items-start justify-center gap-8 p-6">
      <div className="w-full max-w-[300px]">
        <div className="rounded-2xl bg-zinc-900 shadow-2xl overflow-hidden border border-zinc-800">
          {/* Display */}
          <div className="px-5 pt-6 pb-3">
            <div className="text-right text-xs text-zinc-500 min-h-[18px] truncate font-mono">
              {expression || "\u00A0"}
            </div>
            <div className={`text-right ${fontSize} font-light text-white tabular-nums tracking-tight mt-1 truncate`}>
              {display}
            </div>
          </div>

          {/* Buttons */}
          <div className="grid grid-cols-4 gap-[7px] p-3 pt-2">
            <Btn label="AC" onClick={clear} variant="function" />
            <Btn label="+/−" onClick={toggleSign} variant="function" />
            <Btn label="%" onClick={percent} variant="function" />
            <Btn label="÷" onClick={() => inputOperator("/")} variant="operator" active={lastOp === "/"} />

            <Btn label="7" onClick={() => inputDigit("7")} />
            <Btn label="8" onClick={() => inputDigit("8")} />
            <Btn label="9" onClick={() => inputDigit("9")} />
            <Btn label="×" onClick={() => inputOperator("*")} variant="operator" active={lastOp === "*"} />

            <Btn label="4" onClick={() => inputDigit("4")} />
            <Btn label="5" onClick={() => inputDigit("5")} />
            <Btn label="6" onClick={() => inputDigit("6")} />
            <Btn label="−" onClick={() => inputOperator("-")} variant="operator" active={lastOp === "-"} />

            <Btn label="1" onClick={() => inputDigit("1")} />
            <Btn label="2" onClick={() => inputDigit("2")} />
            <Btn label="3" onClick={() => inputDigit("3")} />
            <Btn label="+" onClick={() => inputOperator("+")} variant="operator" active={lastOp === "+"} />

            <Btn label="0" onClick={() => inputDigit("0")} wide />
            <Btn label="." onClick={() => inputDigit(".")} />
            <Btn label="=" onClick={calculate} variant="equals" />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-muted-foreground/50">
          <kbd className="rounded border border-border/40 px-1.5 py-0.5 font-mono text-[9px]">0-9</kbd>
          <kbd className="rounded border border-border/40 px-1.5 py-0.5 font-mono text-[9px]">Enter</kbd>
          <kbd className="rounded border border-border/40 px-1.5 py-0.5 font-mono text-[9px]">Esc</kbd>
          <kbd className="rounded border border-border/40 px-1.5 py-0.5 font-mono text-[9px]">⌫</kbd>
        </div>
      </div>

      {/* History */}
      <div className="hidden md:block w-56">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">History</h3>
          {history.length > 0 && (
            <button onClick={() => setHistory([])} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">Clear</button>
          )}
        </div>
        <div className="space-y-1.5 max-h-[480px] overflow-y-auto">
          {history.length === 0 && (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">
              Results appear here
            </div>
          )}
          {history.map((h, i) => (
            <button key={i} onClick={() => { setDisplay(h.result); setExpression(""); setNewNumber(true); setLastOp(null); }}
              className="w-full rounded-lg border bg-card px-3 py-2.5 text-left hover:bg-muted/50 transition-colors group">
              <div className="text-[10px] text-muted-foreground truncate font-mono">{h.expression} =</div>
              <div className="text-sm font-semibold tabular-nums group-hover:text-primary transition-colors">{h.result}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Btn({ label, onClick, variant = "number", wide = false, active = false }: {
  label: string; onClick: () => void; variant?: "number" | "function" | "operator" | "equals"; wide?: boolean; active?: boolean;
}) {
  const base = "flex h-[54px] items-center justify-center rounded-xl text-[18px] font-medium select-none cursor-pointer transition-all duration-100 active:scale-[0.92] active:brightness-90";
  const styles = {
    number: "bg-zinc-700 hover:bg-zinc-600 text-white",
    function: "bg-zinc-500 hover:bg-zinc-400 text-zinc-900 font-semibold",
    operator: active
      ? "bg-white text-orange-500 font-bold ring-2 ring-orange-400/50"
      : "bg-orange-500 hover:bg-orange-400 text-white font-bold",
    equals: "bg-orange-500 hover:bg-orange-400 text-white font-bold",
  };
  return (
    <button onClick={onClick} className={`${base} ${styles[variant]} ${wide ? "col-span-2" : ""}`}>
      {label}
    </button>
  );
}
