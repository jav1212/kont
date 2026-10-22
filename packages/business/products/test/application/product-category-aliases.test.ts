import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import {
  ProductCategoryAlias,
  ProductFailure,
  productCategoryId,
} from "../../src/domain";
import {
  ResolveProductCategoryAlias,
  SetProductCategoryAlias,
  type ProductCategoryAliasRepository,
} from "../../src/application";

const context = {
  actorUserId: userId("actor-1"),
  organizationId: organizationId("organization-1"),
  companyId: companyId("company-1"),
};

test("alias use cases normalize labels and resolve only to canonical category identities", async () => {
  const writes: string[] = [];
  const repository: ProductCategoryAliasRepository = {
    listAliases: async () => [],
    createAlias: async (command) => {
      writes.push(command.alias);
      return new ProductCategoryAlias({
        id: "alias-1",
        companyId: command.companyId,
        categoryId: command.categoryId,
        alias: command.alias,
        status: "active",
        version: 1,
      });
    },
    retireAlias: async () => { throw new Error("Unexpected retirement"); },
    resolveAlias: async (command) => ({
      categoryId: productCategoryId("canonical-1"),
      categoryName: "Medicinas",
      matchedAs: command.sourceName === "Meds" ? "alias" : "canonical",
    }),
  };

  const alias = await new SetProductCategoryAlias(repository).execute({
    ...context,
    categoryId: productCategoryId("canonical-1"),
    alias: "  Meds  ",
  });
  const match = await new ResolveProductCategoryAlias(repository).execute({ ...context, sourceName: " Meds " });

  assert.deepEqual(writes, ["Meds"]);
  assert.equal(alias.alias, "Meds");
  assert.equal(match?.categoryId, "canonical-1");
  assert.equal(match?.matchedAs, "alias");
  assert.throws(
    () => new SetProductCategoryAlias(repository).execute({ ...context, categoryId: productCategoryId("canonical-1"), alias: "\t" }),
    (error: unknown) => error instanceof ProductFailure && error.code === "PRODUCT_CATEGORY_ALIAS_INVALID",
  );
});
