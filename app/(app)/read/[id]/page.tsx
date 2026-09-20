import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty";
import { extracts, notes } from "@/lib/seed";
import extractProposals from "@/lib/ai/__fixtures__/extract-proposals.json";
import { parseBlocks } from "@/lib/editor/blocks";
import { storedPdfExists } from "@/lib/storage/pdf";
import { getSource } from "@/lib/store/sources";
import type { SourceRow } from "@/lib/store/types";
import { PdfFrame } from "./pdf-frame";
import { SourcePane } from "./source-pane";

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
		<header className="shrink-0 px-10 py-6">
			<p className="text-sm text-muted-foreground">
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
				<h1 className="mt-2 font-heading text-3xl tracking-tight">
					{source.title}
				</h1>
			) : null}
			<p className="mt-1 text-xs text-muted-foreground">{detail}</p>
		</header>
	);
}

function NoteRail() {
	return (
		<aside className="w-[28rem] shrink-0 overflow-auto border-l bg-sidebar px-5 py-8">
			<h2 className="font-heading text-lg">Note editor</h2>
			<p className="mt-2 text-sm text-muted-foreground">
				Tiptap lands here next. Seeded notes and C&apos;s fixture proposals
				sit below so the rail is not empty.
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
			<p className="mt-4 text-xs text-muted-foreground">
				Swap this JSON for{" "}
				<code className="font-mono">POST /api/ai/extracts</code> in wave 2.
			</p>
		</aside>
	);
}

export default async function ReadPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const source = await getSource(id);
	if (!source) notFound();

	const sourceExtracts = extracts
		.filter((e) => e.source_id === id && e.anchor_status !== "detached")
		.map((e) => ({
			id: e.id,
			start: e.selector.start,
			end: e.selector.end,
			orphaned: e.anchor_status === "orphaned",
		}));

	const ready = source.ingest_status === "ready";
	const hasPdf = source.kind === "pdf" && (await storedPdfExists(source.storage_key));
	const wordLabel = source.word_count
		? `${source.word_count.toLocaleString()} words`
		: "word count pending";

	let detail = `${wordLabel} · ${sourceExtracts.length} extracts anchored`;
	if (!ready) {
		detail =
			source.ingest_status === "failed"
				? source.ingest_error ?? "Ingest failed."
				: `Ingest ${source.ingest_status}`;
	} else if (source.kind === "pdf") {
		detail = hasPdf
			? `${wordLabel} · original PDF`
			: `${wordLabel} · original PDF was not stored`;
	}

	return (
		<div
			data-full-bleed
			className="flex min-h-[calc(100svh-var(--topbar-h))]"
		>
			<div className="min-w-0 flex-1 flex-col">
				<SourceHeader
					source={source}
					detail={detail}
					showTitle={
						source.kind === "pdf" ||
						!source.markdown ||
						!documentLeadsWithTitle(source.markdown, source.title)
					}
				/>

				<div className="min-h-0 flex-1">
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
					) : source.kind === "pdf" && hasPdf ? (
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
					) : source.markdown ? (
						<div className="h-full overflow-auto px-10 pb-8">
							<div className="max-w-2xl">
								<SourcePane
									markdown={source.markdown}
									extracts={sourceExtracts}
								/>
							</div>
						</div>
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
