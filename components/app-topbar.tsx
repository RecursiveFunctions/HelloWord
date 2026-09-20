"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Library, Settings } from "lucide-react";
import { Flashcards } from "@/components/icons/flashcards";
import { cn } from "@/lib/utils";

// Notebooks leads because it is where the app opens, from the root redirect and
// from the installed PWA's start_url alike.
const nav = [
  { href: "/notebooks", label: "Notebooks", icon: BookOpen },
  { href: "/library", label: "Library", icon: Library },
  { href: "/review", label: "Review", icon: Flashcards },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppTopbar({ dueCount }: { dueCount: number }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 h-(--topbar-h) shrink-0 border-b bg-sidebar text-sidebar-foreground">
      {/* Three columns rather than justify-between: the nav owns the middle
          track, so the buttons stay on the page's centre line instead of
          drifting with the width of the brand beside them. */}
      <div className="grid h-full grid-cols-[1fr_auto_1fr] items-center gap-2 px-4">
        <Link href="/notebooks" className="min-w-0">
          <div className="truncate font-heading text-base tracking-tight">
            HelloWord
          </div>
          {/* The side columns are only as wide as the centred nav leaves them,
              so the tagline waits for a width where it fits whole rather than
              showing up clipped. */}
          <p className="hidden truncate text-[11px] leading-3 text-muted-foreground lg:block">
            Incremental reading
          </p>
        </Link>

        <nav className="flex items-center gap-1">
          {nav.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {/* Labels fold away on narrow screens so all four stay on one
                    row; the icons keep every screen one tap away. */}
                <span className="hidden sm:inline">{item.label}</span>
                {item.href === "/review" && dueCount > 0 ? (
                  <span className="rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">
                    {dueCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div aria-hidden />
      </div>
    </header>
  );
}
