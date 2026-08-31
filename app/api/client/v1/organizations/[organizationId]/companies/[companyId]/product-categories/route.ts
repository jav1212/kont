import type { CreateProductCategoryDto } from "@kontave/client-contracts";
import {
  ProductCategoryStatus,
  ProductFailure,
} from "@kontave/products/domain";
import {
  executeProductRequest,
  productsCreate,
  productsRead,
} from "@/src/client-api/v1/products/product-http";
import { toProductCategoryDto } from "@/src/client-api/v1/products/product-mapper";
type C = { params: Promise<{ organizationId: string; companyId: string }> };
export async function GET(request: Request, c: C) {
  const p = await c.params,
    value = new URL(request.url).searchParams.get("status") ?? "all";
  if (!["active", "inactive", "all"].includes(value))
    throw new ProductFailure(
      "PRODUCT_CATEGORY_INVALID",
      "status no es válido.",
    );
  return executeProductRequest(
    request,
    p.organizationId,
    p.companyId,
    productsRead,
    async (a, context) =>
      (
        await a.listCategories.execute({
          ...context,
          status: value as ProductCategoryStatus | "all",
        })
      ).map(toProductCategoryDto),
  );
}
export async function POST(request: Request, c: C) {
  const p = await c.params,
    b = (await request.json()) as CreateProductCategoryDto;
  return executeProductRequest(
    request,
    p.organizationId,
    p.companyId,
    productsCreate,
    async (a, context) =>
      toProductCategoryDto(
        await a.createCategory.execute({
          ...context,
          name: b.name,
          description: b.description ?? null,
        }),
      ),
  );
}
