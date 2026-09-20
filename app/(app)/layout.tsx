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
    <div className="flex h-svh min-h-0 flex-col">
      <AppTopbar dueCount={dueCount} />
      {/* Remaining viewport under the top bar. Ordinary pages scroll here;
          a full-bleed reader fills the box so the PDF iframe has a real height. */}
      <div className="min-h-0 min-w-0 flex-1 overflow-auto bg-background has-[[data-full-bleed]]:flex has-[[data-full-bleed]]:flex-col has-[[data-full-bleed]]:overflow-hidden">
        <div className="mx-auto w-full max-w-5xl px-8 py-8 has-[[data-full-bleed]]:flex has-[[data-full-bleed]]:min-h-0 has-[[data-full-bleed]]:flex-1 has-[[data-full-bleed]]:max-w-none has-[[data-full-bleed]]:overflow-hidden has-[[data-full-bleed]]:p-0">
          {children}
        </div>
      </div>
    </div>
  );
}
