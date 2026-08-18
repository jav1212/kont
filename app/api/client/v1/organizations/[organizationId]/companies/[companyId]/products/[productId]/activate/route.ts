import type { ProductVersionDto } from "@kontave/client-contracts";
import { productId } from "@kontave/products-domain";
import {
  executeProductRequest,
  productsUpdate,
} from "@/src/client-api/v1/products/product-http";
import { toProductDetailDto } from "@/src/client-api/v1/products/product-mapper";
type C = {
  params: Promise<{
    organizationId: string;
    companyId: string;
    productId: string;
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
      toProductDetailDto(
        await a.activate.execute({
          ...context,
          productId: productId(p.productId),
          expectedVersion: b.expectedVersion,
        }),
      ),
  );
}
