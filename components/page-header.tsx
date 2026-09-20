import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Crumb = { label: string; href?: string; icon?: ReactNode };

/**
 * The one header every screen uses, so titles share a left edge and rhythm.
 * Nested screens pass a breadcrumb: the trail is the heading, ancestors are
 * large tappable links and the last crumb is the page title.
 */
export function PageHeader({
  breadcrumb,
  title,
  description,
  meta,
  actions,
  className,
}: {
  breadcrumb?: Crumb[];
  /** Top-level pages only; nested pages use the last breadcrumb instead. */
  title?: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const heading =
    "font-heading text-3xl font-semibold tracking-tight sm:text-4xl";

  return (
    <header className={cn("mb-8", className)}>
      {title || breadcrumb?.length || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          {breadcrumb?.length ? (
            <nav aria-label="Breadcrumb" className="min-w-0">
              <h1 className={heading}>
                <ol className="flex flex-wrap items-center gap-x-1.5">
                  {breadcrumb.map((crumb, i) => {
                    const last = i === breadcrumb.length - 1;
                    return (
                      <li
                        key={`${i}:${crumb.label}`}
                        className="flex min-w-0 items-center gap-1.5"
                      >
                        {crumb.href && !last ? (
                          <Link
                            href={crumb.href}
                            className="-mx-1 rounded px-1 py-1.5 text-muted-foreground hover:text-foreground hover:underline"
                          >
                            {crumb.label}
                          </Link>
                        ) : (
                          <span
                            aria-current={last ? "page" : undefined}
                            className="flex min-w-0 items-center gap-3 py-1.5"
                          >
                            {crumb.icon}
                            <span className="line-clamp-2 break-words">
                              {crumb.label}
                            </span>
                          </span>
                        )}
                        {last ? null : (
                          <ChevronRight
                            className="size-5 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                        )}
                      </li>
                    );
                  })}
                </ol>
              </h1>
            </nav>
          ) : title ? (
            <h1 className={cn(heading, "flex min-w-0 items-center gap-3 py-1.5")}>
              {title}
            </h1>
          ) : (
            <span />
          )}
          {actions ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}
      {description ? (
        <p className="mt-2 max-w-2xl text-lg text-muted-foreground">{description}</p>
      ) : null}
      {meta ? (
        <p className="mt-1 truncate text-xs text-muted-foreground">{meta}</p>
      ) : null}
    </header>
  );
}
