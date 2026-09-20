"use client";

import { useState } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

/** Fills a `relative` flex child with bounded height from the reader layout. */
export function PdfFrame({ src, title }: { src: string; title: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <Empty className="absolute inset-0 flex h-full items-center justify-center p-4">
        <EmptyHeader>
          <EmptyTitle>Could not display this PDF</EmptyTitle>
          <EmptyDescription>
            The file is stored, but the browser did not render it. Try Chrome or
            Edge, or{" "}
            <a href={src} target="_blank" rel="noreferrer" className="underline">
              open the PDF in a new tab
            </a>
            .
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <iframe
      src={src}
      title={title}
      className="absolute inset-0 size-full border-0 bg-muted"
      onError={() => setFailed(true)}
    />
  );
}
