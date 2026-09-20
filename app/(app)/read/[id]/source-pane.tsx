"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  MD_OFFSET_ATTR,
  parseBlocks,
  type Block,
  type InlineSpan,
} from "@/lib/editor/blocks";
import {
  clearHighlight,
  offsetAtPoint,
  offsetsForSelection,
  paintHighlight,
  rangesForOffsets,
  supportsCustomHighlight,
} from "@/lib/anchor/dom";
import { condense } from "@/lib/reader/condense";
import "./reader.css";

/** Minimal shape the pane needs; the full extract row carries much more. */
export type PaintedExtract = {
  id: string;
  start: number;
  end: number;
  orphaned?: boolean;
};

type SourcePaneProps = {
  markdown: string;
  extracts: readonly PaintedExtract[];
  proposals?: readonly PaintedExtract[];
  /**
   * Show only the blocks that carry an extract or proposal, folding the rest
   * into "N words hidden" gaps. A view over the same blocks: no offset moves.
   */
  condensed?: boolean;
  activeExtractId?: string | null;
  onActivateExtract?: (id: string | null) => void;
  onSelectionChange?: (selection: { start: number; end: number } | null) => void;
  onSelectionMenu?: (position: { x: number; y: number }) => void;
};

/** One source-tagged run of text. The attribute is what `lib/anchor/dom` queries. */
function Span({ span }: { span: InlineSpan }) {
  return <span {...{ [MD_OFFSET_ATTR]: span.start }}>{span.text}</span>;
}

/** Render lines with the separator that actually sits between them in the source. */
function Lines({ lines, separator }: { lines: InlineSpan[]; separator: string }) {
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={line.start}>
          {i > 0 && separator}
          <Span span={line} />
        </Fragment>
      ))}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "heading": {
      const Tag = `h${Math.min(block.level, 6)}` as "h1";
      const size =
        block.level === 1
          ? "text-3xl"
          : block.level === 2
            ? "text-2xl"
            : block.level === 3
              ? "text-xl"
              : "text-lg";
      return (
        <Tag className={`mt-8 mb-3 font-heading tracking-tight first:mt-0 ${size}`}>
          <Span span={block.span} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p className="my-4 font-serif text-[17px] leading-8">
          <Lines lines={block.lines} separator=" " />
        </p>
      );
    case "blockquote":
      return (
        <blockquote className="my-5 border-l-2 border-primary/40 pl-4 font-serif text-[17px] leading-8 text-muted-foreground italic">
          <Lines lines={block.lines} separator=" " />
        </blockquote>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag
          className={`my-4 space-y-1 pl-6 font-serif text-[17px] leading-8 ${
            block.ordered ? "list-decimal" : "list-disc"
          }`}
        >
          {block.items.map((item) => (
            <li key={item.start}>
              <Span span={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case "code":
      return (
        <pre className="my-5 overflow-x-auto rounded-lg border bg-muted px-4 py-3 font-mono text-sm whitespace-pre">
          <code>
            <Lines lines={block.lines} separator={"\n"} />
          </code>
        </pre>
      );
    case "hr":
      return <hr className="my-8" />;
  }
}

/**
 * Left pane of the reader: the source markdown, with extracts painted over it.
 *
 * Text is rendered verbatim and never wrapped per-extract, so highlights can
 * overlap and be repainted without touching the DOM the offsets depend on.
 */
export function SourcePane({
  markdown,
  extracts,
  proposals = [],
  condensed = false,
  activeExtractId,
  onActivateExtract,
  onSelectionChange,
  onSelectionMenu,
}: SourcePaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const blocks = useMemo(() => parseBlocks(markdown), [markdown]);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const items = useMemo(
    () =>
      condensed
        ? condense(blocks, [...extracts, ...proposals], expanded)
        : blocks.map((block) => ({ kind: "block" as const, block })),
    [blocks, condensed, extracts, proposals, expanded],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Set after mount: the server cannot know whether the API exists, and
    // rendering the answer would be a hydration mismatch.
    container.dataset.highlightSupport = String(supportsCustomHighlight());

    const anchored = extracts.filter((e) => !e.orphaned && e.id !== activeExtractId);
    const orphaned = extracts.filter((e) => e.orphaned && e.id !== activeExtractId);
    const active = extracts.filter((e) => e.id === activeExtractId);

    const paint = (name: string, group: readonly PaintedExtract[]) => {
      const ranges = [...rangesForOffsets(container, group).values()];
      paintHighlight(name, ranges);
    };

    paint("extract", anchored);
    paint("extract-orphaned", orphaned);
    paint("extract-active", active);
    paint("extract-proposal", proposals);

    return () => {
      clearHighlight("extract");
      clearHighlight("extract-orphaned");
      clearHighlight("extract-active");
      clearHighlight("extract-proposal");
    };
    // `items`, not `blocks`: opening a gap adds spans that need painting.
  }, [items, extracts, proposals, activeExtractId]);

  // Painted highlights are not elements, so hit-testing uses the markdown
  // offset under the pointer, not the start of the clicked block.
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!onActivateExtract) return;
    const container = containerRef.current;
    if (!container) return;
    const offset = offsetAtPoint(container, event.clientX, event.clientY);
    if (offset === null) {
      onActivateExtract(null);
      return;
    }
    const hit = extracts.find((e) => e.start <= offset && offset < e.end);
    onActivateExtract(hit?.id ?? null);
  };

  const captureSelection = () => {
    const container = containerRef.current;
    if (!container) return;
    onSelectionChange?.(offsetsForSelection(container));
  };

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container || !offsetsForSelection(container)) return;
    event.preventDefault();
    captureSelection();
    onSelectionMenu?.({ x: event.clientX, y: event.clientY });
  };

  return (
    <div
      ref={containerRef}
      className="reader-source"
      onClick={handleClick}
      onMouseUp={captureSelection}
      onTouchEnd={captureSelection}
      onContextMenu={handleContextMenu}
    >
      {items.map((item) =>
        item.kind === "block" ? (
          <BlockView key={`${item.block.kind}-${item.block.start}`} block={item.block} />
        ) : (
          <button
            key={`gap-${item.start}`}
            type="button"
            className="my-3 flex w-full items-center gap-3 text-xs text-muted-foreground select-none before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((current) => new Set(current).add(item.start));
            }}
          >
            {item.words.toLocaleString()} word{item.words === 1 ? "" : "s"} hidden
          </button>
        ),
      )}
    </div>
  );
}
