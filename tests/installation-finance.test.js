import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  addPurchaseLine,
  assembleInstallationFinances,
  canReadInstallationFinance,
  canWriteInstallationFinance,
  centsToInput,
  emptyInstallationFinance,
  financeToDraft,
  financeWriteResponse,
  formatEuroFromCents,
  installationFinanceAudit,
  installationSalespeople,
  parseEuroToCents,
  removePurchaseLine,
  stripInstallationFinance,
  validateInstallationFinance,
} from "../app/lib/installation-finance.js";

const commercialId = "11111111-1111-4111-8111-111111111111";
const source = path => readFileSync(new URL(path, import.meta.url), "utf8");

function draft(extra = {}) {
  return {
    commercialId,
    saleTtc: "1500,50",
    poseAmount: "400",
    purchases: [
      { key: "a", label: "Groupe extérieur", amount: "800,25" },
      { key: "b", label: "Liaisons", amount: "19,75" },
    ],
    ...extra,
  };
}

test("le commercial et les montants du chantier sont obligatoires", () => {
  assert.equal(validateInstallationFinance({}).ok, false);
  assert.match(validateInstallationFinance({ saleTtc: "10", poseAmount: "1", purchases: [{ label: "Vis", amount: "1" }] }).error, /commercial/i);
  assert.match(validateInstallationFinance({ commercialId, poseAmount: "1", purchases: [{ label: "Vis", amount: "1" }] }).error, /vente TTC/i);
  assert.match(validateInstallationFinance({ commercialId, saleTtc: "10", purchases: [{ label: "Vis", amount: "1" }] }).error, /pose/i);
  assert.match(validateInstallationFinance({ commercialId, saleTtc: "10", poseAmount: "1", purchases: [] }).error, /achat/i);
  assert.equal(parseEuroToCents("-1").ok, false);
  assert.equal(parseEuroToCents("10,555").ok, false);
  assert.equal(parseEuroToCents("10,50").cents, 1050);
  assert.equal(parseEuroToCents("0").cents, 0);
  assert.equal(parseEuroToCents(10.5).ok, false);
});

