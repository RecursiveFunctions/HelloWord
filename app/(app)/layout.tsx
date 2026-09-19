import { AppSidebar } from "@/components/app-sidebar";
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
    <div className="flex min-h-full">
      <AppSidebar dueCount={dueCount} />
      <div className="min-w-0 flex-1 bg-background">
        {/* The reader needs the full width for two panes, so a page can opt out
            of the reading-width container by marking its root full-bleed. */}
        <div className="mx-auto w-full max-w-5xl px-8 py-8 has-[[data-full-bleed]]:max-w-none has-[[data-full-bleed]]:p-0">
          {children}
        </div>
      </div>
    </div>
  );
}
