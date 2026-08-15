import { platform } from "@kontave/modules-domain";
import { createModuleActions } from "@/src/native-api/v1/modules/module-actions";
import { toAvailableOrganizationModuleDto } from "@/src/native-api/v1/modules/module-dto";
import { executeModuleRequest } from "@/src/native-api/v1/modules/execute-module-request";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
): Promise<Response> {
  const { organizationId } = await context.params;
  const requestedPlatform = new URL(request.url).searchParams.get("platform") ?? "";
  return executeModuleRequest(request, organizationId, false, async (organization) =>
    (await createModuleActions().availableOrganizationModules.execute(
      organization,
      platform(requestedPlatform),
    )).map(toAvailableOrganizationModuleDto),
  );
}
