"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resolveExact } from "@/lib/anchor/selector";
import type { ExtractProposal, SelectorBundle } from "@/lib/contracts";
import type { ExtractRow } from "@/lib/store/types";
import { SourcePane, type PaintedExtract } from "./source-pane";

type ResolvedProposal = ExtractProposal & {
  id: string;
  selector: SelectorBundle;
  state: "pending" | "saving" | "accepted" | "rejected" | "error";
  message?: string;
};

type ReaderShellProps = {
  source: { id: string; title: string; markdown: string };
  initialExtracts: ExtractRow[];
};

export function ReaderShell({ source, initialExtracts }: ReaderShellProps) {
  const [extracts, setExtracts] = useState(initialExtracts);
  const [proposals, setProposals] = useState<ResolvedProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [status, setStatus] = useState<string>();

  const paintedExtracts = useMemo<PaintedExtract[]>(
    () =>
      extracts.map((extract) => ({
        id: extract.id,
        start: extract.selector.start,
        end: extract.selector.end,
        orphaned: extract.anchor_status === "orphaned",
      })),
    [extracts],
  );
  const paintedProposals = proposals
    .filter((proposal) => proposal.state === "pending" || proposal.state === "saving")
    .map((proposal) => ({
      id: proposal.id,
      start: proposal.selector.start,
      end: proposal.selector.end,
    }));

  async function requestProposals(): Promise<ResolvedProposal[]> {
    setLoading(true);
    setStatus(undefined);
    try {
      const response = await fetch("/api/ai/extracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceId: source.id }),
      });
      const body = (await response.json()) as ExtractProposal[] | { error?: string; detail?: string };
      if (!response.ok || !Array.isArray(body)) {
        throw new Error(!Array.isArray(body) ? body.detail || body.error : "Proposal request failed.");
      }

      const accepted = new Set(extracts.map((extract) => extract.body_md));
      let unresolved = 0;
      const resolved = body.flatMap((proposal) => {
        if (accepted.has(proposal.exact)) return [];
        const selector = resolveExact(source.markdown, proposal.exact);
        if (!selector) {
          unresolved++;
          return [];
        }
        return [{ ...proposal, id: crypto.randomUUID(), selector, state: "pending" as const }];
      });
      setProposals(resolved);
      setStatus(
        `${resolved.length} proposal${resolved.length === 1 ? "" : "s"} ready${unresolved ? `; ${unresolved} could not be anchored` : ""}.`,
      );
      return resolved;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not generate proposals.");
      return [];
    } finally {
      setLoading(false);
    }
  }

  async function suggest() {
    await requestProposals();
  }

  function updateProposal(id: string, patch: Partial<ResolvedProposal>) {
    setProposals((current) =>
      current.map((proposal) => (proposal.id === id ? { ...proposal, ...patch } : proposal)),
    );
  }

  async function accept(proposal: ResolvedProposal): Promise<"created" | "duplicate" | "failed"> {
    updateProposal(proposal.id, { state: "saving", message: undefined });
    try {
      const response = await fetch("/api/extracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source_id: source.id,
          body_md: proposal.exact,
          priority: proposal.priority,
          selector: proposal.selector,
          suggested_by: "nemotron",
          reason: proposal.reason,
          concepts: proposal.concepts,
        }),
      });
      const body = (await response.json()) as {
        extract?: ExtractRow;
        duplicate?: boolean;
        error?: string;
      };
      if (!response.ok || !body.extract) throw new Error(body.error || "Could not save extract.");
      setExtracts((current) =>
        current.some((extract) => extract.id === body.extract!.id)
          ? current
          : [...current, body.extract!],
      );
      updateProposal(proposal.id, {
        state: "accepted",
        message: body.duplicate ? "Already accepted." : "Accepted.",
      });
      return body.duplicate ? "duplicate" : "created";
    } catch (error) {
      updateProposal(proposal.id, {
        state: "error",
        message: error instanceof Error ? error.message : "Could not save extract.",
      });
      return "failed";
    }
  }

  function reject(id: string) {
    updateProposal(id, { state: "rejected", message: "Dismissed." });
  }

  async function runAuto() {
    if (
      !window.confirm(
        "Generate Nemotron proposals and automatically accept every valid, nonduplicate passage for this source? This may make a billable AI request.",
      )
    ) {
      return;
    }
    setAutoMode(true);
    const generated = await requestProposals();
    let created = 0;
    let duplicates = 0;
    let failed = 0;
    for (const proposal of generated) {
      const outcome = await accept(proposal);
      if (outcome === "created") created++;
      else if (outcome === "duplicate") duplicates++;
      else failed++;
    }
    setStatus(
      `Auto complete: ${created} created, ${duplicates} duplicate${duplicates === 1 ? "" : "s"}, ${failed} failed.`,
    );
    setAutoMode(false);
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-w-0 flex-1 overflow-auto px-10 pb-8">
        <div className="mt-6 max-w-2xl">
          <SourcePane
            markdown={source.markdown}
            extracts={paintedExtracts}
            proposals={paintedProposals}
          />
        </div>
      </div>
      <aside className="w-[28rem] shrink-0 overflow-auto border-l bg-sidebar px-5 py-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg">Nemotron extracts</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Review verbatim passages before adding them to this source.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void runAuto()} disabled={loading || autoMode}>
              {autoMode ? "Auto…" : "Auto"}
            </Button>
            <Button onClick={() => void suggest()} disabled={loading || autoMode}>
              {loading ? "Thinking…" : "Suggest"}
            </Button>
          </div>
        </div>
        {status && <p className="mt-3 text-xs text-muted-foreground">{status}</p>}
        <ul className="mt-5 space-y-3">
          {proposals.map((proposal) => (
            <li key={proposal.id} className="rounded-lg border bg-card p-3 text-sm">
              <div className="mb-2 flex flex-wrap items-center gap-1">
                <Badge variant="outline">priority {proposal.priority}</Badge>
                {proposal.concepts.map((concept) => (
                  <Badge key={concept} variant="secondary">{concept}</Badge>
                ))}
              </div>
              <p className="font-serif">{proposal.exact}</p>
              <p className="mt-2 text-muted-foreground">{proposal.reason}</p>
              {proposal.message && <p className="mt-2 text-xs">{proposal.message}</p>}
              {(proposal.state === "pending" || proposal.state === "error") && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => void accept(proposal)}>Accept</Button>
                  <Button size="sm" variant="outline" onClick={() => reject(proposal.id)}>
                    Reject
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}