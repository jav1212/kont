import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import { PreferencesFailure } from "@kontave/preferences/domain";
import { userId } from "@kontave/organizations/domain";
import { createUserProcessDefaultsActions } from "@/src/client-api/v1/preferences/process-defaults-actions";

const processId = "payroll.employees";
const statusFilter = z.enum(["todos", "activo", "vacacion", "inactivo"]);
const updateSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  values: z.object({ employeeStatusFilter: statusFilter.optional() }).strict(),
}).strict();

/**
 * Reads the authenticated user's defaults for the employee directory.
 * @returns Stored defaults or an empty, unpersisted map.
 * @throws Authentication and persistence errors are returned as safe HTTP responses.
 */
export async function GET(): Promise<Response> {
  const session = await authenticate();
  if (!session) return Response.json({ error: "Sesión no válida." }, { status: 401 });
  try {
    const data = await createUserProcessDefaultsActions(session.accessToken).get.execute({ userId: userId(session.userId), processId });
    return Response.json({ data });
  } catch (cause) { return preferenceFailure(cause); }
}

/**
 * Replaces the employee-directory defaults after validating the observed revision.
 * @param request - Authenticated request containing version and allowlisted filter values.
 * @returns Authoritative defaults snapshot.
 * @throws Authentication and persistence errors are returned as safe HTTP responses.
 */
export async function PATCH(request: Request): Promise<Response> {
  const session = await authenticate();
  if (!session) return Response.json({ error: "Sesión no válida." }, { status: 401 });
  const input = updateSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Valores predeterminados inválidos." }, { status: 400 });
  try {
    const data = await createUserProcessDefaultsActions(session.accessToken).update.execute({
      userId: userId(session.userId), processId, expectedVersion: input.data.expectedVersion, values: input.data.values,
    });
    return Response.json({ data });
  } catch (cause) { return preferenceFailure(cause); }
}

async function authenticate(): Promise<{ readonly userId: string; readonly accessToken: string } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const cookieStore = await cookies();
  const client = createServerClient(url, anonKey, { cookies: { getAll: () => cookieStore.getAll(), setAll: () => undefined } });
  const [{ data: userData, error: userError }, { data: sessionData }] = await Promise.all([client.auth.getUser(), client.auth.getSession()]);
  if (userError || !userData.user || !sessionData.session?.access_token || sessionData.session.user.id !== userData.user.id) return null;
  return { userId: userData.user.id, accessToken: sessionData.session.access_token };
}

function preferenceFailure(cause: unknown): Response {
  if (cause instanceof PreferencesFailure) return Response.json({ error: cause.message, code: cause.code }, {
    status: cause.code === "PREFERENCES_VERSION_CONFLICT" ? 409 : cause.code === "PREFERENCES_INVALID" ? 400 : 503,
  });
  console.error("preferences.process_defaults.failed", { cause });
  return Response.json({ error: "No se pudieron procesar los valores predeterminados." }, { status: 500 });
}
