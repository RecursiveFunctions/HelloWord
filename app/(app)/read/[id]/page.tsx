import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty";
import { listSourceExtracts, listSourceExtractsAny } from "@/lib/store/extracts";
import { getNotebook } from "@/lib/store/notebooks";
import { getNote, listExtractNotes } from "@/lib/store/notes";
import { storedPdfExists } from "@/lib/storage/pdf";
import { getSource } from "@/lib/store/sources";
import type { SourceRow } from "@/lib/store/types";
import { cn } from "@/lib/utils";
import { PdfFrame } from "./pdf-frame";
import { ReaderShell } from "./reader-shell";

export const dynamic = "force-dynamic";

function SourceHeader({
	source,
	detail,
	notebook,
}: {
	source: SourceRow;
	detail: string;
	notebook: { id: string; name: string } | null;
}) {
	return (
		<PageHeader
			className="mb-0 shrink-0 px-4 pt-6 pb-4 sm:px-6 lg:px-10"
			breadcrumb={[
				...(notebook
					? [
							{ label: "Notebooks", href: "/notebooks" },
							{ label: notebook.name, href: `/notebooks/${notebook.id}` },
						]
					: [{ label: "Library", href: "/library" }]),
				{ label: source.title },
			]}
			meta={detail}
		/>
	);
}

export default async function ReadPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ notebook?: string }>;
}) {
	const { id } = await params;
	const { notebook: notebookId } = await searchParams;
	const [source, rawExtracts, everyExtract, notebookRow] = await Promise.all([
		getSource(id),
		listSourceExtracts(id),
		listSourceExtractsAny(id),
		notebookId ? getNotebook(notebookId) : null,
	]);
	if (!source) notFound();
	const notebook = notebookRow
		? { id: notebookRow.id, name: notebookRow.name }
		: null;

	// Proposals the distiller made that nobody has kept or dismissed yet.
	const pendingProposals = everyExtract.filter(
		(e) => !e.accepted && e.queue_status === "queued",
	);

	const anchoredExtracts = rawExtracts.filter(
		(e) => e.anchor_status !== "detached",
	);

	const ready = source.ingest_status === "ready";
	const hasPdf = source.kind === "pdf" && (await storedPdfExists(source.storage_key));
	const wordLabel = source.word_count
		? `${source.word_count.toLocaleString()} words`
		: "word count pending";

	let detail = `${wordLabel} · ${anchoredExtracts.length} extracts anchored`;
	if (!ready) {
		detail =
			source.ingest_status === "failed"
				? (source.ingest_error ?? "Ingest failed.")
				: `Ingest ${source.ingest_status}`;
	} else if (source.kind === "pdf") {
		detail = hasPdf
			? `${wordLabel} · original PDF`
			: `${wordLabel} · original PDF was not stored`;
	}

	const pdfViewer =
		ready && source.kind === "pdf" && hasPdf && !source.markdown;
	const markdownReader = ready && Boolean(source.markdown);

	const linkedNoteId = (
		await listExtractNotes(rawExtracts.map(({ id: extractId }) => extractId))
	)[0]?.note_id;
	const note = linkedNoteId ? await getNote(linkedNoteId) : null;

	if (markdownReader) {
		return (
			<div
				data-full-bleed
				className="flex min-h-0 flex-1 flex-col overflow-hidden"
			>
				<SourceHeader
					source={source}
					detail={detail}
					notebook={notebook}
				/>
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
					<ReaderShell
						key={source.distill_status}
						source={{
							id: source.id,
							title: source.title,
							markdown: source.markdown!,
						}}
						initialExtracts={rawExtracts}
						initialProposals={pendingProposals}
						distill={{
							status: source.distill_status,
							error: source.distill_error,
						}}
						initialNote={note}
						pdfFileUrl={
							source.kind === "pdf" && hasPdf
								? `/api/sources/${source.id}/file`
								: undefined
						}
					/>
				</div>
			</div>
		);
	}

	return (
		<div
			data-full-bleed
			className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row"
		>
			<div
				className={cn(
					"flex min-h-0 min-w-0 flex-1 flex-col",
					pdfViewer && "max-lg:min-h-[58svh] max-lg:shrink-0 lg:min-h-0",
				)}
			>
				<SourceHeader
					source={source}
					detail={detail}
					notebook={notebook}
				/>

				<div
					className={cn(
						"relative min-h-0 flex-1 basis-0",
						pdfViewer && "min-h-[12rem]",
					)}
				>
					{!ready ? (
						<Empty className="h-full">
							<EmptyHeader>
								<EmptyTitle>
									{source.ingest_status === "failed"
										? "This source could not be extracted"
										: "Extracting this source"}
								</EmptyTitle>
								<EmptyDescription>
									{source.ingest_status === "failed"
										? (source.ingest_error ??
											"Ingest failed. The original file was kept if the upload succeeded.")
										: "Ingest is still running. The original file will open here when it is ready."}
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : pdfViewer ? (
						<PdfFrame
							src={`/api/sources/${source.id}/file`}
							title={source.title}
						/>
					) : source.kind === "pdf" ? (
						<Empty className="h-full">
							<EmptyHeader>
								<EmptyTitle>Original PDF is not available</EmptyTitle>
								<EmptyDescription>
									This source has extracted text, but the original file was
									never archived. Upload the PDF again to open the pages here.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						<Empty className="h-full">
							<EmptyHeader>
								<EmptyTitle>No markdown to read</EmptyTitle>
								<EmptyDescription>
									A ready source should always have markdown. Try ingesting
									this URL again from the Library.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					)}
				</div>
			</div>

		</div>
	);
}
