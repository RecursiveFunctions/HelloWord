"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, GraduationCap, Library, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/notebooks", label: "Notebooks", icon: BookOpen },
  { href: "/library", label: "Library", icon: Library },
  { href: "/review", label: "Review", icon: GraduationCap },
];

export function AppSidebar({ dueCount }: { dueCount: number }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="px-5 pt-6 pb-4">
        <Link href="/notebooks" className="block">
          <div className="font-heading text-lg tracking-tight">HelloWord</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Incremental reading
          </p>
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {nav.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              <span className="flex-1">{item.label}</span>
              {item.href === "/review" && dueCount > 0 ? (
                <span className="rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">
                  {dueCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="border-t px-3 py-3">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
            pathname.startsWith("/settings") &&
              "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
          )}
        >
          <Settings className="size-4" />
          Settings
        </Link>
        <p className="mt-2 px-3 text-[11px] leading-4 text-muted-foreground">
          Seed fixtures. Set <code className="font-mono">AI_MOCK=1</code> until
          C&apos;s client is live.
        </p>
      </div>
    </aside>
  );
}
