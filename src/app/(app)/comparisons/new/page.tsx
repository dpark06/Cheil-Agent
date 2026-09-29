"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FileDropzone } from "@/components/upload/FileDropzone";

export default function NewComparisonPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [previous, setPrevious] = useState<File | null>(null);
  const [next, setNext] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!previous || !next) {
      setError("Select both a previous and new version file.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.set("title", title);
    formData.set("context", context);
    formData.set("previous", previous);
    formData.set("new", next);

    try {
      const res = await fetch("/api/comparisons", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setSubmitting(false);
        return;
      }
      router.push(`/comparisons/${data.id}`);
    } catch {
      setError("Upload failed. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h2 className="mb-6 text-xl font-semibold text-black">New comparison</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <p className="rounded-md bg-pulse/10 px-3 py-2 text-sm text-pulse">{error}</p>
        )}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-black">
            Title
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="e.g. Q3 campaign deck — round 2"
            className="mt-1 w-full rounded-md border border-stone px-3 py-2 text-sm focus:border-samsung-blue focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="context" className="block text-sm font-medium text-black">
            Context for reviewers <span className="text-black/40">(optional)</span>
          </label>
          <textarea
            id="context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Anything reviewers should know — e.g. what prompted this revision, known constraints..."
            className="mt-1 w-full rounded-md border border-stone px-3 py-2 text-sm focus:border-samsung-blue focus:outline-none"
          />
        </div>
        <FileDropzone
          label="Previous version"
          accept=".pdf,.png,.jpg,.jpeg"
          file={previous}
          onChange={setPrevious}
        />
        <FileDropzone
          label="New version"
          accept=".pdf,.png,.jpg,.jpeg"
          file={next}
          onChange={setNext}
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-samsung-blue px-4 py-2 text-sm font-medium text-white hover:bg-harbor-blue disabled:opacity-50"
        >
          {submitting ? "Uploading…" : "Upload & compare"}
        </button>
      </form>
    </div>
  );
}
