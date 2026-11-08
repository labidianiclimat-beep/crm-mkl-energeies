/** Catalogue RBAC MKL Énergies — source de vérité front/API (ÉTAPE 8). */

export const ACCESS_MODULES = [
  "Tableau de bord",
  "Prospects",
  "Agenda commercial",
  "Clients",
  "Devis",
  "Études thermiques",
  "Simulateur photovoltaïque",
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
  "Grilles tarifaires PDF",
  "Parc automobile",
  "Tickets internes",
  "SAV",
  "Utilisateurs",
];

export const ACTION_PERMISSIONS = [
  { code: "action:backup", label: "Sauvegarde complète" },
  { code: "action:export_clients", label: "Exporter les clients" },
  { code: "action:delete_appointment", label: "Supprimer un rendez-vous" },
  { code: "action:manage_users", label: "Gérer les utilisateurs" },
  { code: "action:invite_users", label: "Inviter des utilisateurs" },
  { code: "action:delete_clients", label: "Supprimer des clients" },
  { code: "action:delete_prospects", label: "Supprimer des prospects" },
  { code: "action:view_all_clients", label: "Voir tous les clients" },
  { code: "action:send_mail", label: "Envoyer des emails" },
  { code: "action:dispatch_prospects", label: "Attribuer des prospects" },
  { code: "action:delete_articles", label: "Supprimer des articles", exclusive: true },
  { code: "action:manage_fleet", label: "Gérer le parc automobile" },
  { code: "action:assign_fleet", label: "Affecter un véhicule", exclusive: true },
  { code: "action:validate_fleet", label: "Valider les déclarations parc", exclusive: true },
  { code: "action:archive_fleet", label: "Archiver un véhicule", exclusive: true },
];

/** Alias consignes → label stocké dans profiles.role */
export const ROLE_ALIASES = {
  Administrateur: "Admin VIP",
  Administratrice: "Admin VIP",
  Admin: "Admin VIP",
  "Admin VIP": "Admin VIP",
  "Admin second": "Superadmin",
  Superadmin: "Superadmin",
  "Super admin": "Superadmin",
  SuperAdmin: "Superadmin",
  // « Lecture » ne figure pas ici, et ne doit pas y revenir. Ce libellé annonce
  // une consultation ; il était associé à « Superadmin », c'est-à-dire à
  // l'administration courante. Qui l'attribuerait en croyant restreindre
  // accorderait l'inverse. Aucun compte ne le porte — relevé en production le
  // 7 novembre, vingt-trois profils, neuf libellés tous déjà canoniques — et le
  // catalogue ne propose aucun rôle de consultation seule : il n'y a donc rien
  // à traduire. Un libellé hérité qui ne correspond à aucun rôle connu
  // n'obtient aucun droit, ce que `sanitizeGrantedModules` garantit plus bas.
  Direction: "Direction",
  "Responsable commercial": "Responsable commercial",
  "Responsable prospection": "Responsable prospection",
  "Prospecteur terrain": "Prospecteur terrain",
  Prospecteur: "Prospecteur terrain",
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
    description: "Tous les droits, sur toutes les applications",
    isAdmin: true,
    sortOrder: 10,
    modules: ACCESS_MODULES,
    actions: ACTION_PERMISSIONS.map(item => item.code),
  },
  {
    code: "admin_second",
    label: "Superadmin",
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
      "action:delete_prospects",
      "action:view_all_clients",
      "action:send_mail",
      "action:manage_fleet",
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
      "Études thermiques",
      "Simulateur photovoltaïque",
      "Factures",
      "Planning",
      "Gestion des articles",
      "Grilles tarifaires PDF",
      "Parc automobile",
      "Tickets internes",
      "SAV",
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
      "Études thermiques",
      "Simulateur photovoltaïque",
      "Planning",
      "Gestion des articles",
      "Grilles tarifaires PDF",
      "Tickets internes",
    ],
    actions: ["action:send_mail"],
  },
  {
    code: "responsable_prospection",
    label: "Responsable prospection",
    description: "Crée et répartit les prospects, agendas professionnels, sans devis ni factures",
    isAdmin: false,
    sortOrder: 45,
    modules: ["Tableau de bord", "Prospects", "Agenda commercial", "Gestion des articles", "Parc automobile", "Tickets internes"],
    actions: ["action:send_mail", "action:dispatch_prospects", "action:delete_prospects"],
  },
  {
    code: "prospecteur_terrain",
    label: "Prospecteur terrain",
    description: "Saisie des fiches prospects sur le terrain. Modification possible pendant 30 minutes, puis consultation du statut.",
    isAdmin: false,
    sortOrder: 47,
    modules: ["Prospects"],
    actions: [],
  },
  {
    code: "commercial",
    label: "Commercial",
    description: "Ses prospects, clients, rendez-vous, devis et documents",
    isAdmin: false,
    sortOrder: 50,
    modules: ["Tableau de bord", "Prospects", "Agenda commercial", "Clients", "Devis", "Études thermiques", "Simulateur photovoltaïque", "Photovoltaïque administratif", "Planning", "Grilles tarifaires PDF", "Tickets internes"],
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
      "Visites techniques",
      "Maintenance",
      "Photovoltaïque administratif",
      "Gestion des articles",
      "Grilles tarifaires PDF",
      "Tickets internes",
      "SAV",
    ],
    actions: ["action:send_mail"],
  },
  {
    code: "technicien",
    label: "Technicien",
    description: "Agenda du jour et de la semaine, formulaires d’entretien",
    isAdmin: false,
    sortOrder: 70,
    modules: ["Planning", "Chantiers", "Visites techniques", "Maintenance", "Tickets internes", "SAV"],
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
      "Chantiers",
      "Tickets internes",
      "SAV",
    ],
    actions: ["action:view_all_clients", "action:export_clients"],
  },
];

