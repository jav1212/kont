import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies-domain";
import { documentId, type StoredDocument } from "@kontave/documents-domain";
import { organizationId, userId } from "@kontave/organizations-domain";
import { DeleteDocument, type DocumentsRepository, type DocumentStorage } from "../src/index.js";

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
