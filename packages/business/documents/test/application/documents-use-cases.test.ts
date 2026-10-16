import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { DocumentsFailure, documentFolderId, documentId, type StoredDocument } from "../../src/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import {
  DeleteDocument,
  ListDocuments,
  RenameDocumentFolder,
  type DocumentsRepository,
  type DocumentStorage,
} from "../../src/application";

const organization = organizationId("organization-1");
const document: StoredDocument = {
  id: documentId("document-1"), organizationId: organization, companyId: companyId("company-1"), folderId: null,
  name: "Archivo.pdf", file: { storageKey: "tenant/document/archivo.pdf", contentType: "application/pdf", sizeBytes: 20 },
  uploadedBy: userId("user-1"), version: 2, createdAt: "2026-08-15T00:00:00.000Z", updatedAt: "2026-08-15T00:00:00.000Z",
};

function repository(onDelete:()=>void):DocumentsRepository{return{
 async listDocuments(){return[document]},async listFolders(){return[]},async createFolder(){throw new Error("unused")},async renameFolder(){throw new Error("unused")},async deleteFolder(){},async registerDocument(){return document},async moveDocument(){return document},async findDocument(){return document},async deleteDocument(){onDelete()},
}}

test("does not delete metadata when storage deletion fails",async()=>{
 let metadataDeleted=false;
 const storage:DocumentStorage={async createUpload(){throw new Error("unused")},async createDownload(){return""},async delete(){throw new Error("storage unavailable")}};
 await assert.rejects(()=>new DeleteDocument(repository(()=>{metadataDeleted=true}),storage).execute({organizationId:organization,documentId:document.id,expectedVersion:2}));
 assert.equal(metadataDeleted,false);
});

test("deletes storage before committing metadata deletion",async()=>{
 const sequence:string[]=[];
 const storage:DocumentStorage={async createUpload(){throw new Error("unused")},async createDownload(){return""},async delete(){sequence.push("storage")}};
 await new DeleteDocument(repository(()=>sequence.push("metadata")),storage).execute({organizationId:organization,documentId:document.id,expectedVersion:2});
 assert.deepEqual(sequence,["storage","metadata"]);
});

test("maps unexpected repository errors to the portable failure", async () => {
  const source = repository(() => undefined);
  source.listDocuments = async () => { throw new Error("network unavailable"); };
  await assert.rejects(
    () => new ListDocuments(source).execute({ organizationId: organization }),
    (error: unknown) => error instanceof DocumentsFailure && error.code === "DOCUMENT_REPOSITORY_UNAVAILABLE",
  );
});

test("renames a folder with a normalized name and the caller's expected version", async () => {
  let received: Parameters<DocumentsRepository["renameFolder"]>[0] | undefined;
  const source = repository(() => undefined);
  source.renameFolder = async (input) => {
    received = input;
    return {
      id: documentFolderId("folder-1"), organizationId: input.organizationId, companyId: null,
      parentId: null, name: input.name, createdBy: userId("user-1"), version: input.expectedVersion + 1,
      createdAt: "2026-08-15T00:00:00.000Z", updatedAt: "2026-08-16T00:00:00.000Z",
    };
  };

  const renamed = await new RenameDocumentFolder(source).execute({
    organizationId: organization,
    folderId: documentFolderId("folder-1"),
    name: "  Contratos  ",
    expectedVersion: 4,
  });

  assert.equal(received?.name, "Contratos");
  assert.equal(received?.expectedVersion, 4);
  assert.equal(renamed.version, 5);
});

test("rejects an empty folder name before reaching persistence", async () => {
  let called = false;
  const source = repository(() => undefined);
  source.renameFolder = async () => {
    called = true;
    throw new Error("must not reach persistence");
  };

  assert.throws(
    () => new RenameDocumentFolder(source).execute({
      organizationId: organization,
      folderId: documentFolderId("folder-1"),
      name: "   ",
      expectedVersion: 1,
    }),
    (error: unknown) => error instanceof DocumentsFailure && error.code === "DOCUMENT_INVALID",
  );
  assert.equal(called, false);
});

test("maps unexpected storage errors to the portable failure", async () => {
  const storage: DocumentStorage = {
    async createUpload() { throw new Error("unused"); },
    async createDownload() { return ""; },
    async delete() { throw new Error("storage unavailable"); },
  };
  await assert.rejects(
    () => new DeleteDocument(repository(() => undefined), storage).execute({
      organizationId: organization,
      documentId: document.id,
      expectedVersion: 2,
    }),
    (error: unknown) => error instanceof DocumentsFailure && error.code === "DOCUMENT_STORAGE_UNAVAILABLE",
  );
});
