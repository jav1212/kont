import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { PreferencesFailure } from "@kontave/preferences/domain";
import { userId } from "@kontave/organizations/domain";
import { createUserViewPreferencesActions } from "@/src/client-api/v1/preferences/view-preferences-actions";
import { z } from "zod";

const VIEW_ID = "inventory.products";
const updateSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  hiddenFieldIds: z.array(z.string().min(1).max(128)).max(100).optional(),
  hiddenColumnIds: z.array(z.string().min(1).max(128)).max(100).optional(),
}).refine((input) => input.hiddenFieldIds !== undefined || input.hiddenColumnIds !== undefined);

/**
 * Reads the authenticated user's effective product-list column preferences.
 * @returns Saved choices or all-visible defaults without creating a database row.
 * @throws Authentication and persistence errors are converted to safe HTTP responses.
 */
export async function GET(): Promise<Response> {
  const session = await authenticate();
  if (!session) return Response.json({ error: "Sesión no válida." }, { status: 401 });
  try {
    const data = await createUserViewPreferencesActions(session.accessToken).get.execute({
      userId: userId(session.userId), viewId: VIEW_ID,
    });
    return Response.json({ data });
  } catch (cause) { return preferenceFailure(cause); }
}

/**
 * Saves hidden optional product fields or list columns using compare-and-swap revision control.
 * @param request - Authenticated request with expectedVersion and one or both stable hidden-ID lists.
 * @returns The authoritative preferences after the update.
 * @throws Authentication and persistence errors are converted to safe HTTP responses.
 */
export async function PATCH(request: Request): Promise<Response> {
  const session = await authenticate();
  if (!session) return Response.json({ error: "Sesión no válida." }, { status: 401 });
  const input = updateSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Preferencias de campos o columnas inválidas." }, { status: 400 });
  try {
    const data = await createUserViewPreferencesActions(session.accessToken).update.execute({
      userId: userId(session.userId), viewId: VIEW_ID,
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
  const client = createServerClient(url, anonKey, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => undefined },
  });
  const [{ data: userData, error: userError }, { data: sessionData }] = await Promise.all([
    client.auth.getUser(), client.auth.getSession(),
  ]);
  if (userError || !userData.user || !sessionData.session?.access_token
    || sessionData.session.user.id !== userData.user.id) return null;
  return { userId: userData.user.id, accessToken: sessionData.session.access_token };
}

function preferenceFailure(cause: unknown): Response {
  if (cause instanceof PreferencesFailure) return Response.json({ error: cause.message, code: cause.code }, {
    status: cause.code === "PREFERENCES_VERSION_CONFLICT" ? 409
      : cause.code === "PREFERENCES_INVALID" ? 400 : 503,
  });
  console.error("preferences.inventory_product_columns.failed", { cause });
  return Response.json({ error: "No se pudieron procesar las preferencias del catálogo." }, { status: 500 });
}
