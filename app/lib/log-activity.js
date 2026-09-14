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
  return {
    organizationId: auth?.profile?.organization_id,
    userId: auth?.user?.id || auth?.profile?.id || null,
    userName: auth?.profile?.full_name || auth?.profile?.email || null,
  };
}
