import { cookies } from "next/headers";
import {
  createSessionToken,
  pinConfigured,
  sessionCookieOptions,
  SESSION_COOKIE,
  verifyPin,
} from "../../../lib/crm-session";

export const runtime = "nodejs";

export async function POST(request) {
  if (!pinConfigured()) {
    return Response.json({ error: "Le code PIN n’est pas configuré sur le serveur." }, { status: 503 });
  }

  const { pin } = await request.json().catch(() => ({}));
  if (!verifyPin(pin)) {
    return Response.json({ error: "Code PIN incorrect." }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, createSessionToken(), sessionCookieOptions());
  return Response.json({ ok: true });
}
