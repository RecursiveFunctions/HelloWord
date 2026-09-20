import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A titled block on a page: heading row (icon, title, actions) over a card.
 * Type scale used across screens: page title text-3xl, section title
 * text-xl/2xl, body text-base, secondary text-sm muted, nothing below text-xs.
 */
export function PageSection({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="flex items-center gap-3 font-heading text-xl tracking-tight sm:text-2xl">
          {Icon ? (
            <Icon className="size-6 shrink-0 text-primary" aria-hidden />
          ) : null}
          {title}
        </h2>
        {actions}
      </div>
      {description ? (
        <p className="mb-3 max-w-3xl leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      <div className="rounded-xl border bg-card p-5 text-base sm:p-6">
        {children}
      </div>
    </section>
  );
}
