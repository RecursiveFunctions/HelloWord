import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLocalPdfKey, localPdfPath } from "./local";

describe("local PDF keys", () => {
  it("accepts a generated archive key", () => {
    const key = "local:sources/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/paper.pdf";
    assert.equal(isLocalPdfKey(key), true);
    assert.match(localPdfPath(key), /paper\.pdf$/);
  });

  it("rejects path traversal", () => {
    assert.throws(() => localPdfPath("local:../secret.pdf"));
    assert.throws(() => localPdfPath("local:sources/../../secret.pdf"));
    assert.throws(() => localPdfPath("local:/etc/passwd"));
    assert.throws(() => localPdfPath("sources/paper.pdf"));
  });
});
