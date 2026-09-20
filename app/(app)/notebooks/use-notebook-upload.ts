"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { SUPPORTED_LABEL, uploadFile } from "@/lib/client/upload";

export type UploadNotice = { tone: "info" | "error"; text: string };

/**
 * Uploads dropped or picked files into one notebook. Each file is created in
 * the library and linked to the notebook by the API in a single request.
 */
export function useNotebookUpload(notebookId: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<UploadNotice | null>(null);

  const upload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setBusy(true);
      setNotice(null);

      const errors: string[] = [];
      let added = 0;
      for (const file of files) {
        const result = await uploadFile(file, { notebookId });
        if (result.ok) added += 1;
        else errors.push(result.error);
      }

      setBusy(false);
      if (errors.length > 0) {
        setNotice({
          tone: "error",
          text:
            errors.length === files.length
              ? errors[0]
              : `Added ${added} of ${files.length}. ${errors[0]}`,
        });
      } else {
        setNotice({
          tone: "info",
          text: `Added ${added} ${added === 1 ? "file" : "files"} to this notebook and your library.`,
        });
      }
      if (added > 0) router.refresh();
    },
    [notebookId, router],
  );

  return {
    upload,
    busy,
    notice,
    clearNotice: () => setNotice(null),
    supported: SUPPORTED_LABEL,
  };
}

const hasFiles = (event: DragEvent) =>
  Array.from(event.dataTransfer?.types ?? []).includes("Files");

/** Drag-and-drop handlers for an element, tolerant of child enter/leave noise. */
export function useFileDrop(onFiles: (files: File[]) => void) {
  const [active, setActive] = useState(false);
  const depth = useRef(0);

  const handlers = {
    onDragEnter(event: DragEvent) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setActive(true);
    },
    onDragOver(event: DragEvent) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onDragLeave(event: DragEvent) {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    },
    onDrop(event: DragEvent) {
      if (!hasFiles(event)) return;
      // Without this the browser navigates to the dropped file, or into the
      // card's link, abandoning the page.
      event.preventDefault();
      event.stopPropagation();
      depth.current = 0;
      setActive(false);
      onFiles(Array.from(event.dataTransfer.files));
    },
  };

  return { active, handlers };
}
