import { after } from "next/server";
import {
  fetchMetaLead,
  metaLeadgenChanges,
  metaSignatureValid,
  metaVerifyChallenge,
  recordMetaLead,
} from "../../../lib/meta-leads";

/**
 * Webhook des formulaires instantanés Meta (page MKL Energies).
 * La signature est vérifiée sur le corps brut. Chaque prospect rejoint la
 * même file que les demandes Google Ads.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const url = new URL(request.url);
  const check = metaVerifyChallenge({
    mode: url.searchParams.get("hub.mode"),
    token: url.searchParams.get("hub.verify_token"),
    challenge: url.searchParams.get("hub.challenge"),
    expected: process.env.META_VERIFY_TOKEN || "",
  });
  if (!check.ok) return new Response("Forbidden", { status: 403 });
  return new Response(check.challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request) {
  const rawBody = await request.text();
  if (!metaSignatureValid(rawBody, request.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET || "")) {
    return Response.json({ ok: false }, { status: 401 });
  }

  let body = {};
  try {
    body = JSON.parse(rawBody);
  } catch {
    console.error("meta-leads : corps illisible");
    return Response.json({ ok: true });
  }

  const changes = metaLeadgenChanges(body);
  const token = process.env.META_PAGE_TOKEN || "";
  if (changes.length && token) {
    after(async () => {
      for (const change of changes) {
        try {
          const lead = await fetchMetaLead(change.leadgenId, token);
          await recordMetaLead(lead, change);
        } catch (error) {
          console.error(`meta-leads ${change.leadgenId} : ${String(error?.message || error).slice(0, 180)}`);
        }
      }
    });
  } else if (changes.length) {
    console.error("meta-leads : META_PAGE_TOKEN absent");
  }

  return Response.json({ ok: true });
}