export function normalizeRoleLabel(role) {
  const raw = String(role || "").trim();
  if (!raw) return "Commercial";
  return ROLE_ALIASES[raw] || raw;
}

export function isAdminVipRole(role) {
  return normalizeRoleLabel(role) === "Admin VIP";
}

export function allPermissionCodes() {
  return [
    ...ACCESS_MODULES.map(modulePermissionCode),
    ...ACTION_PERMISSIONS.map(item => item.code),
  ];
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

const MODULE_ALIASES = {
  Prospect: "Prospects",
  "Devis & Factures": "Devis",
  Articles: "Gestion des articles",
  "Catégories d’articles": "Gestion des articles",
  "Groupes d’articles": "Gestion des articles",
  "Bibliothèque de groupes": "Gestion des articles",
  Catalogue: "Gestion des articles",
  "Grille tarifaire": "Grilles tarifaires PDF",
  "Grilles tarifaires": "Grilles tarifaires PDF",
  "Vue d’ensemble": "Tableau de bord",
  Dashboard: "Tableau de bord",
  "Demandes internes": "Tickets internes",
};

export function sanitizeGrantedModules(modules = [], { role } = {}) {
  const next = [];
  for (const raw of Array.isArray(modules) ? modules : []) {
    const name = MODULE_ALIASES[raw] || raw;
    if (ACCESS_MODULES.includes(name) && !next.includes(name)) next.push(name);
  }
  const definition = role ? getRoleDefinition(role) : null;
  // La gestion des utilisateurs n'est conservée que pour un rôle reconnu comme
  // administrateur. Un libellé inconnu — un rôle hérité, une faute de frappe —
  // la perd aussi : il valait mieux, auparavant, être non reconnu que
  // simplement non administrateur, puisque l'absence de définition laissait
  // passer le module. Un rôle vide ou absent n'est pas concerné : il devient
  // « Commercial » par `normalizeRoleLabel`, donc une définition existe.
  if (!definition || !definition.isAdmin) {
    return next.filter(module => module !== "Utilisateurs");
  }
  return next;
}

export function grantedModules(profile, roleDefaults = roleModuleDefaults()) {
  if (!profile) return [];
  if (isAdminVipRole(profile.role)) return [...ACCESS_MODULES];
  const definition = getRoleDefinition(profile.role);
  let modules;
  if (definition?.isAdmin) {
    modules = [...(roleDefaults[definition.label] || definition.modules || ACCESS_MODULES)];
  } else if (Array.isArray(profile.modules)) {
    modules = sanitizeGrantedModules(profile.modules, { role: profile.role });
  } else {
    modules = [...(roleDefaults[definition?.label] || definition?.modules || ["Tableau de bord"])];
  }
  if (normalizeRoleLabel(profile.role) === "Commercial") {
    for (const extra of ["Agenda commercial", "Devis", "Études thermiques", "Photovoltaïque administratif"]) {
      if (!modules.includes(extra)) modules.push(extra);
    }
  }
  if (normalizeRoleLabel(profile.role) === "Responsable prospection") {
    if (!modules.includes("Gestion des articles")) modules.push("Gestion des articles");
    if (!modules.includes("Parc automobile")) modules.push("Parc automobile");
  }
  if (normalizeRoleLabel(profile.role) === "Responsable technique") {
    if (!modules.includes("Photovoltaïque administratif")) modules.push("Photovoltaïque administratif");
    if (!modules.includes("Visites techniques")) modules.push("Visites techniques");
  }
  if (normalizeRoleLabel(profile.role) === "Technicien") {
    modules = modules.filter(module => module !== "Tableau de bord");
    if (!modules.includes("Maintenance")) modules.push("Maintenance");
    if (!modules.includes("Visites techniques")) modules.push("Visites techniques");
  }
  if (normalizeRoleLabel(profile.role) !== "Prospecteur terrain" && !modules.includes("Tickets internes")) {
    modules.push("Tickets internes");
  }
  if (normalizeRoleLabel(profile.role) === "Secrétariat" && !modules.includes("Chantiers")) {
    modules.push("Chantiers");
  }
  if (["Direction", "Secrétariat", "Responsable technique", "Technicien", "Superadmin"].includes(normalizeRoleLabel(profile.role)) && !modules.includes("SAV")) {
    modules.push("SAV");
  }
  return modules;
}

export function modulePermissionCode(moduleName) {
  return `module:${moduleName}`;
}

export function actionPermissionCode(action) {
  return action.startsWith("action:") ? action : `action:${action}`;
}

export function exclusiveActionCodes() {
  return ACTION_PERMISSIONS.filter(item => item.exclusive).map(item => item.code);
}

export function extractGrantedActions(list = []) {
  const known = new Set(ACTION_PERMISSIONS.map(item => item.code));
  const found = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const code = actionPermissionCode(String(raw || "").trim());
    if (known.has(code) && !found.includes(code)) found.push(code);
  }
  return found;
}

