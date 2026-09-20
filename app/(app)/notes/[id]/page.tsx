import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getNotebook } from "@/lib/store/notebooks";
import { getNote } from "@/lib/store/notes";
import { NoteWorkbench } from "./note-workbench";

export const dynamic = "force-dynamic";

export default async function NotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notebook?: string }>;
}) {
  const [{ id }, { notebook: notebookId }] = await Promise.all([
    params,
    searchParams,
  ]);
  const [note, notebook] = await Promise.all([
    getNote(id),
    notebookId ? getNotebook(notebookId) : null,
  ]);
  if (!note) notFound();

  return (
    <div className="space-y-8">
      <PageHeader
        className="mb-0"
        breadcrumb={[
          ...(notebook
            ? [
                { label: "Notebooks", href: "/notebooks" },
                { label: notebook.name, href: `/notebooks/${notebook.id}` },
              ]
            : [{ label: "Library", href: "/library" }]),
          { label: note.title },
        ]}
        meta={`${note.origin} · updated ${new Date(note.updated_at).toLocaleDateString()}`}
      />
      <NoteWorkbench key={note.id} initialNote={note} />
    </div>
  );
}
