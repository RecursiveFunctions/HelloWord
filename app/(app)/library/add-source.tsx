"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Link2, Rss } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Vercel caps a serverless request body at 4.5 MB; presign anything near it. */
const DIRECT_UPLOAD_LIMIT = 4 * 1024 * 1024;

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

    const response = await fetch("/api/sources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "url", origin_uri: target.trim() }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      done(body.error ?? `Could not add that URL (${response.status}).`);
      return;
    }

    setUrl("");
    setCandidates((current) =>
      current?.map((c) => (c.url === target ? { ...c, known: true } : c)) ??
      null,
    );
    done();
  }

  async function uploadPdf(file: File) {
    setBusy(true);
    setError(null);

    try {
      const created =
        file.size > DIRECT_UPLOAD_LIMIT
          ? await uploadViaPresign(file)
          : await uploadDirect(file);

      if (!created.ok) {
        const body = await created.json().catch(() => ({}));
        done(body.error ?? `Upload failed (${created.status}).`);
        return;
      }
      done();
    } catch (cause) {
      done(cause instanceof Error ? cause.message : "Upload failed.");
    }
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
            <FileText className="size-4" /> PDF
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
            accept="application/pdf,.pdf"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void uploadPdf(file);
            }}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Text-layer PDFs are read by unpdf. A scanned one goes to Gemini page
            vision. The original is archived so the reader can open the pages.
            Files over 4 MB need DigitalOcean Spaces.
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

function uploadDirect(file: File): Promise<Response> {
  const form = new FormData();
  form.set("file", file);
  return fetch("/api/sources", { method: "POST", body: form });
}

/**
 * Large PDFs go straight to Spaces and only the key comes back through the API.
 * If the bucket has no CORS rule the PUT fails, so fall back to the direct path
 * and let the platform limit be the thing that complains.
 */
async function uploadViaPresign(file: File): Promise<Response> {
  const presigned = await fetch("/api/sources/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filename: file.name }),
  });

  // 503 means Spaces is unset. Falling back to multipart would hit the
  // 4.5 MB platform cap, so surface the presign error instead.
  if (!presigned.ok) {
    if (presigned.status === 503) return presigned;
    return uploadDirect(file);
  }

  const { key, url, origin_uri } = await presigned.json();

  try {
    const put = await fetch(url, {
      method: "PUT",
      body: file,
      headers: { "content-type": "application/pdf" },
    });
    if (!put.ok) return uploadDirect(file);
  } catch {
    return uploadDirect(file);
  }

  return fetch("/api/sources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "pdf",
      title: file.name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " "),
      origin_uri,
      storage_key: key,
    }),
  });
}
