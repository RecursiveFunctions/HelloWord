import { cn } from "@/lib/utils";

/** The HelloWord mark: an open book on a primary tile. Mirrors app/icon.svg. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      aria-hidden
      className={cn("size-10 shrink-0", className)}
    >
      <rect width="40" height="40" rx="10" className="fill-primary" />
      <g
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary-foreground"
      >
        <path d="M20 12.5v16" />
        <path d="M20 12.5c-2.2-1.7-5.2-2.2-8.5-1.6v15.6c3.3-.6 6.3-.1 8.5 1.6" />
        <path d="M20 12.5c2.2-1.7 5.2-2.2 8.5-1.6v15.6c-3.3-.6-6.3-.1-8.5 1.6" />
      </g>
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-3", className)}>
      <LogoMark />
      <span className="min-w-0">
        <span className="block truncate font-heading text-xl leading-tight font-semibold tracking-tight">
          HelloWord
        </span>
        <span className="hidden truncate text-xs leading-4 text-muted-foreground md:block">
          Incremental reading
        </span>
      </span>
    </span>
  );
}
