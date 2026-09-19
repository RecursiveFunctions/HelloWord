export function MarkdownPreview({
  markdown,
  className,
}: {
  markdown: string;
  className?: string;
}) {
  return (
    <div
      className={
        className ??
        "font-serif text-[15px] leading-7 whitespace-pre-wrap text-foreground"
      }
    >
      {markdown}
    </div>
  );
}
