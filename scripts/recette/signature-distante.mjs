import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { register } from "node:module";

const PRODUCTION = "rzkwmwtjnwnmmcexwoov";
const RECETTE = "xqbjfytrssslnsxxdrou";
const CLUSTER = "7703759698107299042";
const SQL_FILE = "/tmp/mkl-recette-signature.sql";
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
    .replace(/[A-Za-z0-9_\-]{20,}/g, "[masqué]")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[masqué]")
    .slice(0, 300);
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
  if (result.status !== 0) {
    throw new Error(redact(`${result.stderr || ""}\n${result.stdout || ""}`));
  }
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
process.env.NEXT_PUBLIC_SUPABASE_URL = url;
process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
delete process.env.VERCEL_ENV;
delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const identity = sql(`
select system_identifier from pg_control_system();
select inet_server_addr();
select case when to_regclass('public.crm_files') is null then 0 else 1 end;
select count(*) from public.clients where coalesce(nom, '') <> 'Client fictif signature';
select count(*) from public.devis where numero_devis not like 'DEV-FICTIF-%';
select count(*) from public.profiles where coalesce(email, '') not like '%@exemple.test';
select (select count(*) from public.organizations where id = ${quote(organizationId)})::text;
`);
const [cluster, address, crmFiles, foreignClients, foreignDevis, foreignProfiles, organization] = identity.split(/\n/).map(item => item.trim()).filter(Boolean);
if (cluster !== CLUSTER || address.includes(PRODUCTION) || organization !== "1") {
  console.error("Identité de recette non démontrée. Arrêt.");
  process.exit(2);
}
if (crmFiles !== "0" || foreignClients !== "0" || foreignDevis !== "0" || foreignProfiles !== "0") {
  console.error("La recette contient des données qui ne sont pas le jeu fictif. Arrêt.");
  process.exit(2);
}
note("identité", true, `cluster recette, adresse vérifiée, crm_files ${crmFiles}`);

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

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
    const error = new Error(redact(payload?.msg || payload?.message || payload?.error_description || payload?.error || text));
    error.status = response.status;
    throw error;
  }
  return payload;
}

const created = { users: [] };

