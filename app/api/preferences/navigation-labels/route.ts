import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { userId } from "@kontave/organizations/domain";
import { PreferencesFailure } from "@kontave/preferences/domain";
import { createUserNavigationLabelsActions } from "@/src/client-api/v1/preferences/navigation-labels-actions";
import { z } from "zod";

const updateSchema = z.object({ expectedVersion: z.number().int().nonnegative(), labels: z.record(z.string(), z.unknown()) });

/** Reads this actor's custom navigation labels without inserting defaults.
 * @returns Effective sparse label overrides.
 */
export async function GET(): Promise<Response> {
  const session = await authenticate();
  if (!session) return Response.json({ error: "Sesión no válida." }, { status: 401 });
  try {
    const data = await createUserNavigationLabelsActions(session.accessToken).get.execute(userId(session.userId));
    return Response.json({ data });
  } catch (cause) { return failure(cause); }
}

/** Replaces custom labels using the shared stable navigation catalog and CAS revision.
 * @param request - Authenticated update payload.
 * @returns Authoritative saved labels.
 */
export async function PATCH(request: Request): Promise<Response> {
  const session = await authenticate();
  if (!session) return Response.json({ error: "Sesión no válida." }, { status: 401 });
  const input = updateSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Etiquetas de navegación inválidas." }, { status: 400 });
  try {
    const data = await createUserNavigationLabelsActions(session.accessToken).update.execute({ userId: userId(session.userId), ...input.data });
    return Response.json({ data });
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
  console.error("preferences.navigation_labels.failed", { cause });
  return Response.json({ error: "No se pudieron procesar las etiquetas del menú." }, { status: 500 });
}
