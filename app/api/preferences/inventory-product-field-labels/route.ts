import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { userId } from "@kontave/organizations/domain";
import { PreferencesFailure } from "@kontave/preferences/domain";
import { createUserFieldLabelsActions } from "@/src/client-api/v1/preferences/field-labels-actions";
import { z } from "zod";

const VIEW_ID = "inventory.products";
const updateSchema = z.object({ expectedVersion: z.number().int().nonnegative(), labels: z.record(z.string(), z.unknown()) });

/** Reads user field labels for the inventory product view without creating defaults.
 * @returns Sparse labels and the current revision.
 */
export async function GET(): Promise<Response> {
  const session = await authenticate();
  if (!session) return Response.json({ error: "Sesión no válida." }, { status: 401 });
  try { return Response.json({ data: await createUserFieldLabelsActions(session.accessToken).get.execute({ userId: userId(session.userId), viewId: VIEW_ID }) }); }
  catch (cause) { return failure(cause); }
}

/** Replaces presentation-only labels with optimistic concurrency.
 * @param request - Expected revision and sparse stable field-ID labels.
 * @returns Authoritative saved labels.
 */
export async function PATCH(request: Request): Promise<Response> {
  const session = await authenticate();
  if (!session) return Response.json({ error: "Sesión no válida." }, { status: 401 });
  const input = updateSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Etiquetas de campos inválidas." }, { status: 400 });
  try { return Response.json({ data: await createUserFieldLabelsActions(session.accessToken).update.execute({ userId: userId(session.userId), viewId: VIEW_ID, ...input.data }) }); }
  catch (cause) { return failure(cause); }
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
  console.error("preferences.inventory_product_field_labels.failed", { cause });
  return Response.json({ error: "No se pudieron procesar los nombres de campos." }, { status: 500 });
}
