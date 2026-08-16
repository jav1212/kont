import assert from "node:assert/strict";
import test from "node:test";
import { documentName, validateStoredFile } from "../src/index.js";

test("normalizes portable document names and file metadata", () => {
  assert.equal(documentName("  Comprobante.pdf "), "Comprobante.pdf");
  assert.deepEqual(validateStoredFile({ storageKey:"organization/id/file.pdf",contentType:"application/pdf",sizeBytes:10 }), { storageKey:"organization/id/file.pdf",contentType:"application/pdf",sizeBytes:10 });
});
test("rejects traversal paths and files above the production limit", () => {
  assert.throws(()=>validateStoredFile({storageKey:"../secret",contentType:null,sizeBytes:1}),{code:"DOCUMENT_INVALID"});
  assert.throws(()=>validateStoredFile({storageKey:"safe",contentType:null,sizeBytes:52_428_801}),{code:"DOCUMENT_INVALID"});
});
