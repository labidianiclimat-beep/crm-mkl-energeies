import { notifyUser } from "./google-calendar.js";
import { serviceRequest } from "./supabase-server.js";

export async function loadCommercialAndManager(orgId, commercialId) {
  if (!orgId || !commercialId) return { commercial: null, manager: null };
  const rows = await serviceRequest(
    `/rest/v1/profiles?select=id,full_name,email,manager&id=eq.${encodeURIComponent(commercialId)}` +
      `&organization_id=eq.${encodeURIComponent(orgId)}&limit=1`
  ).catch(() => []);
  const commercial = rows?.[0] || null;
  const managerName = String(commercial?.manager || "").trim();
  if (!commercial || !managerName || /^direction/i.test(managerName)) {
    return { commercial, manager: null };
  }
  const managers = await serviceRequest(
    `/rest/v1/profiles?select=id,full_name,email` +
      `&organization_id=eq.${encodeURIComponent(orgId)}&active=eq.true` +
      `&or=(full_name.eq.${encodeURIComponent(managerName)},email.eq.${encodeURIComponent(managerName.toLowerCase())})` +
      `&limit=1`
  ).catch(() => []);
  const manager = managers?.[0] && String(managers[0].id) !== String(commercial.id) ? managers[0] : null;
  return { commercial, manager };
}

export async function notifyCommercialAndManager({
  orgId,
  commercialId,
  title,
  body,
  uniqueKey,
}) {
  const { commercial, manager } = await loadCommercialAndManager(orgId, commercialId);
  const recipients = [commercial, manager].filter(user => user?.id);
  const seen = new Set();
  for (const user of recipients) {
    if (seen.has(user.id)) continue;
    seen.add(user.id);
    await notifyUser({
      orgId,
      userId: user.id,
      title,
      body,
      uniqueKey: `${uniqueKey}:${user.id}:${Date.now()}`,
      email: user.email,
      sendEmail: true,
    });
  }
  return { notified: [...seen] };
}
