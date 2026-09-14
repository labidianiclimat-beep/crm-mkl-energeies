import { cookies } from "next/headers";
import { SESSION_COOKIE } from "../../../lib/crm-session";

export const runtime = "nodejs";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return Response.json({ ok: true });
}
