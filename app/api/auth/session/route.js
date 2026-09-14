import { cookies } from "next/headers";
import { pinConfigured, SESSION_COOKIE, verifySessionToken } from "../../../lib/crm-session";

export const runtime = "nodejs";

export async function GET() {
  if (!pinConfigured()) {
    return Response.json({ authenticated: false, configured: false });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return Response.json({
    authenticated: verifySessionToken(token),
    configured: true,
  });
}
