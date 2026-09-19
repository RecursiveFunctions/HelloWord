import { activities, extracts, notes } from "@/lib/seed";
import { listNotebooks } from "@/lib/store/notebooks";
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
  // Sources are workstream A's, so they come from the store. Notes, extracts,
  // and activities still read the seed until B, C, and D land their tables.
  const [sources, notebooks] = await Promise.all([
    listSources(),
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
      <header>
        <h1 className="font-heading text-3xl tracking-tight">Library</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Everything that exists, globally. Select any mix of sources, notes,
          extracts, and activities and add them to a notebook — membership is a
          reference, so one item can live in several.
        </p>
      </header>

      <AddSource />

      <LibraryBrowser
        items={items}
        notebooks={notebooks.map(({ id, name }) => ({ id, name }))}
      />
    </div>
  );
}
