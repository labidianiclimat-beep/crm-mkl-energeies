import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canAccessModule, canPerformAction, isAdminVip } from "../app/lib/permissions.js";
import { canAccessWorkspace, resolveAllowedModules } from "../app/lib/access-control.js";
import { canViewOrgWideCommercialData } from "../app/lib/scoping.js";
import { canManageArticles } from "../app/lib/articles.js";
import {
  applyUserPreview,
  canPreviewTarget,
  readPreviewUserIdFromRequest,
  ROLE_PREVIEW_HEADER,
  sanitizePreviewUserId,
} from "../app/lib/role-preview.js";

const vip = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  role: "Admin VIP",
  modules: ["Clients", "Utilisateurs"],
  active: true,
  onboarding_completed_at: "2026-01-01T00:00:00Z",
  organization_id: "org-1",
  full_name: "Admin VIP",
  email: "contact@mkl-energies.fr",
};

const commercial = {
  id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  organization_id: "org-1",
  role: "Commercial",
  modules: ["Tableau de bord", "Prospects", "Agenda commercial", "Clients", "Devis"],
  full_name: "Léa Martin",
  email: "lea@mkl-energies.fr",
  manager: "Karim",
  active: true,
};

test("la vue utilisateur ignore un id vide, soi-meme ou une autre org", () => {
  assert.equal(sanitizePreviewUserId(""), "");
  assert.equal(sanitizePreviewUserId("Commercial"), "");
  assert.equal(sanitizePreviewUserId(commercial.id), commercial.id);
  assert.equal(applyUserPreview(vip, { ...commercial, id: vip.id }).previewUserId, undefined);
  assert.equal(applyUserPreview(vip, { ...commercial, organization_id: "autre" }).previewUserId, undefined);
});

test("un non vip ne peut pas activer une vue utilisateur", () => {
  const next = applyUserPreview({ ...vip, role: "Commercial", modules: ["Devis"] }, commercial);
  assert.equal(next.role, "Commercial");
  assert.equal(next.previewUserId, undefined);
});

test("la vue d un commercial copie ses menus et son perimetre", () => {
  const preview = applyUserPreview(vip, commercial);
  const allowed = resolveAllowedModules(preview);
  assert.equal(preview.role, "Commercial");
  assert.equal(preview.id, commercial.id);
  assert.equal(preview.realRole, "Admin VIP");
  assert.equal(preview.realUserId, vip.id);
  assert.equal(preview.previewUserName, "Léa Martin");
  assert.equal(isAdminVip(preview.role), false);
  assert.equal(canAccessModule(preview, "Devis"), true);
  assert.equal(canAccessModule(preview, "Utilisateurs"), false);
  assert.equal(canPerformAction(preview, "invite_users"), false);
  assert.equal(canViewOrgWideCommercialData(preview), false);
  assert.equal(canAccessWorkspace(allowed, "Entreprise", preview), false);
  assert.equal(canAccessWorkspace(allowed, "Devis", preview), true);
});

test("l entete ou le cookie portent l utilisateur choisi", () => {
  const fromHeader = readPreviewUserIdFromRequest({
    headers: { get: name => name === ROLE_PREVIEW_HEADER ? commercial.id : "" },
  });
  assert.equal(fromHeader, commercial.id);
  const fromCookie = readPreviewUserIdFromRequest({
    headers: { get: name => name === "cookie" ? `mkl-user-preview=${commercial.id}` : "" },
  });
  assert.equal(fromCookie, commercial.id);
});

test("la vue reprend les modules reels de la personne, pas seulement le role", () => {
  const rp = {
    ...commercial,
    id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    role: "Responsable prospection",
    modules: ["Prospects", "Agenda commercial", "Gestion des articles"],
    full_name: "Nora Dispatch",
  };
  const preview = applyUserPreview(vip, rp);
  assert.equal(canManageArticles(preview), true);
  assert.equal(canAccessModule(preview, "Devis"), false);
  assert.equal(canAccessModule(preview, "Prospects"), true);
});

test("un technicien en attente d activation peut etre choisi, un compte desactive non", () => {
  const technician = {
    id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    organization_id: "org-1",
    role: "Technicien",
    modules: ["Planning", "Chantiers", "Maintenance"],
    full_name: "Yanis Terrain",
    active: false,
    onboarding_completed_at: null,
    authStatus: "En attente d’envoi",
  };
  assert.equal(canPreviewTarget(technician), true);
  const preview = applyUserPreview(vip, technician);
  assert.equal(preview.role, "Technicien");
  assert.equal(preview.previewUserName, "Yanis Terrain");
  const disabled = { ...technician, active: false, onboarding_completed_at: "2026-01-01T00:00:00Z", authStatus: "Inactif" };
  assert.equal(canPreviewTarget(disabled), false);
  assert.equal(applyUserPreview(vip, disabled).previewUserId, undefined);
});

test("sans vue choisie l admin vip reste admin vip", () => {
  const next = applyUserPreview(vip, null);
  assert.equal(next.role, "Admin VIP");
  assert.equal(isAdminVip(next.role), true);
  assert.equal(canAccessModule(next, "Utilisateurs"), true);
});

test("la connexion et le bandeau exposent la vue utilisateur", () => {
  const gate = readFileSync(new URL("../app/components/crm-access-gate.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const rest = readFileSync(new URL("../app/lib/supabase-rest.js", import.meta.url), "utf8");
  const auth = readFileSync(new URL("../app/lib/api-auth.js", import.meta.url), "utf8");
  assert.match(gate, /Voir le CRM comme/);
  assert.match(gate, /Moi — Admin VIP/);
  assert.match(gate, /setUserPreview/);
  assert.match(gate, /loadOrgUsers/);
  assert.match(rest, /keepRolePreview/);
  assert.match(page, /role-preview-banner/);
  assert.match(page, /Revenir à Admin VIP/);
  const previewLib = readFileSync(new URL("../app/lib/role-preview.js", import.meta.url), "utf8");
  assert.match(previewLib, /34560000/);
  assert.match(rest, /rolePreviewHeaders/);
  assert.match(auth, /withUserPreview/);
  assert.match(auth, /previewUserId/);
});
