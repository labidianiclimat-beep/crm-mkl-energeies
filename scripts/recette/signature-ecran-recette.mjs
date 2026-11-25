import { spawnSync } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
import { chmodSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

const PRODUCTION = "rzkwmwtjnwnmmcexwoov";
const RECETTE = "xqbjfytrssslnsxxdrou";
const CLUSTER = "7703759698107299042";
const SQL_FILE = "/tmp/mkl-recette-signature.sql";

function coffre(name) {
  const text = readFileSync(`${process.env.HOME}/.mkl-secrets/recette-api.env`, "utf8");
  const line = text.split(/\n/).find(item => item.startsWith(`${name}=`));
  if (!line) throw new Error(`coffre incomplet: ${name}`);
  return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function redact(value) {
  return String(value || "").replace(/[A-Za-z0-9_\-]{20,}/g, "[masqué]").slice(0, 300);
}

function sql(query) {
  writeFileSync(SQL_FILE, query);
  const result = spawnSync("bash", ["-lc", `
    set -euo pipefail
    cd ${JSON.stringify(process.cwd())}
    . ./scripts/recette/cible.sh
    garde_cible >/dev/null
    PGPASSWORD="$MKL_RECETTE_MDP" "$PSQL" "$URL" -v ON_ERROR_STOP=1 -q -tA -f ${SQL_FILE}
  `], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(redact(`${result.stderr || ""}\n${result.stdout || ""}`));
  return result.stdout.trim();
}

const url = coffre("MKL_RECETTE_URL");
const serviceKey = coffre("MKL_RECETTE_SERVICE_KEY");
const organizationId = coffre("MKL_RECETTE_ORGANIZATION_ID");
if (new URL(url).host !== `${RECETTE}.supabase.co` || url.includes(PRODUCTION)) {
  console.error("Identité refusée.");
  process.exit(2);
}
const identity = sql(`
select system_identifier from pg_control_system();
select case when to_regclass('public.crm_files') is null then 0 else 1 end;
select count(*) from public.clients where coalesce(nom, '') <> 'Client fictif signature';
select count(*) from public.devis where numero_devis not like 'DEV-FICTIF-%';
`);
const [cluster, crmFiles, foreignClients, foreignDevis] = identity.split(/\n/).map(item => item.trim()).filter(Boolean);
if (cluster !== CLUSTER || crmFiles !== "0" || foreignClients !== "0" || foreignDevis !== "0") {
  console.error("Identité ou données de recette non conformes. Arrêt.");
  process.exit(2);
}

async function api(path, options = {}) {
  const response = await fetch(`${url}${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(redact(payload?.msg || payload?.message || text));
  return payload;
}

const pepper = randomBytes(24).toString("hex");
const pin = String(randomInt(100000, 999999));
process.env.ACTIVATION_PIN_PEPPER = pepper;
const { hashActivationPin } = await import("../../app/lib/activation-pin.js");

const listed = await api("/auth/v1/admin/users?per_page=200");
for (const user of listed.users || []) {
  if (String(user.email || "").endsWith("@exemple.test")) {
    await api(`/auth/v1/admin/users/${user.id}`, { method: "DELETE" }).catch(() => {});
  }
}
sql(`
  delete from public.devis_signature_journal j using public.devis d where j.devis_id = d.id and d.numero_devis like 'DEV-FICTIF-%';
  delete from public.devis_signatures s using public.devis d where s.devis_id = d.id and d.numero_devis like 'DEV-FICTIF-%';
  delete from public.commercial_appointments where prospect_name = 'Client fictif signature';
  delete from public.devis where numero_devis like 'DEV-FICTIF-%';
  delete from public.commercial_opportunities where name like 'Opportunité fictive signature%';
  delete from public.clients where nom = 'Client fictif signature';
  delete from public.profiles where email like '%@exemple.test';
`);

const people = [
  ["camille.fictive@exemple.test", "Camille Fictive", "Commercial"],
  ["rita.fictive@exemple.test", "Rita Fictive", "Responsable commercial"],
  ["direction.fictive@exemple.test", "Direction Fictive", "Direction"],
];
const ids = {};
for (const [email, name, role] of people) {
  const user = await api("/auth/v1/admin/users", {
    method: "POST",
    body: { email, password: randomBytes(18).toString("hex"), email_confirm: true },
  });
  ids[role] = user.id;
  const hashed = hashActivationPin(pin);
  sql(`
    insert into public.profiles (id, organization_id, full_name, email, role, modules, manager, active, onboarding_completed_at)
    values (
      ${quote(user.id)}, ${quote(organizationId)}, ${quote(name)}, ${quote(email)}, ${quote(role)},
      array['Tableau de bord','Devis','Clients','Agenda commercial']::text[],
      'Rita Fictive', true, now()
    );
    insert into public.activation_pins (user_id, pin_hash, pin_salt, expires_at)
    values (${quote(user.id)}, ${quote(hashed.pin_hash)}, ${quote(hashed.pin_salt)}, now() + interval '30 days');
  `);
}

const clientId = sql(`
  insert into public.clients (organization_id, nom, prenom, statut, commercial_id)
  values (${quote(organizationId)}, 'Client fictif signature', 'Nora', 'Devis en cours', ${quote(ids.Commercial)})
  returning id;
`).split("\n").pop();
const opportunityId = sql(`
  insert into public.commercial_opportunities (organization_id, name, stage, commercial_id)
  values (${quote(organizationId)}, 'Opportunité fictive signature', 'Rendez-vous planifié', ${quote(ids.Commercial)})
  returning id;
`).split("\n").pop();
sql(`
  insert into public.commercial_appointments (organization_id, opportunity_id, prospect_name, starts_at, status, commercial_id)
  values (${quote(organizationId)}, ${quote(opportunityId)}, 'Client fictif signature', now() - interval '2 days', 'Non statué', ${quote(ids.Commercial)});
  insert into public.devis (organization_id, numero_devis, client_id, client_name, commercial_id, statut, total_ttc, extra)
  values (${quote(organizationId)}, 'DEV-FICTIF-ECRAN', ${quote(clientId)}, 'Nora Client fictif', ${quote(ids.Commercial)}, 'Envoyé', 12000, ${quote(JSON.stringify({ sourceProspectId: opportunityId }))}::jsonb);
  insert into public.devis (organization_id, numero_devis, client_id, client_name, commercial_id, statut, total_ttc)
  values (${quote(organizationId)}, 'DEV-FICTIF-HIST', ${quote(clientId)}, 'Nora Client fictif', ${quote(ids.Commercial)}, 'Accepté', 5000);
`);

const envFile = [
  `NEXT_PUBLIC_SUPABASE_URL=${url}`,
  `SUPABASE_SERVICE_ROLE_KEY=${serviceKey}`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=`,
  `ACTIVATION_PIN_PEPPER=${pepper}`,
  "VERCEL_ENV=",
].join("\n");
writeFileSync("/tmp/mkl-recette-ui.env", `${envFile}\n`, { mode: 0o600 });
chmodSync("/tmp/mkl-recette-ui.env", 0o600);
writeFileSync("/tmp/mkl-recette-ui.json", JSON.stringify({
  commercial: "camille.fictive@exemple.test",
  responsable: "rita.fictive@exemple.test",
  direction: "direction.fictive@exemple.test",
  pin,
  devis: "DEV-FICTIF-ECRAN",
}), { mode: 0o600 });
chmodSync("/tmp/mkl-recette-ui.json", 0o600);
try { unlinkSync(SQL_FILE); } catch { /* rien */ }
console.log("pret");
console.log("devis DEV-FICTIF-ECRAN et DEV-FICTIF-HIST");