export function mergeModulesAndActions(modules = [], actions = [], { role } = {}) {
  return [...sanitizeGrantedModules(modules, { role }), ...extractGrantedActions(actions)];
}

export function assertAssignableAccess({
  actorRole,
  nextRole,
  existingRole,
  nextActions = [],
  existingActions = [],
} = {}) {
  const actorIsVip = isAdminVipRole(actorRole);
  if (isAdminVipRole(nextRole) && !actorIsVip) {
    return { ok: false, error: "Seul l’Admin VIP peut attribuer le rôle Admin VIP." };
  }
  if (isAdminVipRole(existingRole) && !actorIsVip) {
    return { ok: false, error: "Seul l’Admin VIP peut modifier un compte Admin VIP." };
  }
  if (!actorIsVip) {
    const exclusive = exclusiveActionCodes();
    const alreadyGranted = new Set(extractGrantedActions(existingActions));
    const granting = extractGrantedActions(nextActions).filter(code => exclusive.includes(code) && !alreadyGranted.has(code));
    if (granting.length) {
      return { ok: false, error: "Seul l’Admin VIP peut accorder une fonction exclusive." };
    }
  }
  return { ok: true };
}

export function persistProfileAccess({ modules, actions, role, existingModules, actorRole } = {}) {
  if (isAdminVipRole(role)) {
    return mergeModulesAndActions(ACCESS_MODULES, ACTION_PERMISSIONS.map(item => item.code), { role });
  }
  const nextModules = sanitizeGrantedModules(modules ?? existingModules, { role });
  if (normalizeRoleLabel(role) === "Responsable prospection") {
    if (!nextModules.includes("Gestion des articles")) nextModules.push("Gestion des articles");
    if (!nextModules.includes("Parc automobile")) nextModules.push("Parc automobile");
  }
  if (normalizeRoleLabel(role) === "Responsable technique") {
    if (!nextModules.includes("Photovoltaïque administratif")) nextModules.push("Photovoltaïque administratif");
  }
  if (role && normalizeRoleLabel(role) !== "Prospecteur terrain" && !isAdminVipRole(role) && !nextModules.includes("Tickets internes")) {
    nextModules.push("Tickets internes");
  }
  if (role && ["Direction", "Secrétariat", "Responsable technique", "Technicien", "Superadmin"].includes(normalizeRoleLabel(role)) && !nextModules.includes("SAV")) {
    nextModules.push("SAV");
  }
  let nextActions = actions !== undefined
    ? extractGrantedActions(actions)
    : extractGrantedActions(modules ?? existingModules);
  if (!isAdminVipRole(actorRole)) {
    const exclusive = new Set(exclusiveActionCodes());
    const keep = new Set(extractGrantedActions(existingModules));
    nextActions = nextActions.filter(code => !exclusive.has(code) || keep.has(code));
  }
  return mergeModulesAndActions(nextModules, nextActions, { role });
}

export function profilePermissionCodes(profile) {
  if (!profile) return [];
  if (isAdminVipRole(profile.role)) return allPermissionCodes();
  const definition = getRoleDefinition(profile.role);
  const modules = grantedModules(profile);
  const exclusive = exclusiveActionCodes();
  const roleActions = (definition?.actions || []).filter(code => !exclusive.includes(code));
  const extraActions = extractGrantedActions([
    ...(Array.isArray(profile.actions) ? profile.actions : []),
    ...(Array.isArray(profile.modules) ? profile.modules : []),
  ]);
  return [
    ...modules.map(modulePermissionCode),
    ...roleActions,
    ...extraActions,
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
  if (isAdminVipRole(profile.role)) return allPermissionCodes().includes(code);
  const definition = getRoleDefinition(profile.role);
  if (definition?.isAdmin && code.startsWith("module:")) return true;
  return profilePermissionCodes(profile).includes(code);
}

export function selectableRoles(actorRole) {
  const labels = ROLE_CATALOG.map(role => role.label);
  if (actorRole == null || isAdminVipRole(actorRole)) return labels;
  return labels.filter(label => !isAdminVipRole(label));
}
