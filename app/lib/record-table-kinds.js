export const RECORD_TABLES = {
  pv_projects: {
    table: "pv_projects",
    orgStateKey: "mkl-pv-projects",
    module: "Photovoltaïque administratif",
  },
  thermal_studies: {
    table: "thermal_studies",
    orgStateKey: "mkl-thermal-studies",
    module: "Études thermiques",
  },
  maintenance_contracts: {
    table: "maintenance_contracts",
    orgStateKey: "mkl-contracts",
    module: "Maintenance",
  },
  cost_requests: {
    table: "cost_requests",
    orgStateKey: "mkl-cost-requests",
    module: "Demandes de chiffrage",
  },
  suppliers: {
    table: "suppliers",
    orgStateKey: "mkl-suppliers",
    module: "Fournisseurs",
  },
  technical_visits: {
    table: "technical_visits",
    orgStateKey: "mkl-technical-visits",
    module: "Visites techniques",
  },
  installations: {
    table: "installations",
    orgStateKey: "mkl-installations",
    module: "Chantiers",
    modules: ["Chantiers", "Planning"],
  },
  installation_teams: {
    table: "installation_teams",
    orgStateKey: "mkl-installation-teams",
    module: "Équipes d’installation",
  },
  purchase_orders: {
    table: "purchase_orders",
    orgStateKey: "mkl-purchase-orders",
    module: "Visites techniques",
  },
  maintenance_reports: {
    table: "maintenance_reports",
    orgStateKey: "mkl-maintenance-reports",
    module: "Maintenance",
  },
};

export const RECORD_TABLE_BY_ORG_KEY = Object.fromEntries(
  Object.entries(RECORD_TABLES).map(([kind, config]) => [config.orgStateKey, kind])
);

export const FIELD_SALES_SCOPED_RECORD_KINDS = ["pv_projects", "thermal_studies"];

export function isFieldSalesScopedRecordKind(kind) {
  return FIELD_SALES_SCOPED_RECORD_KINDS.includes(kind);
}

const FIELD_SALES_SCOPED_ORG_KEYS = ["mkl-pv-simulations"];

export function isFieldSalesScopedOrgKey(key) {
  return FIELD_SALES_SCOPED_ORG_KEYS.includes(key) || isFieldSalesScopedRecordKind(RECORD_TABLE_BY_ORG_KEY[key]);
}

export function isKnownRecordTable(kind) {
  return Boolean(RECORD_TABLES[kind]);
}

export function recordTableConfig(kind) {
  return RECORD_TABLES[kind] || null;
}

export function recordTableModules(kind) {
  const config = recordTableConfig(kind);
  if (!config) return [];
  return config.modules || [config.module];
}
