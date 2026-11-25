import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import {
  computeCommercialDashboard,
  computeCommercialRanking,
  filterVerifiedSales,
} from "../../app/lib/dashboard-commercial.js";

const PRODUCTION = "rzkwmwtjnwnmmcexwoov";
const RECETTE = "xqbjfytrssslnsxxdrou";
const CLUSTER = "7703759698107299042";
const SQL_FILE = "/tmp/mkl-recette-filtres-dashboard.sql";
const checks = [];

function note(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "OK" : "ECHEC"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function coffre(name) {
  const text = readFileSync(`${process.env.HOME}/.mkl-secrets/recette-api.env`, "utf8");
  const line = text.split(/\n/).find(item => item.startsWith(`${name}=`));
  if (!line) throw new Error(`coffre incomplet: ${name}`);
  return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
}

function redact(value) {
  return String(value || "")
    .replace(/[A-Za-z0-9_-]{20,}/g, "[masqué]")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[masqué]")
    .slice(0, 300);
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sql(query) {
  writeFileSync(SQL_FILE, query);
  const result = spawnSync("bash", ["-lc", `
    set -euo pipefail
    cd ${JSON.stringify(process.cwd())}
    . ./scripts/recette/cible.sh
    garde_cible
    PGPASSWORD="$MKL_RECETTE_MDP" "$PSQL" "$URL" -v ON_ERROR_STOP=1 -q -tA -f ${SQL_FILE}
  `], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(redact(`${result.stderr || ""}\n${result.stdout || ""}`));
  return result.stdout.trim();
}

const url = coffre("MKL_RECETTE_URL");
const serviceKey = coffre("MKL_RECETTE_SERVICE_KEY");
const organizationId = coffre("MKL_RECETTE_ORGANIZATION_ID");
const host = new URL(url).host;
if (host !== `${RECETTE}.supabase.co` || url.includes(PRODUCTION) || serviceKey.includes(PRODUCTION)) {
  console.error("Identité refusée. Aucune écriture.");
  process.exit(2);
}

const identity = sql(`
select system_identifier from pg_control_system();
select inet_server_addr();
select case when to_regclass('public.crm_files') is null then 0 else 1 end;
select (select count(*) from public.organizations where id = ${quote(organizationId)})::text;
select has_table_privilege('authenticated', 'public.devis_signatures', 'INSERT')::text;
`);
const [cluster, address, crmFiles, organization, insertBefore] = identity.split(/\n/).map(item => item.trim()).filter(Boolean);
if (cluster !== CLUSTER || address.includes(PRODUCTION) || crmFiles !== "0" || organization !== "1") {
  console.error("Identité de recette non démontrée. Arrêt.");
  process.exit(2);
}
note("identité", true, "cluster recette");
note("insert authentifié toujours refusé", insertBefore === "false");

async function api(path, options = {}) {
  const response = await fetch(`${url}${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) {
    const error = new Error(redact(payload?.msg || payload?.message || payload?.error || text));
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function removeFictional() {
  sql(`
    delete from public.devis_signature_journal j
    using public.devis d
    where j.devis_id = d.id and d.numero_devis like 'DEV-FILTRE-%';
    delete from public.devis_signatures s
    using public.devis d
    where s.devis_id = d.id and d.numero_devis like 'DEV-FILTRE-%';
    delete from public.devis where numero_devis like 'DEV-FILTRE-%';
    delete from public.clients where nom = 'Client fictif filtre';
    delete from public.profiles where email like '%.filtre@exemple.test';
    delete from public.organizations where name = 'Organisation fictive filtre';
  `);
  const listed = await api("/auth/v1/admin/users?per_page=200");
  for (const user of listed.users || []) {
    if (String(user.email || "").endsWith(".filtre@exemple.test")) {
      await api(`/auth/v1/admin/users/${user.id}`, { method: "DELETE", prefer: "" }).catch(() => {});
    }
  }
}

function sale(status, amount, commercialId, confirmedAt, label, client) {
  return { status, amountTtc: amount, commercialId, confirmedAt, label, client };
}

try {
  await removeFictional();
  const people = [
    ["camille.filtre@exemple.test", "Camille Filtre", "Commercial"],
    ["karim.filtre@exemple.test", "Karim Filtre", "Commercial"],
  ];
  const actors = {};
  for (const [email, name, role] of people) {
    const password = randomBytes(18).toString("hex");
    const user = await api("/auth/v1/admin/users", {
      method: "POST",
      body: { email, password, email_confirm: true, user_metadata: { full_name: name } },
    });
    sql(`
      insert into public.profiles (id, organization_id, full_name, email, role, active, onboarding_completed_at)
      values (${quote(user.id)}, ${quote(organizationId)}, ${quote(name)}, ${quote(email)}, ${quote(role)}, true, now());
    `);
    actors[name] = user.id;
  }
  const camille = actors["Camille Filtre"];
  const karim = actors["Karim Filtre"];
  const otherOrg = sql(`
    insert into public.organizations (id, name) values (gen_random_uuid(), 'Organisation fictive filtre') returning id;
  `).split("\n").pop();

  const clientId = sql(`
    insert into public.clients (organization_id, nom, prenom, statut, commercial_id)
    values (${quote(organizationId)}, 'Client fictif filtre', 'Nora', 'Devis en cours', ${quote(camille)})
    returning id;
  `).split("\n").pop();

  function insertDevis({ number, owner, label, client, total, created, status = "Brouillon" }) {
    return sql(`
      insert into public.devis (
        organization_id, numero_devis, client_id, client_name, commercial_id, statut,
        date_creation, total_ttc, label
      ) values (
        ${quote(organizationId)}, ${quote(number)}, ${quote(clientId)}, ${quote(client)},
        ${owner ? quote(owner) : "null"}, ${quote(status)}, ${quote(created)}, ${total}, ${quote(label)}
      ) returning id;
    `).split("\n").pop();
  }

  function insertSale(devisId, { status, amount, owner, confirmedAt, cancelledAt = null }) {
    sql(`
      insert into public.devis_signatures (
        organization_id, devis_id, commercial_id, proof_kind, status,
        declared_signature_on, confirmed_at, cancelled_at, amount_ttc,
        proof_digest, idempotency_key, link_state
      ) values (
        ${quote(organizationId)}, ${quote(devisId)}, ${owner ? quote(owner) : "null"},
        'devis_signe', ${quote(status)}, '2026-10-01', ${confirmedAt ? quote(confirmedAt) : "null"},
        ${cancelledAt ? quote(cancelledAt) : "null"}, ${amount},
        ${quote(`filtre-${devisId}`)}, ${quote(`filtre-${devisId}`)}, 'reliée'
      );
    `);
  }

  const rows = [
    ["DEV-FILTRE-OCT-PAC", camille, "Pompe à chaleur", "Nora Filtre", 12000, "2026-09-01", "Accepté", "confirmee", "2026-10-15T10:00:00Z", null],
    ["DEV-FILTRE-NOV-PV", karim, "Photovoltaïque", "Luc Filtre", 8000, "2026-11-01", "Brouillon", "confirmee", "2026-11-10T10:00:00Z", null],
    ["DEV-FILTRE-OCT-ANNULE", camille, "Pompe à chaleur", "Nora Filtre", 4000, "2026-10-02", "Brouillon", "annulee", "2026-10-20T10:00:00Z", "2026-11-02T10:00:00Z"],
    ["DEV-FILTRE-SEPT-REMPLACE", camille, "Pompe à chaleur", "Nora Filtre", 9000, "2026-09-12", "Brouillon", "remplacee", "2026-09-12T10:00:00Z", null],
    ["DEV-FILTRE-OCT-AVENANT", camille, "Pompe à chaleur", "Nora Filtre", 9500, "2026-10-22", "Brouillon", "confirmee", "2026-10-22T10:00:00Z", null],
    ["DEV-FILTRE-OCT-LIBRE", null, "Photovoltaïque", "Inès Filtre", 1500, "2026-10-08", "Brouillon", "confirmee", "2026-10-08T10:00:00Z", null],
    ["DEV-FILTRE-OCT-RADIATEUR", karim, "Radiateur électrique", "Paul Filtre", 2000, "2026-10-09", "Brouillon", "confirmee", "2026-10-09T10:00:00Z", null],
    ["DEV-FILTRE-BORNE-IN", camille, "Pompe à chaleur", "Nora Filtre", 100, "2026-10-31", "Brouillon", "confirmee", "2026-10-31T22:30:00Z", null],
    ["DEV-FILTRE-BORNE-OUT", camille, "Pompe à chaleur", "Nora Filtre", 100, "2026-10-31", "Brouillon", "confirmee", "2026-10-31T23:30:00Z", null],
    ["DEV-FILTRE-SANS-DATE", camille, "Pompe à chaleur", "Nora Filtre", 700, "2026-10-11", "Brouillon", "confirmee", null, null],
  ];
  for (const [number, owner, label, client, total, created, status, saleStatus, confirmedAt, cancelledAt] of rows) {
    const devisId = insertDevis({ number, owner, label, client, total, created, status });
    insertSale(devisId, { status: saleStatus, amount: total, owner, confirmedAt, cancelledAt });
  }
  const otherDevis = sql(`
    insert into public.devis (organization_id, numero_devis, client_name, statut, date_creation, total_ttc, label)
    values (${quote(otherOrg)}, 'DEV-FILTRE-AUTRE-ORG', 'Autre organisation', 'Accepté', '2026-10-15', 50000, 'Pompe à chaleur')
    returning id;
  `).split("\n").pop();
  sql(`
    insert into public.devis_signatures (
      organization_id, devis_id, proof_kind, status, confirmed_at, amount_ttc,
      proof_digest, idempotency_key, link_state
    ) values (
      ${quote(otherOrg)}, ${quote(otherDevis)}, 'devis_signe', 'confirmee', '2026-10-15T10:00:00Z', 50000,
      'filtre-autre-org', 'filtre-autre-org', 'reliée'
    );
  `);

  const loaded = sql(`
    select s.status, s.amount_ttc, coalesce(s.commercial_id::text, ''), coalesce(s.confirmed_at::text, ''),
           coalesce(d.label, ''), coalesce(d.client_name, ''), s.organization_id::text
    from public.devis_signatures s
    join public.devis d on d.id = s.devis_id
    where d.numero_devis like 'DEV-FILTRE-%'
    order by d.numero_devis;
  `).split(/\n/).filter(Boolean).map(line => {
    const [status, amount, commercialId, confirmedAt, label, client, org] = line.split("|");
    return { status, amountTtc: Number(amount), commercialId, confirmedAt, label, client, org };
  });
  const orgSales = loaded
    .filter(row => row.org.toLowerCase() === organizationId.toLowerCase())
    .map(row => sale(row.status, row.amountTtc, row.commercialId, row.confirmedAt, row.label, row.client));
  note("autre organisation écartée du chargement", loaded.some(row => row.org === otherOrg) && orgSales.every(row => row.amountTtc !== 50000));

  const october = filterVerifiedSales(orgSales, { from: "2026-10-01", to: "2026-10-31" });
  const metrics = computeCommercialDashboard({ sales: october });
  const ranking = computeCommercialRanking({
    commercials: [
      { id: camille, name: "Camille Filtre", role: "Commercial" },
      { id: karim, name: "Karim Filtre", role: "Commercial" },
    ],
    sales: october,
  });
  const rankedNet = ranking.reduce((sum, row) => sum + row.caSigneNetVerifie, 0);
  note("octobre net 25100", metrics.caSigneNetVerifie === 25100, String(metrics.caSigneNetVerifie));
  note("octobre brut 29100", metrics.caSigneBrutVerifie === 29100, String(metrics.caSigneBrutVerifie));
  note("cartes et classement identiques", rankedNet === metrics.caSigneNetVerifie);
  note("novembre ne reprend pas l annulation d octobre", computeCommercialDashboard({
    sales: filterVerifiedSales(orgSales, { from: "2026-11-01", to: "2026-11-30" }),
  }).caSigneNetVerifie === 8100);
  note("pompe à chaleur octobre", computeCommercialDashboard({
    sales: filterVerifiedSales(orgSales, { from: "2026-10-01", to: "2026-10-31", activity: "Pompe à chaleur" }),
  }).caSigneNetVerifie === 21600);
  note("photovoltaïque octobre", computeCommercialDashboard({
    sales: filterVerifiedSales(orgSales, { from: "2026-10-01", to: "2026-10-31", activity: "Photovoltaïque" }),
  }).caSigneNetVerifie === 1500);
  note("radiateur non classé dans les trois filtres", ["Pompe à chaleur", "Photovoltaïque", "Climatisation"].every(activity =>
    !filterVerifiedSales(orgSales, { from: "2026-10-01", to: "2026-10-31", activity }).some(row => row.label === "Radiateur électrique")
  ));
  note("décembre vide", filterVerifiedSales(orgSales, { from: "2026-12-01", to: "2026-12-31" }).length === 0);
  note("sans date hors période", !october.some(row => row.amountTtc === 700));
  note("non affecté", ranking.find(row => row.name === "Non affecté")?.caSigneNetVerifie === 1500);
  note("client et rendez-vous inchangés", sql(`
    select (select statut from public.clients where id = ${quote(clientId)})
      || '|' || (select count(*) from public.commercial_appointments where prospect_name = 'Client fictif filtre')
      || '|' || (select statut from public.devis where numero_devis = 'DEV-FILTRE-OCT-PAC');
  `) === "Devis en cours|0|Accepté");
} catch (error) {
  note("scénario recette", false, redact(error?.message || error));
} finally {
  await removeFictional().catch(error => {
    console.error(redact(error?.message || error));
  });
  try { unlinkSync(SQL_FILE); } catch { /* fichier déjà retiré */ }
}

const insertAfter = sql(`select has_table_privilege('authenticated', 'public.devis_signatures', 'INSERT')::text;`);
const leftovers = sql(`
  select (select count(*) from public.devis where numero_devis like 'DEV-FILTRE-%')
    + (select count(*) from public.clients where nom = 'Client fictif filtre')
    + (select count(*) from public.organizations where name = 'Organisation fictive filtre');
`);
note("privilège insert inchangé", insertAfter === "false" && insertAfter === insertBefore);
note("jeu fictif retiré", leftovers === "0", leftovers);
const failed = checks.filter(item => !item.ok);
if (failed.length) {
  console.error(`RESULTAT ${checks.length - failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`RESULTAT ${checks.length}/${checks.length}`);
