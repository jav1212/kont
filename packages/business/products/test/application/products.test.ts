import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import { ProductFailure } from "../../src/domain";
import { ListProductCategoryOverview, ListProducts, type ProductsRepository } from "../../src/application";

test("list validates limits before reaching persistence", () => {
  const repository = { list: async () => { throw new Error("must not run"); } } as unknown as ProductsRepository;
  const useCase = new ListProducts(repository);
  assert.throws(() => useCase.execute({ actorUserId:userId("user-1"),organizationId:organizationId("org-1"),companyId:companyId("company-1"),search:null,status:"all",categoryId:null,stock:"all",sort:"name",direction:"asc",cursor:null,limit:101 }), /limit/);
});

test("category overview validates limits before reaching persistence", () => {
  const repository = { overviewCategories: async () => { throw new Error("must not run"); } } as unknown as ProductsRepository;
  const useCase = new ListProductCategoryOverview(repository);
  assert.throws(() => useCase.execute({ actorUserId:userId("user-1"),organizationId:organizationId("org-1"),companyId:companyId("company-1"),search:null,status:"all",sort:"name",direction:"asc",cursor:null,limit:0 }), /limit/);
});

test("list maps unexpected repository errors", async () => {
  const repository = { list: async () => { throw new Error("network unavailable"); } } as unknown as ProductsRepository;
  await assert.rejects(
    () => new ListProducts(repository).execute({ actorUserId:userId("user-1"),organizationId:organizationId("org-1"),companyId:companyId("company-1"),search:null,status:"all",categoryId:null,stock:"all",sort:"name",direction:"asc",cursor:null,limit:25 }),
    (error: unknown) => error instanceof ProductFailure && error.code === "PRODUCT_REPOSITORY_UNAVAILABLE",
  );
});
