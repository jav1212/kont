import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import { PreferencesFailure } from "@kontave/preferences/domain";
import { userId } from "@kontave/organizations/domain";
import { createUserViewPreferencesActions } from "@/src/client-api/v1/preferences/view-preferences-actions";

const registeredViews = ["sales.customers", "inventory.departments"] as const;
const viewIdSchema = z.enum(registeredViews);
const columnsByView = {
  "sales.customers": new Set(["contact", "phone", "email", "status"]),
  "inventory.departments": new Set(["description", "products", "status"]),
} as const;
const updateSchema = z.object({
  viewId: viewIdSchema,
  expectedVersion: z.number().int().nonnegative(),
  hiddenFieldIds: z.array(z.string().min(1).max(128)).max(100).optional(),
  hiddenColumnIds: z.array(z.string().min(1).max(128)).max(100).optional(),
}).refine((input) => input.hiddenFieldIds !== undefined || input.hiddenColumnIds !== undefined)
  .superRefine((input, context) => {
    const allowed = columnsByView[input.viewId];
    for (const id of input.hiddenColumnIds ?? []) {
      if (!allowed.has(id)) context.addIssue({ code: "custom", path: ["hiddenColumnIds"], message: `Unknown column ID: ${id}` });
    }
  });

/**
 * Loads sparse visibility preferences for a registered screen.
 * @param request - Request whose query includes an allowlisted `viewId`.
 * @returns Saved choices or all-visible defaults without writing a row.
 * @throws Authentication and persistence errors are returned as safe HTTP responses.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await authenticate();
  if (!session) return Response.json({ error: "Sesión no válida." }, { status: 401 });
  const viewId = viewIdSchema.safeParse(new URL(request.url).searchParams.get("viewId"));
  if (!viewId.success) return Response.json({ error: "Vista de preferencias inválida." }, { status: 400 });
  try {
    const data = await createUserViewPreferencesActions(session.accessToken).get.execute({ userId: userId(session.userId), viewId: viewId.data });
    return Response.json({ data });
  } catch (cause) { return preferenceFailure(cause); }
}

/**
 * Saves visibility for a registered screen with optimistic revision control.
 * @param request - Authenticated patch containing an allowlisted view and hidden stable IDs.
 * @returns Authoritative saved choices.
 * @throws Authentication and persistence errors are returned as safe HTTP responses.
 */
export async function PATCH(request: Request): Promise<Response> {
  const session = await authenticate();
  if (!session) return Response.json({ error: "Sesión no válida." }, { status: 401 });
  const input = updateSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Preferencias de visibilidad inválidas." }, { status: 400 });
  try {
    const data = await createUserViewPreferencesActions(session.accessToken).update.execute({
      userId: userId(session.userId), viewId: input.data.viewId,
      expectedVersion: input.data.expectedVersion,
      ...(input.data.hiddenFieldIds ? { hiddenFieldIds: input.data.hiddenFieldIds } : {}),
      ...(input.data.hiddenColumnIds ? { hiddenColumnIds: input.data.hiddenColumnIds } : {}),
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
  console.error("preferences.view_visibility.failed", { cause });
  return Response.json({ error: "No se pudieron procesar las preferencias de visibilidad." }, { status: 500 });
}
