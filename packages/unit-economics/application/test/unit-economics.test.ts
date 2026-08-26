import assert from"node:assert/strict";import test from"node:test";import{GetProductUnitEconomics,type UnitEconomicsReader}from"../src/index";
test("limits product unit economics periods",()=>assert.throws(()=>new GetProductUnitEconomics({}as UnitEconomicsReader).execute({from:"2025-01-01",to:"2026-08-16",granularity:"day"}as never),{code:"UNIT_ECONOMICS_INVALID"}));
test("rejects normalized calendar overflows",()=>assert.throws(()=>new GetProductUnitEconomics({}as UnitEconomicsReader).execute({from:"2026-02-31",to:"2026-03-01",granularity:"day"}as never),{code:"UNIT_ECONOMICS_INVALID"}));
