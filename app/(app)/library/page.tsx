import { PageHeader } from "@/components/page-header";
import { listExtracts } from "@/lib/store/extracts";
import { listNotebooks } from "@/lib/store/notebooks";
import { listNotes } from "@/lib/store/notes";
import { listActivities } from "@/lib/store/review";
import { listSources } from "@/lib/store/sources";
import { AddSource } from "./add-source";
import { LibraryBrowser } from "./library-browser";
import {
  activityItem,
  extractItem,
  noteItem,
  sourceItem,
  type LibraryItem,
} from "./items";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const [sources, notes, extracts, activities, notebooks] = await Promise.all([
    listSources(),
    listNotes(),
    listExtracts(),
    listActivities(),
    listNotebooks(),
  ]);

  const items: LibraryItem[] = [
    ...sources.map(sourceItem),
    ...notes.map(noteItem),
    ...extracts.map(extractItem),
    ...activities.map(activityItem),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        title="Library"
        description="Browse your collection."
      />

      <AddSource />

      <LibraryBrowser
        items={items}
        notebooks={notebooks.map(({ id, name }) => ({ id, name }))}
      />
    </div>
  );
}
