"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Library, ListOrdered, Settings } from "lucide-react";
import { Flashcards } from "@/components/icons/flashcards";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

// Notebooks leads because it is where the app opens, from the root redirect and
// from the installed PWA's start_url alike.
const nav = [
  { href: "/notebooks", label: "Notebooks", icon: BookOpen },
  { href: "/library", label: "Library", icon: Library },
  // Read before Review: passages are read, distilled, and only then recalled.
  { href: "/read", label: "Read", icon: ListOrdered },
  { href: "/review", label: "Review", icon: Flashcards },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function DueBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
      {count}
    </span>
  );
}

export function AppTopbar({
  dueCount,
  readCount,
}: {
  dueCount: number;
  readCount: number;
}) {
  const pathname = usePathname();
  const badges: Record<string, number> = { "/review": dueCount, "/read": readCount };

  return (
    <>
      <header className="sticky top-0 z-40 h-(--topbar-h) shrink-0 border-b bg-sidebar text-sidebar-foreground">
        {/* Three columns rather than justify-between: the nav owns the middle
            track, so the tabs stay on the page's centre line instead of
            drifting with the width of the brand beside them. */}
        <div className="grid h-full grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 sm:px-6 lg:px-10">
          <Link href="/notebooks" aria-label="HelloWord home" className="min-w-0">
            <Logo />
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-2 md:flex">
            {nav.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-12 items-center gap-2.5 rounded-xl px-5 text-base transition-colors",
                    active
                      ? "bg-primary/10 font-semibold text-foreground ring-1 ring-primary/30"
                      : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-6 shrink-0", active && "text-primary")} />
                  {item.label}
                  <DueBadge count={badges[item.href] ?? 0} />
                </Link>
              );
            })}
          </nav>

          <div aria-hidden />
        </div>
      </header>

      {/* Phones: the tabs live at the bottom, where thumbs already are. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 grid h-(--bottombar-h) grid-cols-5 border-t bg-sidebar pb-[env(safe-area-inset-bottom)] text-sidebar-foreground md:hidden"
      >
        {nav.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 text-xs transition-colors",
                active
                  ? "font-semibold text-foreground before:absolute before:inset-x-6 before:top-0 before:h-0.5 before:rounded-full before:bg-primary"
                  : "text-muted-foreground",
              )}
            >
              <span className="relative">
                <Icon className={cn("size-6", active && "text-primary")} />
                {(badges[item.href] ?? 0) > 0 ? (
                  <span className="absolute -top-1.5 left-3.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                    {badges[item.href]}
                  </span>
                ) : null}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
