import type { ProductVersionDto } from "@kontave/client-contracts";
import { productCategoryId } from "@kontave/products-domain";
import {
  executeProductRequest,
  productsUpdate,
} from "@/src/client-api/v1/products/product-http";
import { toProductCategoryDto } from "@/src/client-api/v1/products/product-mapper";
type C = {
  params: Promise<{
    organizationId: string;
    companyId: string;
    categoryId: string;
  }>;
};
export async function POST(request: Request, c: C) {
  const p = await c.params,
    b = (await request.json()) as ProductVersionDto;
  return executeProductRequest(
    request,
    p.organizationId,
    p.companyId,
    productsUpdate,
    async (a, context) =>
      toProductCategoryDto(
        await a.activateCategory.execute({
          ...context,
          categoryId: productCategoryId(p.categoryId),
          expectedVersion: b.expectedVersion,
        }),
      ),
  );
}