async function removeFictional() {
  const rows = sql(`
    select coalesce(string_agg(storage_path, ','), '')
    from public.devis_signatures s
    join public.devis d on d.id = s.devis_id
    where d.numero_devis like 'DEV-FICTIF-%';
  `);
  for (const storagePath of rows.split(",").filter(Boolean)) {
    const name = storagePath.replace(/^devis-signatures\//, "");
    await fetch(`${url}/storage/v1/object/devis-signatures/${name}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    }).catch(() => {});
  }
  sql(`
    delete from public.devis_signature_journal j
    using public.devis d
    where j.devis_id = d.id and d.numero_devis like 'DEV-FICTIF-%';
    delete from public.devis_signatures s
    using public.devis d
    where s.devis_id = d.id and d.numero_devis like 'DEV-FICTIF-%';
    delete from public.commercial_appointments where prospect_name = 'Client fictif signature';
    delete from public.devis where numero_devis like 'DEV-FICTIF-%';
    delete from public.commercial_opportunities where name like 'Opportunité fictive signature%';
    delete from public.clients where nom = 'Client fictif signature';
    delete from public.profiles where email like '%@exemple.test';
  `);
  const listed = await api("/auth/v1/admin/users?per_page=200");
  for (const user of listed.users || []) {
    if (String(user.email || "").endsWith("@exemple.test")) {
      await api(`/auth/v1/admin/users/${user.id}`, { method: "DELETE", prefer: "" }).catch(() => {});
    }
  }
}

function pdf(text) {
  return Buffer.from(`%PDF-1.4\n${text}\n%%EOF`).toString("base64");
}

async function call(route, method, id, token, body, query = "") {
  const request = new Request(`http://recette.local/api/devis/${id}/signature${query}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const response = await route[method](request, { params: Promise.resolve({ id }) });
  const type = response.headers.get("content-type") || "";
  if (type.includes("pdf")) {
    const bytes = Buffer.from(await response.arrayBuffer());
    return { status: response.status, pdf: bytes.subarray(0, 5).toString() === "%PDF-" };
  }
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

try {
  await removeFictional();
  const people = [
    ["camille.fictive@exemple.test", "Camille Fictive", "Commercial"],
    ["rita.fictive@exemple.test", "Rita Fictive", "Responsable commercial"],
    ["direction.fictive@exemple.test", "Direction Fictive", "Direction"],
  ];
  const actors = {};
  for (const [email, name, role] of people) {
    const password = randomBytes(18).toString("hex");
    const user = await api("/auth/v1/admin/users", {
      method: "POST",
      body: { email, password, email_confirm: true, user_metadata: { full_name: name } },
    });
    created.users.push(user.id);
    sql(`
      insert into public.profiles (id, organization_id, full_name, email, role, active, onboarding_completed_at)
      values (${quote(user.id)}, ${quote(organizationId)}, ${quote(name)}, ${quote(email)}, ${quote(role)}, true, now());
    `);
    const session = await api("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email, password },
    });
    actors[role] = { id: user.id, token: session.access_token, email };
  }

  const commercialId = actors.Commercial.id;
  const clientId = sql(`
    insert into public.clients (organization_id, nom, prenom, statut, commercial_id)
    values (${quote(organizationId)}, 'Client fictif signature', 'Nora', 'Devis en cours', ${quote(commercialId)})
    returning id;
  `).split("\n").pop();
  const opportunityId = sql(`
    insert into public.commercial_opportunities (organization_id, name, stage, commercial_id)
    values (${quote(organizationId)}, 'Opportunité fictive signature', 'Rendez-vous planifié', ${quote(commercialId)})
    returning id;
  `).split("\n").pop();
  sql(`
    insert into public.commercial_appointments (organization_id, opportunity_id, prospect_name, starts_at, status, commercial_id)
    values (${quote(organizationId)}, ${quote(opportunityId)}, 'Client fictif signature', now() - interval '2 days', 'Non statué', ${quote(commercialId)});
  `);

  async function devis(numero, amount, extra) {
    return sql(`
      insert into public.devis (organization_id, numero_devis, client_id, client_name, commercial_id, statut, total_ttc, extra)
      values (${quote(organizationId)}, ${quote(numero)}, ${quote(clientId)}, 'Nora Client fictif', ${quote(commercialId)}, 'Envoyé', ${amount}, ${quote(JSON.stringify(extra))}::jsonb)
      returning id;
    `).split("\n").pop();
  }

  const devisA = await devis("DEV-FICTIF-A", 12000, { sourceProspectId: opportunityId });
  const devisB = await devis("DEV-FICTIF-B", 15000, { sourceProspectId: opportunityId });
  const devisC = await devis("DEV-FICTIF-C", 4000, { sourceProspectId: opportunityId });
  const devisD = await devis("DEV-FICTIF-D", 1000, {});

  register(new URL("./resolve-js.mjs", import.meta.url).href, import.meta.url);
  const route = await import("../../app/api/devis/[id]/signature/route.js");
  const date = "2026-11-13";

  const deposited = await call(route, "POST", devisA, actors.Commercial.token, {
    action: "demande",
    declaredSignatureDate: date,
    pdfBase64: pdf("preuve-a"),
    kind: "devis_signe",
    amountTtc: 1,
  });
  note("montant falsifié refusé", deposited.status === 400, deposited.payload?.error || "");

  const demand = await call(route, "POST", devisA, actors.Commercial.token, {
    action: "demande",
    declaredSignatureDate: date,
    pdfBase64: pdf("preuve-a"),
    kind: "devis_signe",
  });
  note("dépôt commercial", demand.status === 200 && demand.payload?.sale?.status === "demande", demand.payload?.error || demand.payload?.sale?.status || "");

  const duplicate = await call(route, "POST", devisA, actors.Commercial.token, {
    action: "demande",
    declaredSignatureDate: date,
    pdfBase64: pdf("autre-preuve"),
    kind: "devis_signe",
  });
  note("doublon refusé", duplicate.status === 400, duplicate.payload?.error || "");

  const electronic = await call(route, "POST", devisB, actors.Commercial.token, {
    action: "demande",
    declaredSignatureDate: date,
    kind: "electronique",
    pdfBase64: pdf("electronique"),
  });
  note("signature électronique refusée", electronic.status === 400, electronic.payload?.error || "");

  const directionConfirm = await call(route, "POST", devisA, actors.Direction.token, { action: "confirmer" });
  note("direction confirmation refusée", directionConfirm.status === 403, directionConfirm.payload?.error || "");

  const directionFile = await call(route, "GET", devisA, actors.Direction.token, undefined, "?fichier=1");
  note("direction justificatif refusé", directionFile.status === 403, directionFile.payload?.error || "");

  const commercialFile = await call(route, "GET", devisA, actors.Commercial.token, undefined, "?fichier=1");
  note("commercial lit son justificatif", commercialFile.status === 200 && commercialFile.pdf === true, String(commercialFile.status));

  const confirmed = await call(route, "POST", devisA, actors["Responsable commercial"].token, { action: "confirmer" });
  const after = sql(`
    select (select statut from public.devis where id = ${quote(devisA)});
    select (select stage from public.commercial_opportunities where id = ${quote(opportunityId)});
    select (select statut from public.clients where id = ${quote(clientId)});
    select (select status from public.commercial_appointments where prospect_name = 'Client fictif signature' limit 1);
    select (select link_state from public.devis_signatures where devis_id = ${quote(devisA)});
  `).split(/\n/).map(item => item.trim()).filter(Boolean);
  note("confirmation responsable", confirmed.status === 200 && after[0] === "Accepté" && after[1] === "Gagné" && after[2] === "Devis en cours" && after[3] === "Non statué" && after[4] === "reliée", after.join(" | "));

  const again = await call(route, "POST", devisA, actors["Responsable commercial"].token, { action: "confirmer" });
  note("deuxième confirmation refusée", again.status === 400, again.payload?.error || "");

  const shortReason = await call(route, "POST", devisA, actors["Responsable commercial"].token, { action: "annuler", reason: "ok" });
  note("motif trop court refusé", shortReason.status === 400, shortReason.payload?.error || "");

  await call(route, "POST", devisB, actors.Commercial.token, {
    action: "demande", declaredSignatureDate: date, pdfBase64: pdf("preuve-b"), kind: "devis_signe",
  });
  const replaced = await call(route, "POST", devisB, actors["Responsable commercial"].token, {
    action: "remplacer",
    replacesDevisId: devisA,
  });
  const replacement = sql(`
    select (select status from public.devis_signatures where devis_id = ${quote(devisA)});
    select (select statut from public.devis where id = ${quote(devisA)});
    select (select status from public.devis_signatures where devis_id = ${quote(devisB)});
    select (select statut from public.devis where id = ${quote(devisB)});
  `).split(/\n/).map(item => item.trim()).filter(Boolean);
  note("avenant sans double compte", replaced.status === 200 && replacement[0] === "remplacee" && replacement[1] === "Accepté" && replacement[2] === "confirmee" && replacement[3] === "Accepté", replacement.join(" | "));

  const revived = await call(route, "POST", devisA, actors["Responsable commercial"].token, { action: "confirmer" });
  note("devis remplacé non reconfirmable", revived.status === 400, revived.payload?.error || "");

  await call(route, "POST", devisC, actors.Commercial.token, {
    action: "demande", declaredSignatureDate: date, pdfBase64: pdf("preuve-c"), kind: "devis_signe",
  });
  await call(route, "POST", devisC, actors["Responsable commercial"].token, { action: "confirmer" });
  const cancelled = await call(route, "POST", devisC, actors["Responsable commercial"].token, {
    action: "annuler",
    reason: "Client fictif se rétracte",
  });
  const cancelState = sql(`
    select (select status from public.devis_signatures where devis_id = ${quote(devisC)});
    select (select statut from public.devis where id = ${quote(devisC)});
  `).split(/\n/).map(item => item.trim()).filter(Boolean);
  note("annulation avec motif", cancelled.status === 200 && cancelState[0] === "annulee" && cancelState[1] === "Accepté", cancelState.join(" | "));

  await call(route, "POST", devisD, actors.Commercial.token, {
    action: "demande", declaredSignatureDate: date, pdfBase64: pdf("preuve-d"), kind: "devis_signe",
  });
  const loose = await call(route, "POST", devisD, actors["Responsable commercial"].token, { action: "confirmer" });
  const looseState = sql(`select link_state from public.devis_signatures where devis_id = ${quote(devisD)};`).trim();
  note("sans opportunité, vente à rattacher", loose.status === 200 && looseState === "À rattacher", looseState);

  const totals = sql(`select brut::text || ',' || net::text from public.commercial_sale_totals(${quote(organizationId)});`).trim();
  const historical = sql(`select coalesce(sum(total_ttc), 0)::text from public.devis where numero_devis like 'DEV-FICTIF-%' and statut = 'Accepté';`).trim();
  note("trois indicateurs séparés", totals === "20000.00,16000.00" && historical === "32000.00", `historique ${historical}, vérifié ${totals}`);

  const bucket = sql(`
    select public::text || ',' || file_size_limit::text from storage.buckets where id = 'devis-signatures';
    select count(*) from pg_policies where policyname = 'devis_signatures_storage_select';
    select has_function_privilege('authenticated', 'public.commit_devis_signature(uuid,text,uuid,text,date,text,text,text,text,uuid)', 'execute')::text;
    select has_function_privilege('service_role', 'public.commit_devis_signature(uuid,text,uuid,text,date,text,text,text,text,uuid)', 'execute')::text;
  `).split(/\n/).map(item => item.trim()).filter(Boolean);
  note("bucket privé et droit d’exécution", bucket[0] === "false,4000000" && bucket[1] === "1" && bucket[2] === "false" && bucket[3] === "true", bucket.join(" | "));

  try {
    const asRole = (id, label) => `
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub', ${quote(id)}, true);
      select set_config('request.jwt.claims', ${quote(JSON.stringify({ sub: id }))}, true);
      select '${label}=' || count(*)::text from public.devis_signatures;
      rollback;
    `;
    const visible = sql(asRole(commercialId, "commercial") + asRole(actors.Direction.id, "direction"));
    const compact = visible.split(/\n/).map(line => line.trim()).filter(line => /^(commercial|direction)=/.test(line)).join(" ");
    note("RLS commercial et direction", compact.includes("commercial=4") && compact.includes("direction=0"), compact);
  } catch (error) {
    note("RLS commercial et direction", false, redact(error.message));
  }

} catch (error) {
  note("parcours interrompu", false, redact(error?.stack || error?.message || error));
  process.exitCode = 1;
} finally {
  try {
    await removeFictional();
    const left = sql(`
      select (select count(*) from public.devis where numero_devis like 'DEV-FICTIF-%')
        + (select count(*) from public.clients where nom = 'Client fictif signature')
        + (select count(*) from public.profiles where email like '%@exemple.test');
    `).trim();
    note("nettoyage", left === "0", `lignes fictives restantes ${left}`);
  } catch (error) {
    note("nettoyage", false, redact(error?.message || error));
    process.exitCode = 1;
  }
  try { unlinkSync(SQL_FILE); } catch { /* déjà retiré */ }
  const failed = checks.filter(item => !item.ok).length;
  console.log(`RESULTAT ${checks.length - failed}/${checks.length}`);
  if (failed) process.exitCode = 1;
}
