import type { InventoryOperationVersionDto } from "@kontave/client-contracts";
import {
  executeInventoryOperationRequest,
  inventoryUpdate,
  readJson,
} from "@/src/client-api/v1/inventory/inventory-operation-http";
export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      organizationId: string;
      companyId: string;
      operationId: string;
    }>;
  },
) {
  const p = await params,
    b = (await readJson(request)) as unknown as InventoryOperationVersionDto;
  return executeInventoryOperationRequest(
    request,
    p.organizationId,
    p.companyId,
    inventoryUpdate,
    (a, c) =>
      a.post.execute({
        ...c,
        operationId: p.operationId,
        expectedVersion: b.expectedVersion,
      }),
  );
}
