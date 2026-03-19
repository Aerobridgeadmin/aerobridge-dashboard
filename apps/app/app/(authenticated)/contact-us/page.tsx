"use client";

import { useRef, useState } from "react";
import { Header } from "../components/header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import {
  CheckCircle2Icon,
  HeadphonesIcon,
  ImagePlusIcon,
  Loader2Icon,
  SendIcon,
  XIcon,
} from "lucide-react";

type FormState = "idle" | "submitting" | "success" | "error";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB per file (Freshdesk limit)
const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export default function ContactUsPage() {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("question");
  const [priority, setPriority] = useState("low");
  const [files, setFiles] = useState<File[]>([]);
  const [formState, setFormState] = useState<FormState>("idle");
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const incoming = Array.from(newFiles);
    const valid: File[] = [];
    for (const f of incoming) {
      if (!ALLOWED_TYPES.includes(f.type)) {
        setErrorMessage(`"${f.name}" is not a supported file type.`);
        setFormState("error");
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        setErrorMessage(`"${f.name}" exceeds the 15 MB size limit.`);
        setFormState("error");
        continue;
      }
      valid.push(f);
    }
    setFiles((prev) => {
      const combined = [...prev, ...valid];
      if (combined.length > MAX_FILES) {
        setErrorMessage(`You can attach up to ${MAX_FILES} files.`);
        setFormState("error");
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;

    setFormState("submitting");
    setErrorMessage("");

    try {
      const formData = new FormData();
      formData.append("subject", subject);
      formData.append("description", description);
      formData.append("category", category);
      formData.append("priority", priority);
      for (const file of files) {
        formData.append("attachments", file);
      }

      const res = await fetch("/api/contact-us", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit request");
      }

      setTicketId(data.ticketId);
      setFormState("success");
      setSubject("");
      setDescription("");
      setCategory("question");
      setPriority("low");
      setFiles([]);
    } catch (err) {
      setFormState("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong"
      );
    }
  };

  const handleReset = () => {
    setFormState("idle");
    setTicketId(null);
    setErrorMessage("");
  };

  return (
    <>
      <Header page="Contact Us" pages={[]} />
      <div className="flex flex-1 flex-col items-center p-4 md:p-8">
        <div className="w-full max-w-2xl space-y-6">
          {/* Header card */}
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <HeadphonesIcon className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-xl">How can we help?</CardTitle>
              <CardDescription>
                Submit a support request and our team will get back to you as
                soon as possible.
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Success state */}
          {formState === "success" && (
            <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
              <CardContent className="flex flex-col items-center gap-3 pt-6 pb-6 text-center">
                <CheckCircle2Icon className="h-10 w-10 text-green-600 dark:text-green-400" />
                <div>
                  <h3 className="text-lg font-semibold text-green-800 dark:text-green-300">
                    Request Submitted!
                  </h3>
                  <p className="mt-1 text-sm text-green-700 dark:text-green-400">
                    Your support ticket{ticketId ? ` (#${ticketId})` : ""} has
                    been created. We&apos;ll respond via email shortly.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  className="mt-2"
                >
                  Submit Another Request
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Form */}
          {formState !== "success" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">New Support Request</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Category & Priority row */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="category">Category</Label>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger id="category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="question">General Question</SelectItem>
                          <SelectItem value="bug">Bug Report</SelectItem>
                          <SelectItem value="feature">Feature Request</SelectItem>
                          <SelectItem value="account">Account Issue</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="priority">Priority</Label>
                      <Select value={priority} onValueChange={setPriority}>
                        <SelectTrigger id="priority">
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Subject */}
                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      placeholder="Brief summary of your request"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      required
                      disabled={formState === "submitting"}
                    />
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Please provide as much detail as possible so we can help you faster..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      required
                      rows={6}
                      disabled={formState === "submitting"}
                    />
                  </div>

                  {/* File upload */}
                  <div className="space-y-2">
                    <Label>Attachments</Label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*,.pdf,.txt,.csv,.xlsx,.docx"
                      className="hidden"
                      onChange={(e) => {
                        handleFiles(e.target.files);
                        e.target.value = "";
                      }}
                      disabled={formState === "submitting"}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-primary"); }}
                      onDragLeave={(e) => { e.currentTarget.classList.remove("border-primary"); }}
                      onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("border-primary"); handleFiles(e.dataTransfer.files); }}
                      disabled={formState === "submitting" || files.length >= MAX_FILES}
                      className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/25 px-4 py-4 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ImagePlusIcon className="h-5 w-5" />
                      <span>Drop screenshots or files here, or click to browse</span>
                    </button>
                    <p className="text-xs text-muted-foreground">
                      Up to {MAX_FILES} files. Images, PDF, TXT, CSV, XLSX, DOCX. Max 15 MB each.
                    </p>

                    {/* File list */}
                    {files.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {files.map((file, idx) => (
                          <div
                            key={`${file.name}-${idx}`}
                            className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                          >
                            {file.type.startsWith("image/") ? (
                              <img
                                src={URL.createObjectURL(file)}
                                alt=""
                                className="h-8 w-8 shrink-0 rounded object-cover"
                              />
                            ) : (
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-bold uppercase text-muted-foreground">
                                {file.name.split(".").pop()}
                              </div>
                            )}
                            <span className="flex-1 truncate">{file.name}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {formatFileSize(file.size)}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeFile(idx)}
                              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              disabled={formState === "submitting"}
                            >
                              <XIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Error message */}
                  {formState === "error" && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
                      {errorMessage || "Something went wrong. Please try again."}
                    </div>
                  )}

                  {/* Submit */}
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={
                      formState === "submitting" ||
                      !subject.trim() ||
                      !description.trim()
                    }
                  >
                    {formState === "submitting" ? (
                      <>
                        <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <SendIcon className="mr-2 h-4 w-4" />
                        Submit Request
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
