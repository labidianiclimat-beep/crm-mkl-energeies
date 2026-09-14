import { NextResponse } from "next/server";
import { deniedDirectUrlReason } from "./app/lib/scoping";

/**
 * Garde URL : espaces admin / users non exposés hors CRM.
 * L’accès réel aux fiches clients/devis se contrôle aussi côté API + RLS.
 */
export function middleware(request) {
  const { pathname } = request.nextUrl;
  const denied = deniedDirectUrlReason(pathname);
  if (denied) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("denied", denied);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/administration/:path*", "/users", "/users/:path*"],
};
