import { requireApiSession } from "../../lib/api-auth";
import { ROLE_CATALOG, ACTION_PERMISSIONS, ACCESS_MODULES } from "../../lib/roles";
import { listProfilePermissions } from "../../lib/permissions";
import { serviceRequest, serviceRoleConfigured } from "../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    let dbRoles = null;
    let dbPermissions = null;
    if (serviceRoleConfigured()) {
      try {
        dbRoles = await serviceRequest("/rest/v1/roles?select=code,label,description,is_admin,sort_order&order=sort_order.asc");
        dbPermissions = await serviceRequest("/rest/v1/permissions?select=code,label,category&order=category.asc,label.asc");
      } catch (error) {
        console.warn("Roles catalog fallback to code defaults", error.message);
      }
    }

    return Response.json({
      roles: dbRoles?.length
        ? dbRoles.map(role => ({
            code: role.code,
            label: role.label,
            description: role.description,
            isAdmin: role.is_admin,
            sortOrder: role.sort_order,
          }))
        : ROLE_CATALOG.map(role => ({
            code: role.code,
            label: role.label,
            description: role.description,
            isAdmin: role.isAdmin,
            sortOrder: role.sortOrder,
            modules: role.modules,
            actions: role.actions,
          })),
      permissions: dbPermissions?.length
        ? dbPermissions
        : [
            ...ACCESS_MODULES.map(module => ({ code: `module:${module}`, label: module, category: "module" })),
            ...ACTION_PERMISSIONS.map(item => ({ ...item, category: "action" })),
          ],
      myPermissions: listProfilePermissions(auth.profile),
      source: dbRoles?.length ? "database" : "code",
    });
  } catch (error) {
    console.error("Roles list error", error.message);
    return Response.json({ error: "Impossible de charger les rôles." }, { status: 502 });
  }
}
