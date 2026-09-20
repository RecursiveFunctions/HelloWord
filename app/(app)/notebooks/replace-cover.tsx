"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export async function uploadNotebookCover(
  notebookId: string,
  file: File,
): Promise<string | null> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`/api/notebooks/${notebookId}/cover`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return (body as { error?: string }).error ?? "Could not save that screenshot.";
  }
  return null;
}

export function ReplaceCover({ notebookId }: { notebookId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    const message = await uploadNotebookCover(notebookId, file);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-3 flex flex-col items-start gap-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
        className="sr-only"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void onFile(file);
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Spinner /> : null}
        Replace screenshot
      </Button>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
