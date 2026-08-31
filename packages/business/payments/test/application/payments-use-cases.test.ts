import assert from "node:assert/strict";
import test from "node:test";
import { organizationId } from "@kontave/organizations/domain";
import { PaymentFailure } from "../../src/domain";
import { ListPayments, type PaymentsRepository } from "../../src/application";

test("maps unexpected repository errors to the portable failure", async () => {
  const repository: PaymentsRepository = {
    async list() { throw new Error("network unavailable"); },
    async confirm() { throw new Error("unused"); },
  };
  await assert.rejects(
    () => new ListPayments(repository).execute(organizationId("organization-1")),
    (error: unknown) => error instanceof PaymentFailure && error.code === "PAYMENT_REPOSITORY_UNAVAILABLE",
  );
});
