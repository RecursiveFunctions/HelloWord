import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { persistPdf } from "./pdf";
import { localPdfPath } from "./local";

const BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

async function onVercel<T>(run: () => Promise<T>): Promise<T> {
  const before = process.env.VERCEL;
  process.env.VERCEL = "1";
  try {
    return await run();
  } finally {
    if (before === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = before;
  }
}

const written: string[] = [];

afterEach(async () => {
  // Each local write lands in its own sources/{uuid}/ directory.
  await Promise.all(
    written.splice(0).map((key) =>
      rm(path.dirname(localPdfPath(key)), { recursive: true, force: true }),
    ),
  );
});

describe("persistPdf", () => {
  it("archives to disk when nothing durable is configured", async () => {
    const stored = await persistPdf("paper.pdf", BYTES);
    assert.ok(stored.storage_key, "expected a local archive key");
    written.push(stored.storage_key);
    assert.match(stored.storage_key, /^local:sources\//);
    assert.equal(stored.unarchived, undefined);
  });

  /**
   * The regression this file exists for. `persistPdf` used to throw here, and
   * the route turned that into "Could not store that PDF", so every upload to
   * a Vercel deployment without Spaces failed outright. Losing the archive
   * must not lose the upload: extraction runs from the bytes in memory.
   */
  it("keeps the upload when Vercel has no durable store", async () => {
    const stored = await onVercel(() => persistPdf("paper.pdf", BYTES));
    assert.equal(stored.storage_key, null);
    assert.match(stored.origin_uri, /^upload:\/\/sources\//);
    assert.match(String(stored.unarchived), /SPACES_KEY/);
  });

  it("never writes to the ephemeral filesystem on Vercel", async () => {
    const stored = await onVercel(() => persistPdf("paper.pdf", BYTES));
    assert.equal(stored.storage_key, null);
  });
});
