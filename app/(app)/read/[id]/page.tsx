import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty";
import extractProposals from "@/lib/ai/__fixtures__/extract-proposals.json";
import { parseBlocks } from "@/lib/editor/blocks";
import { extractNotes, notes } from "@/lib/seed";
import { listSourceExtracts } from "@/lib/store/extracts";
import { getNote } from "@/lib/store/notes";
import { storedPdfExists } from "@/lib/storage/pdf";
import { getSource } from "@/lib/store/sources";
import type { SourceRow } from "@/lib/store/types";
import { cn } from "@/lib/utils";
import { PdfFrame } from "./pdf-frame";
import { ReaderShell } from "./reader-shell";

export const dynamic = "force-dynamic";

/** Most ingested sources open with their own H1, so avoid printing it twice. */
function documentLeadsWithTitle(markdown: string, title: string): boolean {
	const [first] = parseBlocks(markdown);
	return (
		first?.kind === "heading" &&
		first.level === 1 &&
		first.span.text.trim().toLowerCase() === title.trim().toLowerCase()
	);
}

function SourceHeader({
	source,
	detail,
	showTitle,
}: {
	source: SourceRow;
	detail: string;
	showTitle: boolean;
}) {
	return (
		<header className="shrink-0 px-4 py-3 sm:px-6 sm:py-4 lg:px-10 lg:py-5">
			<p className="truncate text-sm text-muted-foreground">
				<Link href="/notebooks" className="hover:underline">
					HelloWord
				</Link>
				<span className="mx-2">/</span>
				<Link href="/library" className="hover:underline">
					Library
				</Link>
				<span className="mx-2">/</span>
				{source.kind}
				{source.ingest_method ? ` · ${source.ingest_method}` : ""}
			</p>
			{showTitle ? (
				<h1 className="mt-1 line-clamp-2 font-heading text-xl tracking-tight sm:mt-2 sm:text-2xl lg:text-3xl">
					{source.title}
				</h1>
			) : null}
			<p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
		</header>
	);
}

/** Placeholder rail while PDFs use the iframe viewer instead of SourcePane. */
function PdfNoteRail() {
	return (
		<aside className="max-h-[min(40svh,24rem)] w-full shrink-0 overflow-auto border-t bg-sidebar px-4 py-5 sm:px-5 sm:py-6 lg:max-h-none lg:w-80 lg:border-t-0 lg:border-l xl:w-[28rem]">
			<h2 className="font-heading text-lg">Note editor</h2>
			<p className="mt-2 text-sm text-muted-foreground">
				Tiptap lands here next. Seeded notes and fixture proposals sit below so
				the rail is not empty.
			</p>
			<div className="mt-6 space-y-3">
				{notes.slice(0, 3).map((note) => (
					<div key={note.id} className="rounded-lg border bg-card p-3">
						<div className="flex items-center gap-2">
							<span className="text-sm font-medium">{note.title}</span>
							<Badge variant="outline">{note.origin}</Badge>
						</div>
						<p className="mt-1 text-sm text-muted-foreground">
							{note.body_md.trim()}
						</p>
					</div>
				))}
			</div>
			<h3 className="mt-8 mb-2 text-sm font-medium">
				Margin proposals (fixture)
			</h3>
			<ul className="space-y-2">
				{extractProposals.map((proposal) => (
					<li
						key={proposal.exact}
						className="rounded-lg border bg-card p-3 text-sm"
					>
						<div className="mb-1 flex justify-between text-xs text-muted-foreground">
							<span>priority {proposal.priority}</span>
							<span>{proposal.concepts.join(", ")}</span>
						</div>
						<p className="font-serif">{proposal.exact}</p>
						<p className="mt-1 text-muted-foreground">{proposal.reason}</p>
					</li>
				))}
			</ul>
		</aside>
	);
}

export default async function ReadPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const [source, rawExtracts] = await Promise.all([
		getSource(id),
		listSourceExtracts(id),
	]);
	if (!source) notFound();

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

	const showTitle =
		source.kind === "pdf" ||
		!source.markdown ||
		!documentLeadsWithTitle(source.markdown, source.title);
	const linkedNoteId = extractNotes.find(({ extract_id }) =>
		rawExtracts.some(({ id: extractId }) => extractId === extract_id),
	)?.note_id;
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
					showTitle={showTitle}
				/>
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
					<ReaderShell
						source={{
							id: source.id,
							title: source.title,
							markdown: source.markdown!,
						}}
						initialExtracts={rawExtracts}
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
					showTitle={showTitle}
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

			{pdfViewer ? <PdfNoteRail /> : null}
		</div>
	);
}
