"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Library, ListOrdered, Settings } from "lucide-react";
import { Flashcards } from "@/components/icons/flashcards";
import { HistoryShortcuts } from "@/components/history-menu";
import { LogoMark } from "@/components/logo";
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

export function AppNav({
  dueCount,
  readCount,
}: {
  dueCount: number;
  readCount: number;
}) {
  const pathname = usePathname();
  const badges: Record<string, number> = { "/review": dueCount, "/read": readCount };
  const main = nav.filter((item) => item.href !== "/settings");
  const settings = nav[nav.length - 1];

  function railItem(item: (typeof nav)[number]) {
    const active = isActive(pathname, item.href);
    const Icon = item.icon;
    const count = badges[item.href] ?? 0;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        aria-label={count > 0 ? `${item.label}, ${count} due` : undefined}
        className={cn(
          // Narrow rail: icon over label. Wide rail: icon beside label.
          "relative flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-medium transition-colors outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring xl:min-h-12 xl:flex-row xl:justify-start xl:gap-3 xl:px-4 xl:text-base",
          active
            ? "bg-accent-soft text-accent-strong"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <span className="relative">
          <Icon className="size-6 shrink-0" aria-hidden />
          {count > 0 ? (
            <span
              aria-hidden
              className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground xl:hidden"
            >
              {count}
            </span>
          ) : null}
        </span>
        <span className="truncate">{item.label}</span>
        {count > 0 ? (
          <span
            aria-hidden
            className="ml-auto hidden h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground xl:flex"
          >
            {count}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <>
      <HistoryShortcuts />

      {/* Tablet and up: a slim rail on the left, like a native notes app. */}
      <aside
        aria-label="Sidebar"
        className="fixed inset-y-0 left-0 z-40 hidden w-[calc(var(--rail-w)+env(safe-area-inset-left))] flex-col border-r bg-sidebar/90 pt-[max(1rem,env(safe-area-inset-top))] pr-3 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[calc(0.75rem+env(safe-area-inset-left))] text-sidebar-foreground backdrop-blur-xl md:flex"
      >
        <Link
          href="/notebooks"
          aria-label="HelloWord home"
          className="mb-6 flex items-center justify-center gap-3 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring xl:justify-start xl:px-2"
        >
          <LogoMark className="size-10" />
          <span className="hidden font-heading text-xl font-semibold tracking-tight xl:block">
            HelloWord
          </span>
        </Link>

        <nav aria-label="Main" className="flex flex-1 flex-col gap-1.5">
          {main.map(railItem)}
        </nav>

        <nav aria-label="Preferences">{railItem(settings)}</nav>
      </aside>

      {/* Phones: the tabs live at the bottom, where thumbs already are. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 grid h-(--bottombar-h) grid-cols-5 border-t bg-sidebar/90 px-2 pb-[env(safe-area-inset-bottom)] text-sidebar-foreground backdrop-blur-xl md:hidden"
      >
        {nav.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          const count = badges[item.href] ?? 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={count > 0 ? `${item.label}, ${count} due` : undefined}
              className="flex flex-col items-center justify-center gap-1 text-[11px] font-medium outline-none"
            >
              <span
                className={cn(
                  "relative grid h-8 w-14 place-items-center rounded-full transition-colors",
                  active
                    ? "bg-accent-soft text-accent-strong"
                    : "text-muted-foreground",
                )}
              >
                <Icon className="size-6" aria-hidden />
                {count > 0 ? (
                  <span
                    aria-hidden
                    className="absolute top-0 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
                  >
                    {count}
                  </span>
                ) : null}
              </span>
              <span
                className={active ? "text-accent-strong" : "text-muted-foreground"}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
