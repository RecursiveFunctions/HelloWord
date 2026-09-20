"use client";

import { useState } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

export function PdfFrame({ src, title }: { src: string; title: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyTitle>Could not display this PDF</EmptyTitle>
          <EmptyDescription>
            The file is stored, but the browser did not render it. Try opening
            this page in Chrome or Edge.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <iframe
      src={src}
      title={title}
      className="h-full w-full border-0 bg-muted"
      onError={() => setFailed(true)}
    />
  );
}
