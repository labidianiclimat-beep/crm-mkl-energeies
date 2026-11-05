import { buildActivityLogEntry } from "./activity-logs";
import { serviceRequest } from "./supabase-server";

/**
 * Écrit un événement dans activity_logs. Ne propage jamais d’erreur métier.
 */
export async function logActivity(input) {
  try {
    const row = buildActivityLogEntry(input);
    await serviceRequest("/rest/v1/activity_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: row,
    });
  } catch (error) {
    console.error("activity_logs write failed", error?.message || error);
  }
}

export function actorFromAuth(auth) {
  const realId = auth?.realUserId || auth?.profile?.realUserId || null;
  const previewName = auth?.profile?.previewUserName;
  const ownName = auth?.profile?.realUserName || auth?.profile?.full_name || auth?.profile?.email || null;
  return {
    organizationId: auth?.profile?.organization_id,
    userId: realId || auth?.user?.id || auth?.profile?.id || null,
    userName: previewName ? `${ownName} (vue ${previewName})` : ownName,
  };
}
