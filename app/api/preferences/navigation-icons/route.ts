import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { userId } from "@kontave/organizations/domain";
import { PreferencesFailure } from "@kontave/preferences/domain";
import { createUserNavigationIconsActions } from "@/src/client-api/v1/preferences/navigation-icons-actions";
import { z } from "zod";

const updateSchema = z.object({ expectedVersion: z.number().int().nonnegative(), icons: z.record(z.string(), z.unknown()) });

/** Reads semantic navigation icon choices without creating preference rows.
 * @returns Sparse icon choices and revision.
 */
export async function GET(): Promise<Response> {
  const session = await authenticate();
  if (!session) return Response.json({ error: "Sesión no válida." }, { status: 401 });
  try { return Response.json({ data: await createUserNavigationIconsActions(session.accessToken).get.execute(userId(session.userId)) }); }
  catch (cause) { return failure(cause); }
}

/** Replaces semantic icon choices with catalog validation and optimistic concurrency.
 * @param request - Expected revision and destination/icon choices.
 * @returns Authoritative saved choices.
 */
export async function PATCH(request: Request): Promise<Response> {
  const session = await authenticate();
  if (!session) return Response.json({ error: "Sesión no válida." }, { status: 401 });
  const input = updateSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Iconos de navegación inválidos." }, { status: 400 });
  try { return Response.json({ data: await createUserNavigationIconsActions(session.accessToken).update.execute({ userId: userId(session.userId), ...input.data }) }); }
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
  console.error("preferences.navigation_icons.failed", { cause });
  return Response.json({ error: "No se pudieron procesar los iconos del menú." }, { status: 500 });
}
