/** Catalogue RBAC MKL Énergies — source de vérité front/API (ÉTAPE 8). */

export const ACCESS_MODULES = [
  "Tableau de bord",
  "Prospects",
  "Agenda commercial",
  "Clients",
  "Devis",
  "Factures",
  "Factures pro forma",
  "Demandes de chiffrage",
  "Fournisseurs",
  "Planning",
  "Chantiers",
  "Équipes d’installation",
  "Maintenance",
  "Photovoltaïque administratif",
  "Visites techniques",
  "Gestion des articles",
  "Utilisateurs",
];

export const ACTION_PERMISSIONS = [
  { code: "action:backup", label: "Sauvegarde complète" },
  { code: "action:export_clients", label: "Exporter les clients" },
  { code: "action:delete_appointment", label: "Supprimer un rendez-vous" },
  { code: "action:manage_users", label: "Gérer les utilisateurs" },
  { code: "action:invite_users", label: "Inviter des utilisateurs" },
  { code: "action:delete_clients", label: "Supprimer des clients" },
  { code: "action:view_all_clients", label: "Voir tous les clients" },
  { code: "action:send_mail", label: "Envoyer des emails" },
];

/** Alias consignes → label stocké dans profiles.role */
export const ROLE_ALIASES = {
  Administrateur: "Admin VIP",
  Administratrice: "Admin VIP",
  Admin: "Admin VIP",
  "Admin VIP": "Admin VIP",
  "Admin second": "Admin second",
  Direction: "Direction",
  "Responsable commercial": "Responsable commercial",
  Commercial: "Commercial",
  Technicien: "Technicien",
  "Responsable technique": "Responsable technique",
  Secrétariat: "Secrétariat",
  Secretariat: "Secrétariat",
};

export const ROLE_CATALOG = [
  {
    code: "admin_vip",
    label: "Admin VIP",
    description: "Accès total, sécurité, utilisateurs, finances et paramètres",
    isAdmin: true,
    sortOrder: 10,
    modules: ACCESS_MODULES,
    actions: ACTION_PERMISSIONS.map(item => item.code),
  },
  {
    code: "admin_second",
    label: "Admin second",
    description: "Administration courante sans gestion de l’Admin VIP",
    isAdmin: true,
    sortOrder: 20,
    modules: ACCESS_MODULES.filter(module => module !== "Factures pro forma"),
    actions: [
      "action:backup",
      "action:export_clients",
      "action:delete_appointment",
      "action:manage_users",
      "action:invite_users",
      "action:delete_clients",
      "action:view_all_clients",
      "action:send_mail",
    ],
  },
  {
    code: "direction",
    label: "Direction",
    description: "Pilotage commercial et vision globale sans administration technique",
    isAdmin: false,
    sortOrder: 30,
    modules: [
      "Tableau de bord",
      "Prospects",
      "Agenda commercial",
      "Clients",
      "Devis",
      "Factures",
      "Planning",
      "Gestion des articles",
    ],
    actions: ["action:view_all_clients", "action:export_clients", "action:send_mail"],
  },
  {
    code: "responsable_commercial",
    label: "Responsable commercial",
    description: "Équipe commerciale, prospects, clients, devis et reporting",
    isAdmin: false,
    sortOrder: 40,
    modules: [
      "Tableau de bord",
      "Prospects",
      "Agenda commercial",
      "Clients",
      "Devis",
      "Planning",
      "Gestion des articles",
    ],
    actions: ["action:send_mail"],
  },
  {
    code: "commercial",
    label: "Commercial",
    description: "Ses prospects, clients, rendez-vous, devis et documents",
    isAdmin: false,
    sortOrder: 50,
    modules: ["Tableau de bord", "Prospects", "Agenda commercial", "Clients", "Devis", "Planning"],
    actions: [],
  },
  {
    code: "responsable_technique",
    label: "Responsable technique",
    description: "Chantiers, techniciens, planning, articles et maintenance",
    isAdmin: false,
    sortOrder: 60,
    modules: [
      "Tableau de bord",
      "Clients",
      "Demandes de chiffrage",
      "Fournisseurs",
      "Planning",
      "Chantiers",
      "Équipes d’installation",
      "Maintenance",
      "Gestion des articles",
    ],
    actions: ["action:send_mail"],
  },
  {
    code: "technicien",
    label: "Technicien",
    description: "Interventions assignées, documents terrain et comptes rendus",
    isAdmin: false,
    sortOrder: 70,
    modules: ["Tableau de bord", "Planning", "Chantiers", "Maintenance"],
    actions: [],
  },
  {
    code: "secretariat",
    label: "Secrétariat",
    description: "Suivi administratif clients, devis et facturation",
    isAdmin: false,
    sortOrder: 80,
    modules: [
      "Tableau de bord",
      "Agenda commercial",
      "Clients",
      "Devis",
      "Factures",
      "Factures pro forma",
    ],
    actions: ["action:view_all_clients", "action:export_clients"],
  },
];

export function normalizeRoleLabel(role) {
  const raw = String(role || "").trim();
  if (!raw) return "Commercial";
  return ROLE_ALIASES[raw] || raw;
}

export function getRoleDefinition(role) {
  const label = normalizeRoleLabel(role);
  return ROLE_CATALOG.find(item => item.label === label) || null;
}

export function isKnownRole(role) {
  return Boolean(getRoleDefinition(role));
}

export function roleDescriptions() {
  return Object.fromEntries(ROLE_CATALOG.map(role => [role.label, role.description]));
}

export function roleModuleDefaults() {
  return Object.fromEntries(ROLE_CATALOG.map(role => [role.label, [...role.modules]]));
}

export function roleActionCodes(role) {
  const definition = getRoleDefinition(role);
  return definition ? [...definition.actions] : [];
}

export function modulePermissionCode(moduleName) {
  return `module:${moduleName}`;
}

export function actionPermissionCode(action) {
  return action.startsWith("action:") ? action : `action:${action}`;
}

export function profilePermissionCodes(profile) {
  if (!profile) return [];
  const definition = getRoleDefinition(profile.role);
  const modules =
    definition?.isAdmin
      ? definition.modules
      : profile.modules?.length
        ? profile.modules
        : definition?.modules || ["Tableau de bord"];
  const actions = definition?.actions || [];
  return [
    ...modules.map(modulePermissionCode),
    ...actions,
  ];
}

export function profileHasPermission(profile, permissionCode) {
  if (!profile?.active || !profile?.onboarding_completed_at) return false;
  const code = permissionCode.startsWith("module:") || permissionCode.startsWith("action:")
    ? permissionCode
    : permissionCode.includes(":")
      ? permissionCode
      : null;
  if (!code) return false;
  const definition = getRoleDefinition(profile.role);
  if (definition?.isAdmin && code.startsWith("module:")) return true;
  return profilePermissionCodes(profile).includes(code);
}

export function selectableRoles() {
  return ROLE_CATALOG.map(role => role.label);
}
