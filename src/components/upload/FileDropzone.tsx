"use client";

import { useRef, useState } from "react";

interface FileDropzoneProps {
  label: string;
  accept?: string;
  file: File | null;
  onChange: (file: File | null) => void;
}

export function FileDropzone({ label, accept, file, onChange }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  return (
    <div>
      <p className="mb-1 text-sm font-medium text-black">{label}</p>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) onChange(dropped);
        }}
        className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm transition-colors ${
          dragActive ? "border-samsung-blue bg-morning-sky" : "border-stone"
        }`}
      >
        {file ? (
          <p className="font-medium text-black">{file.name}</p>
        ) : (
          <p className="text-black/50">Click or drag a file here (PDF, PNG, JPEG)</p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
