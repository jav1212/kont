import assert from "node:assert/strict";
import test from "node:test";
import { TaxationFailure } from "@kontave/taxation-domain";
import { SetProductTaxTreatment, type ProductTaxationRepository } from "../src/index";

test("requires a valid independent taxation version", () => {
  assert.throws(
    () => new SetProductTaxTreatment({} as ProductTaxationRepository).execute({
      expectedVersion: 0,
      legalBasis: "x",
    } as never),
    { code: "TAXATION_PROFILE_INVALID" },
  );
});

test("maps unexpected repository failures", async () => {
  const repository = {
    async setTreatment(): Promise<never> { throw new Error("network unavailable"); },
  } as unknown as ProductTaxationRepository;
  await assert.rejects(
    () => new SetProductTaxTreatment(repository).execute({ expectedVersion: 1, legalBasis: "LOTTT" } as never),
    (error: unknown) => (
      error instanceof TaxationFailure
      && error.code === "TAXATION_REPOSITORY_UNAVAILABLE"
    ),
  );
});
