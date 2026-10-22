import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { userId } from "@kontave/organizations/domain";
import { PreferencesFailure } from "@kontave/preferences/domain";
import { createUserSystemLabelsActions } from "@/src/client-api/v1/preferences/system-labels-actions";
import { z } from "zod";

const updateSchema = z.object({ expectedVersion: z.number().int().nonnegative(), labels: z.record(z.string(), z.unknown()) });

/** Reads effective product-system labels without persisting canonical defaults.
 * @returns Registered inventory labels and the actor's optimistic revision.
 */
export async function GET(): Promise<Response> {
  const session = await authenticate();
  if (!session) return Response.json({ error: "Sesión no válida." }, { status: 401 });
  try {
    const actions = createUserSystemLabelsActions(session.accessToken);
    return Response.json({ data: await actions.get.execute({ userId: userId(session.userId), catalog: actions.catalog }) });
  } catch (cause) { return failure(cause); }
}

/** Replaces user-owned product labels with catalog validation and revision control.
 * @param request - Expected version and sparse canonical-label overrides.
 * @returns Effective labels after persistence succeeds.
 */
export async function PATCH(request: Request): Promise<Response> {
  const session = await authenticate();
  if (!session) return Response.json({ error: "Sesión no válida." }, { status: 401 });
  const input = updateSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Etiquetas del sistema inválidas." }, { status: 400 });
  try {
    const actions = createUserSystemLabelsActions(session.accessToken);
    return Response.json({ data: await actions.update.execute({ userId: userId(session.userId), catalog: actions.catalog, ...input.data }) });
  } catch (cause) { return failure(cause); }
}

async function authenticate(): Promise<{ readonly userId: string; readonly accessToken: string } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const store = await cookies();
  const client = createServerClient(url, anonKey, { cookies: { getAll: () => store.getAll(), setAll: () => undefined } });
  const [{ data: auth, error }, { data: session }] = await Promise.all([client.auth.getUser(), client.auth.getSession()]);
  if (error || !auth.user || !session.session?.access_token || session.session.user.id !== auth.user.id) return null;
  return { userId: auth.user.id, accessToken: session.session.access_token };
}

function failure(cause: unknown): Response {
  if (cause instanceof PreferencesFailure) return Response.json({ error: cause.message, code: cause.code }, { status: cause.code === "PREFERENCES_VERSION_CONFLICT" ? 409 : cause.code === "PREFERENCES_INVALID" ? 400 : 503 });
  console.error("preferences.inventory_product_system_labels.failed", { cause });
  return Response.json({ error: "No se pudieron procesar las etiquetas del producto." }, { status: 500 });
}
