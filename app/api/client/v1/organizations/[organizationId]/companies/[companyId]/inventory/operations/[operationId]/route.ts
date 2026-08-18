import type { UpdateInventoryOperationDto } from "@kontave/client-contracts";
import {
  executeInventoryOperationRequest,
  inventoryRead,
  inventoryUpdate,
  readJson,
} from "@/src/client-api/v1/inventory/inventory-operation-http";
export const dynamic = "force-dynamic";
export async function GET(
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
  const p = await params;
  return executeInventoryOperationRequest(
    request,
    p.organizationId,
    p.companyId,
    inventoryRead,
    (a, c) => a.get.execute({ ...c, operationId: p.operationId }),
  );
}
export async function PATCH(
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
    b = (await readJson(request)) as unknown as UpdateInventoryOperationDto;
  return executeInventoryOperationRequest(
    request,
    p.organizationId,
    p.companyId,
    inventoryUpdate,
    (a, c) => a.update.execute({ ...c, operationId: p.operationId, ...b }),
  );
}
