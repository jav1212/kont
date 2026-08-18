import type { UpdateProductCategoryDto } from "@kontave/client-contracts";
import { productCategoryId } from "@kontave/products-domain";
import {
  executeProductRequest,
  productsRead,
  productsUpdate,
} from "@/src/client-api/v1/products/product-http";
import {
  toProductCategoryDto,
  toProductCategoryOverviewItemDto,
} from "@/src/client-api/v1/products/product-mapper";
type C = {
  params: Promise<{
    organizationId: string;
    companyId: string;
    categoryId: string;
  }>;
};
export async function GET(request: Request, c: C) {
  const p = await c.params;
  return executeProductRequest(
    request,
    p.organizationId,
    p.companyId,
    productsRead,
    async (a, context) =>
      toProductCategoryOverviewItemDto(
        await a.getCategory.execute(context, productCategoryId(p.categoryId)),
      ),
  );
}
export async function PATCH(request: Request, c: C) {
  const p = await c.params,
    b = (await request.json()) as UpdateProductCategoryDto;
  return executeProductRequest(
    request,
    p.organizationId,
    p.companyId,
    productsUpdate,
    async (a, context) =>
      toProductCategoryDto(
        await a.updateCategory.execute({
          ...context,
          categoryId: productCategoryId(p.categoryId),
          expectedVersion: b.expectedVersion,
          ...(b.name === undefined ? {} : { name: b.name }),
          ...(b.description === undefined
            ? {}
            : { description: b.description }),
        }),
      ),
  );
}
