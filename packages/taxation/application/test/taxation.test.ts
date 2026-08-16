import assert from"node:assert/strict";import test from"node:test";import{SetProductTaxTreatment,type ProductTaxationRepository}from"../src/index";
test("requires a valid independent taxation version",()=>assert.throws(()=>new SetProductTaxTreatment({}as ProductTaxationRepository).execute({expectedVersion:0,legalBasis:"x"}as never),{code:"TAXATION_PROFILE_INVALID"}));
