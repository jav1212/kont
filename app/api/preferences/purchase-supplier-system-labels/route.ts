import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { userId } from "@kontave/organizations/domain";
import { PreferencesFailure } from "@kontave/preferences/domain";
import { SUPPLIER_SYSTEM_LABELS } from "@/src/modules/purchases/domain/supplier-system-labels";
import { createUserSystemLabelsActions } from "@/src/client-api/v1/preferences/system-labels-actions";
import { z } from "zod";

const catalogId = "purchases.suppliers";
const updateSchema = z.object({ expectedVersion: z.number().int().nonnegative(), labels: z.record(z.string(), z.unknown()) });

/** Reads canonical/effective supplier labels without inserting defaults.
 * @returns Registered labels and their optimistic revision.
 */
export async function GET(): Promise<Response> {
  const session = await authenticate();
  if (!session) return Response.json({ error: "Sesión no válida." }, { status: 401 });
  try {
    const actions = createUserSystemLabelsActions(session.accessToken, SUPPLIER_SYSTEM_LABELS, catalogId);
    return Response.json({ data: await actions.get.execute({
      userId: userId(session.userId), catalog: actions.catalog, catalogId: actions.catalogId,
    }) });
  } catch (cause) { return failure(cause); }
}

/** Replaces user-scoped supplier label overrides using optimistic concurrency.
 * @param request - Expected revision and sparse customizable label values.
 * @returns Effective labels after a successful update.
 */
export async function PATCH(request: Request): Promise<Response> {
  const session = await authenticate();
  if (!session) return Response.json({ error: "Sesión no válida." }, { status: 401 });
  const input = updateSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Etiquetas de proveedores inválidas." }, { status: 400 });
  try {
    const actions = createUserSystemLabelsActions(session.accessToken, SUPPLIER_SYSTEM_LABELS, catalogId);
    return Response.json({ data: await actions.update.execute({
      userId: userId(session.userId), catalog: actions.catalog, catalogId: actions.catalogId, ...input.data,
    }) });
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
  if (cause instanceof PreferencesFailure) return Response.json({ error: cause.message, code: cause.code }, {
    status: cause.code === "PREFERENCES_VERSION_CONFLICT" ? 409 : cause.code === "PREFERENCES_INVALID" ? 400 : 503,
  });
  console.error("preferences.purchase_supplier_system_labels.failed", { cause });
  return Response.json({ error: "No se pudieron procesar las etiquetas de proveedores." }, { status: 500 });
}
