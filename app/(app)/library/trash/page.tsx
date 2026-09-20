import { PageHeader } from "@/components/page-header";
import {
  daysUntilPurge,
  listTrash,
  purgeExpired,
  TRASH_RETENTION_DAYS,
} from "@/lib/store/trash";
import {
  activityItem,
  extractItem,
  noteItem,
  sourceItem,
} from "../items";
import { TrashList, type TrashRowModel } from "./trash-list";

export const dynamic = "force-dynamic";

export default async function TrashPage() {
  // Expiry is checked whenever the trash is opened, so there is no scheduler.
  await purgeExpired();
  const entries = await listTrash();

  const rows: TrashRowModel[] = entries.map((entry) => {
    const base =
      entry.type === "notebook"
        ? {
            title: entry.row.name,
            subtitle: entry.row.description ?? "",
            meta: [] as string[],
          }
        : entry.type === "source"
          ? sourceItem(entry.row)
          : entry.type === "note"
            ? noteItem(entry.row)
            : entry.type === "extract"
              ? extractItem(entry.row)
              : activityItem(entry.row);

    return {
      type: entry.type,
      id: entry.row.id,
      title: base.title,
      subtitle: base.subtitle,
      meta: base.meta,
      deletedAt: entry.deleted_at,
      daysLeft: daysUntilPurge(entry.deleted_at),
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        breadcrumb={[
          { label: "Library", href: "/library" },
          { label: "Recently deleted" },
        ]}
        description={`Deleted items stay here for ${TRASH_RETENTION_DAYS} days, then are removed for good. Restoring a source or note brings back its extracts and cards too.`}
      />
      <TrashList rows={rows} />
    </div>
  );
}