test("sans commercial, Autres permet d’enregistrer les montants", () => {
  const saved = validateInstallationFinance({
    commercialId: "autres",
    saleTtc: "10",
    poseAmount: "1",
    purchases: [{ label: "Vis", amount: "1" }],
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.commercialId, null);
  const draft = financeToDraft({
    commercialId: "",
    saleTtcCents: 1000,
    poseCents: 100,
    purchases: [],
  });
  assert.equal(draft.commercialId, "autres");
  const [finance] = assembleInstallationFinances([{
    id: "f-autres",
    installation_id: "7",
    commercial_id: null,
    sale_ttc_cents: 1000,
    pose_cents: 100,
  }], [], []);
  assert.equal(finance.commercialName, "Autres");
});

test("une fiche accepte une ou plusieurs lignes d’achat et le serveur recalcule le total", () => {
  const one = validateInstallationFinance({
    commercialId,
    saleTtc: "10",
    poseAmount: "0",
    purchases: [{ label: "Vis", amount: "2,5" }],
    purchaseTotal: 1,
  });
  assert.equal(one.ok, true);
  assert.equal(one.purchases.length, 1);
  assert.equal(one.purchaseTotalCents, 250);
  const several = validateInstallationFinance(draft());
  assert.equal(several.ok, true);
  assert.equal(several.saleTtcCents, 150050);
  assert.equal(several.poseCents, 40000);
  assert.equal(several.purchaseTotalCents, 82000);
  assert.equal(formatEuroFromCents(several.purchaseTotalCents), new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(820));
});

test("les lignes d’achat s’ajoutent et se retirent avant l’enregistrement", () => {
  const start = emptyInstallationFinance();
  assert.equal(start.purchases.length, 1);
  const added = addPurchaseLine(start);
  assert.equal(added.purchases.length, 2);
  const removed = removePurchaseLine(added, added.purchases[1].key);
  assert.equal(removed.purchases.length, 1);
  assert.equal(removePurchaseLine(removed, removed.purchases[0].key), removed);
  const saved = financeToDraft({
    commercialId,
    saleTtcCents: 1000,
    poseCents: 200,
    purchases: [
      { id: "p1", label: "Gaines", amountCents: 300 },
      { id: "p2", label: "Supports", amountCents: 150 },
    ],
  });
  assert.equal(saved.purchases.length, 2);
  assert.equal(centsToInput(1050), "10,50");
  assert.equal(removePurchaseLine(saved, "p2").purchases.map(line => line.label).join(","), "Gaines");
});

test("seuls les rôles prévus saisissent ou consultent les montants", () => {
  for (const role of ["Secrétariat", "Responsable technique"]) {
    assert.equal(canWriteInstallationFinance(role), true, role);
    assert.equal(canReadInstallationFinance(role), false, role);
  }
  for (const role of ["Superadmin", "Admin VIP", "Admin second"]) {
    assert.equal(canWriteInstallationFinance(role), true, role);
    assert.equal(canReadInstallationFinance(role), true, role);
  }
  for (const role of ["Commercial", "Responsable commercial", "Technicien", "Direction"]) {
    assert.equal(canWriteInstallationFinance(role), false, role);
    assert.equal(canReadInstallationFinance(role), false, role);
  }
  const hidden = financeWriteResponse(false, { saleTtcCents: 999, purchases: [{ label: "Secret", amountCents: 1 }] });
  assert.deepEqual(hidden, { ok: true });
  assert.equal(JSON.stringify(hidden).includes("999"), false);
  const visible = financeWriteResponse(true, { saleTtcCents: 100 });
  assert.equal(visible.finance.saleTtcCents, 100);
});

test("l’audit et les dossiers chantier ne contiennent pas les montants", () => {
  const parsed = validateInstallationFinance(draft());
  const audit = installationFinanceAudit(parsed);
  const auditText = JSON.stringify(audit);
  assert.equal(audit.newValue.purchaseCount, 2);
  assert.equal(/150050|800,25|Groupe extérieur|commercialId|saleTtc|poseCents|amountCents/.test(auditText), false);
  const stored = stripInstallationFinance({
    id: 4,
    project: "PAC",
    commercialId,
    saleTtcCents: 150050,
    poseAmount: "400",
    purchases: [{ label: "Groupe", amount: "10" }],
    purchaseTotalCents: 1000,
    finance: { saleTtcCents: 1 },
  });
  assert.equal(stored.project, "PAC");
  assert.equal(stored.commercialId, undefined);
  assert.equal(stored.purchases, undefined);
  assert.equal(JSON.stringify(stored).includes("150050"), false);
  const people = installationSalespeople([
    { id: commercialId, name: "Léa Martin", role: "Commercial", active: true },
    { id: "22222222-2222-4222-8222-222222222222", name: "Technicien", role: "Technicien", active: true },
    { id: "pas-un-uuid", name: "Ancien", role: "Commercial", active: true },
  ]);
  assert.deepEqual(people, [{ id: commercialId, name: "Léa Martin" }]);
});

test("le total affiché reprend les centimes calculés, pas un total envoyé par le client", () => {
  const rows = [{
    id: "f1",
    installation_id: "42",
    commercial_id: commercialId,
    sale_ttc_cents: 150050,
    pose_cents: 40000,
  }];
  const finances = assembleInstallationFinances(rows, [
    { id: "l1", finance_id: "f1", position: 2, label: "Liaisons", amount_cents: 1975 },
    { id: "l2", finance_id: "f1", position: 1, label: "Groupe", amount_cents: 80025 },
  ], [{ id: commercialId, full_name: "Léa Martin" }]);
  assert.equal(finances[0].purchaseTotalCents, 82000);
  assert.equal(finances[0].commercialName, "Léa Martin");
  assert.deepEqual(finances[0].purchases.map(line => line.label), ["Groupe", "Liaisons"]);
});

test("les routes refusent la lecture et l’écriture avant tout accès aux montants", () => {
  const list = source("../app/api/installation-finances/route.js");
  const item = source("../app/api/installations/[id]/finance/route.js");
  const page = source("../app/page.js");
  const fields = source("../app/components/installation-finance-fields.js");
  const records = source("../app/lib/record-tables.js");
  const sync = source("../app/lib/use-record-table.js");
  const sql = source("../supabase/migrations/20261012_installation_finance.sql");
  assert.ok(list.indexOf("canReadInstallationFinance") < list.indexOf("readInstallationFinances"));
  assert.ok(item.indexOf("canReadInstallationFinance") < item.indexOf("readInstallationFinance"));
  assert.ok(item.indexOf("canWriteInstallationFinance") < item.indexOf("validateInstallationFinance"));
  assert.match(item, /Ces montants sont confidentiels/);
  assert.match(item, /Vous ne pouvez pas renseigner les montants/);
  assert.match(item, /financeWriteResponse\(false\)/);
  assert.match(item, /installationFinanceAudit/);
  assert.equal(/saleTtcCents|poseCents|amountCents/.test(item.slice(item.indexOf("logActivity"), item.indexOf("logActivity") + 400)), false);
  assert.match(fields, /\+ Ajouter un achat/);
  assert.match(fields, /INSTALLATION_OTHER_COMMERCIAL_LABEL/);
  assert.equal(/name=/.test(fields), false);
  assert.match(page, /stripInstallationFinance/);
  assert.match(page, /Saisir les montants/);
  assert.match(page, /canReadFinance&&<InstallationFinanceSummary/);
  assert.match(page, /if\(mode==="agenda"\|\|!canReadFinance\) return/);
  assert.match(page, /if\(!canReadFinance\) return/);
  assert.match(records, /withoutInstallationFinance/);
  assert.match(sync, /publicInstallations/);
  assert.match(sql, /sale_ttc_cents bigint not null/);
  assert.match(sql, /amount_cents bigint not null/);
  assert.match(sql, /revoke all on table public.installation_finances from public, anon, authenticated/);
  assert.match(sql, /delete from public.installation_purchases where finance_id = v_finance/);
  assert.match(sql, /raise exception 'Ligne d’achat invalide'/);
  assert.match(sql, /p_commercial_id is not null and not exists/);
  assert.match(sql, /security invoker/);
  const autres = source("../supabase/migrations/20261027_installation_finance_autres.sql");
  assert.match(autres, /alter column commercial_id drop not null/);
  assert.match(autres, /p_commercial_id is not null and not exists/);
});
