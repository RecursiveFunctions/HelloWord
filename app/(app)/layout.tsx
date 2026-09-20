import { AppTopbar } from "@/components/app-topbar";
import { dueCounts } from "@/lib/fsrs/queue";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Same source of truth as the Review screen. Counting against the frozen
  // seed clock instead would put a different number in the badge than the one
  // the queue actually serves.
  const { total: dueCount } = await dueCounts();

  return (
    <div className="flex min-h-svh flex-col">
      <AppTopbar dueCount={dueCount} />
      {/* Ordinary pages grow with content and scroll on the window. Full-bleed
          readers lock to the viewport under the top bar so panes and PDFs get
          a bounded height. */}
      <div className="min-w-0 flex-1 bg-background has-[[data-full-bleed]]:flex has-[[data-full-bleed]]:h-[calc(100svh-var(--topbar-h))] has-[[data-full-bleed]]:max-h-[calc(100svh-var(--topbar-h))] has-[[data-full-bleed]]:min-h-0 has-[[data-full-bleed]]:flex-col has-[[data-full-bleed]]:overflow-hidden">
        <div className="mx-auto w-full max-w-5xl px-8 py-8 has-[[data-full-bleed]]:flex has-[[data-full-bleed]]:h-full has-[[data-full-bleed]]:min-h-0 has-[[data-full-bleed]]:flex-1 has-[[data-full-bleed]]:max-w-none has-[[data-full-bleed]]:overflow-hidden has-[[data-full-bleed]]:p-0">
          {children}
        </div>
      </div>
    </div>
  );
}
