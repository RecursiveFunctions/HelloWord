"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Link2, Rss } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addUrl, FILE_ACCEPT, uploadFile } from "@/lib/client/upload";

type Candidate = {
  title: string;
  url: string;
  published: string | null;
  feed: string;
  known: boolean;
};

export function AddSource() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [, startTransition] = useTransition();

  function done(message?: string) {
    setBusy(false);
    setError(message ?? null);
    if (!message) startTransition(() => router.refresh());
  }

  async function createFromUrl(target: string) {
    if (!target.trim()) return;
    setBusy(true);
    setError(null);

    const result = await addUrl(target);
    if (!result.ok) {
      done(result.error);
      return;
    }

    setUrl("");
    setCandidates((current) =>
      current?.map((c) => (c.url === target ? { ...c, known: true } : c)) ??
      null,
    );
    done();
  }

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const result = await uploadFile(file);
    done(result.ok ? undefined : result.error);
  }

  async function refreshFeeds() {
    setBusy(true);
    setError(null);

    const response = await fetch("/api/feeds/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 12 }),
    });

    if (!response.ok) {
      done("Could not reach the feeds.");
      return;
    }

    const body = await response.json();
    setCandidates(body.candidates ?? []);
    done(body.errors?.length ? body.errors.join(" · ") : undefined);
  }

  return (
    <section className="rounded-xl border bg-card p-4">
      <Tabs defaultValue="url">
        <TabsList>
          <TabsTrigger value="url">
            <Link2 className="size-4" /> URL
          </TabsTrigger>
          <TabsTrigger value="pdf">
            <FileText className="size-4" /> File
          </TabsTrigger>
          <TabsTrigger value="feeds">
            <Rss className="size-4" /> Feeds
          </TabsTrigger>
        </TabsList>

        <TabsContent value="url" className="pt-3">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void createFromUrl(url);
            }}
          >
            <Input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/an-article"
              type="url"
              disabled={busy}
              className="flex-1"
            />
            <Button type="submit" disabled={busy || !url.trim()}>
              {busy ? <Spinner /> : null} Add
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Extracted locally with defuddle. A JavaScript-rendered page falls
            back to Gemini <code className="font-mono">url_context</code>.
          </p>
        </TabsContent>

        <TabsContent value="pdf" className="pt-3">
          <Input
            type="file"
            accept={FILE_ACCEPT}
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void upload(file);
            }}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            PDFs become sources: text-layer ones are read by unpdf, scanned ones
            go to Gemini page vision. Markdown and text files become notes.
            PDFs over 4 MB need DigitalOcean Spaces.
          </p>
        </TabsContent>

        <TabsContent value="feeds" className="pt-3">
          <Button variant="outline" onClick={refreshFeeds} disabled={busy}>
            {busy ? <Spinner /> : <Rss className="size-4" />} Refresh feeds
          </Button>

          {candidates?.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No new items in the subscribed feeds.
            </p>
          ) : null}

          {candidates && candidates.length > 0 ? (
            <ul className="mt-3 divide-y rounded-lg border">
              {candidates.map((candidate) => (
                <li
                  key={candidate.url}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <div className="min-w-0">
                    <a
                      href={candidate.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-sm hover:underline"
                    >
                      {candidate.title}
                    </a>
                    <p className="text-xs text-muted-foreground">
                      {candidate.feed}
                      {candidate.published
                        ? ` · ${new Date(candidate.published).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  {candidate.known ? (
                    <Badge variant="secondary">In library</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void createFromUrl(candidate.url)}
                    >
                      Add
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </TabsContent>
      </Tabs>

      {error ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
