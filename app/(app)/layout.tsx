import { AppSidebar } from "@/components/app-sidebar";
import { reviewQueue } from "@/lib/seed";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const dueCount = reviewQueue().length;

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
