import { AppNav } from "@/components/app-nav";
import { Toaster } from "@/components/ui/toast";
import { dueCounts } from "@/lib/fsrs/queue";
import { readingDueCount } from "@/lib/reading/queue";

async function badge(name: string, count: () => Promise<number>): Promise<number> {
  try {
    return await count();
  } catch (error) {
    console.error(`Could not count the ${name} badge`, error);
    return 0;
  }
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Same source of truth as the Review screen. Counting against the frozen
  // seed clock instead would put a different number in the badge than the one
  // the queue actually serves.
  //
  // The badges are decoration and this layout wraps every screen, so a count
  // that cannot be computed is a missing badge, not a 500 on all of them.
  const [dueCount, readCount] = await Promise.all([
    badge("review", async () => (await dueCounts()).total),
    badge("read", readingDueCount),
  ]);

  return (
    <Toaster>
      <div className="flex min-h-svh flex-col md:pl-[calc(var(--rail-w)+env(safe-area-inset-left))]">
        <AppNav dueCount={dueCount} readCount={readCount} />
        {/* Ordinary pages grow with content and scroll on the window. Full-bleed
            readers lock to the viewport beside the rail so panes and PDFs get
            a bounded height. */}
        <div className="min-w-0 flex-1 bg-background pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-(--bottombar-h) has-[[data-full-bleed]]:flex has-[[data-full-bleed]]:h-[calc(100svh-var(--bottombar-h))] has-[[data-full-bleed]]:max-h-[calc(100svh-var(--bottombar-h))] has-[[data-full-bleed]]:min-h-0 has-[[data-full-bleed]]:flex-col has-[[data-full-bleed]]:overflow-hidden has-[[data-full-bleed]]:pb-0">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10 has-[[data-full-bleed]]:flex has-[[data-full-bleed]]:h-full has-[[data-full-bleed]]:min-h-0 has-[[data-full-bleed]]:max-w-none has-[[data-full-bleed]]:flex-1 has-[[data-full-bleed]]:overflow-hidden has-[[data-full-bleed]]:p-0">
            {children}
          </div>
        </div>
      </div>
    </Toaster>
  );
}
