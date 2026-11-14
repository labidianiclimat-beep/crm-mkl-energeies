import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import { filterVerifiedSales } from "../../app/lib/dashboard-commercial.js";

const PRODUCTION = "rzkwmwtjnwnmmcexwoov";
const RECETTE = "xqbjfytrssslnsxxdrou";
const CLUSTER = "7703759698107299042";
const SQL_FILE = "/tmp/mkl-recette-signature-pilote.sql";
const MIGRATION = new URL("../../supabase/migrations/20261114_devis_signatures_lecture_serveur.sql", import.meta.url).pathname;
const ORG_B_NAME = "Organisation fictive pilote";
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

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function psql(query, { stop = true } = {}) {
  writeFileSync(SQL_FILE, query);
  const result = spawnSync("bash", ["-lc", `
    set -euo pipefail
    cd ${JSON.stringify(process.cwd())}
    . ./scripts/recette/cible.sh
    garde_cible
    PGPASSWORD="$MKL_RECETTE_MDP" "$PSQL" "$URL" -v ON_ERROR_STOP=${stop ? 1 : 0} -q -tA -f ${SQL_FILE}
  `], { encoding: "utf8" });
  return {
    ok: result.status === 0,
    text: redact(`${result.stdout || ""}\n${result.stderr || ""}`),
    stdout: String(result.stdout || ""),
  };
}

function sql(query) {
  const result = psql(query, { stop: true });
  if (!result.ok) throw new Error(result.text);
  return result.stdout.trim();
}

function applyMigration() {
  const result = spawnSync("bash", ["-lc", `
    set -euo pipefail
    cd ${JSON.stringify(process.cwd())}
    . ./scripts/recette/cible.sh
    garde_cible
    case "$URL" in *${PRODUCTION}*) echo "production refusée"; exit 2 ;; esac
    PGPASSWORD="$MKL_RECETTE_MDP" "$PSQL" "$URL" -v ON_ERROR_STOP=1 -q -f ${JSON.stringify(MIGRATION)}
  `], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(redact(`${result.stdout || ""}\n${result.stderr || ""}`));
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
process.env.MKL_SIGNATURE_MODULE = "off";
delete process.env.MKL_SIGNATURE_PILOT_COMMERCIAL_ID;
delete process.env.MKL_SIGNATURE_PILOT_MANAGER_ID;

const identity = sql(`
select system_identifier from pg_control_system();
select inet_server_addr();
select case when to_regclass('public.crm_files') is null then 0 else 1 end;
`);
const [cluster, address, crmFiles] = identity.split(/\n/).map(item => item.trim()).filter(Boolean);
if (cluster !== CLUSTER || String(address).includes(PRODUCTION) || crmFiles !== "0") {
  console.error("Identité de recette non démontrée. Arrêt.");
  process.exit(2);
}
note("identité recette", true, "cluster recette, crm_files absent");

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

function asUser(id, statement) {
  return `
    begin;
    set local role authenticated;
    select set_config('request.jwt.claim.sub', ${quote(id)}, true);
    select set_config('request.jwt.claims', ${quote(JSON.stringify({ sub: id, role: "authenticated" }))}, true);
    ${statement}
    rollback;
  `;
}

function pdf(text) {
  return Buffer.from(`%PDF-1.4\n${text}\n%%EOF`).toString("base64");
}

function leaked(payload, needles) {
  const text = JSON.stringify(payload || {});
  return needles.some(needle => text.includes(String(needle)));
}

async function removeFictional() {
  const rows = sql(`
    select coalesce(string_agg(storage_path, ','), '')
    from public.devis_signatures s
    join public.devis d on d.id = s.devis_id
    where d.numero_devis like 'DEV-PILOTE-%';
  `);
  for (const storagePath of rows.split(",").filter(Boolean)) {
    const name = storagePath.replace(/^devis-signatures\//, "");
    await fetch(`${url}/storage/v1/object/devis-signatures/${name.split("/").map(encodeURIComponent).join("/")}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    }).catch(() => {});
  }
  sql(`
    delete from public.devis_signature_journal j
    using public.devis d
    where j.devis_id = d.id and d.numero_devis like 'DEV-PILOTE-%';
    delete from public.devis_signatures s
    using public.devis d
    where s.devis_id = d.id and d.numero_devis like 'DEV-PILOTE-%';
    delete from public.commercial_appointments where prospect_name = 'Client fictif pilote';
    delete from public.devis where numero_devis like 'DEV-PILOTE-%';
    delete from public.commercial_opportunities where name = 'Opportunité fictive pilote';
    delete from public.clients where nom = 'Client fictif pilote';
    delete from public.profiles where lower(email) like '%.pilote@exemple.test';
    delete from public.organizations where name = ${quote(ORG_B_NAME)};
  `);
  sql(`
    do $$
    declare
      compte uuid;
    begin
      for compte in
        select id from auth.users where lower(email) like '%.pilote@exemple.test'
      loop
        delete from auth.sessions where user_id = compte;
        delete from auth.refresh_tokens where user_id = compte::text;
        delete from auth.identities where user_id = compte;
        delete from auth.users where id = compte;
      end loop;
    end $$;
  `);
}

async function call(route, method, id, token, body, headers = {}, query = "") {
  const request = new Request(`http://recette.local/api/devis/${id}/signature${query}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const response = await route[method](request, { params: Promise.resolve({ id }) });
  const payload = method === "GET" && response.headers.get("content-type")?.includes("pdf")
    ? { pdf: true, bytes: (await response.arrayBuffer()).byteLength }
    : await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

const orgB = randomUUID();

try {
  await removeFictional();
  applyMigration();
  const rights = sql(`
    select has_table_privilege('authenticated', 'public.devis_signatures', 'SELECT')::text;
    select has_table_privilege('authenticated', 'public.devis_signatures', 'INSERT')::text;
    select has_function_privilege('authenticated', 'public.commit_devis_signature(uuid,text,uuid,text,date,text,text,text,text,uuid)', 'EXECUTE')::text;
    select has_function_privilege('service_role', 'public.commit_devis_signature(uuid,text,uuid,text,date,text,text,text,text,uuid)', 'EXECUTE')::text;
    select public::text || ',' || file_size_limit::text
      from storage.buckets where id = 'devis-signatures';
    select count(*)::text from pg_policies where policyname = 'devis_signatures_storage_select';
  `).split(/\n/).map(item => item.trim()).filter(Boolean);
  note("lecture directe révoquée", rights[0] === "false" && rights[1] === "false" && rights[2] === "false" && rights[3] === "true", rights.slice(0, 4).join(" | "));
  note("bucket privé", rights[4] === "false,4000000" && rights[5] === "0", rights.slice(4).join(" | "));

  const people = [
    ["camille.pilote@exemple.test", "Camille Pilote", "Commercial", organizationId],
    ["rita.pilote@exemple.test", "Rita Pilote", "Responsable commercial", organizationId],
    ["karim.pilote@exemple.test", "Karim Pilote", "Commercial", organizationId],
    ["noah.pilote@exemple.test", "Noah Pilote", "Responsable commercial", organizationId],
    ["admin.pilote@exemple.test", "Admin Pilote", "Admin VIP", organizationId],
    ["super.pilote@exemple.test", "Super Pilote", "Superadmin", organizationId],
    ["direction.pilote@exemple.test", "Direction Pilote", "Direction", organizationId],
    ["nassim.pilote@exemple.test", "Nassim Pilote", "Commercial", orgB],
  ];
  sql(`insert into public.organizations (id, name) values (${quote(orgB)}, ${quote(ORG_B_NAME)});`);
  const actors = {};
  for (const [email, name, role, org] of people) {
    const password = randomBytes(18).toString("hex");
    const user = await api("/auth/v1/admin/users", {
      method: "POST",
      body: { email, password, email_confirm: true, user_metadata: { full_name: name } },
    });
    sql(`
      insert into public.profiles (id, organization_id, full_name, email, role, active, onboarding_completed_at)
      values (${quote(user.id)}, ${quote(org)}, ${quote(name)}, ${quote(email)}, ${quote(role)}, true, now());
    `);
    const session = await api("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email, password },
    });
    actors[email] = { id: user.id, token: session.access_token, role };
  }
  const camille = actors["camille.pilote@exemple.test"];
  const rita = actors["rita.pilote@exemple.test"];
  const karim = actors["karim.pilote@exemple.test"];
  const clientId = sql(`
    insert into public.clients (organization_id, nom, prenom, statut, commercial_id)
    values (${quote(organizationId)}, 'Client fictif pilote', 'Nora', 'Devis en cours', ${quote(camille.id)})
    returning id;
  `).split("\n").pop();
  sql(`
    insert into public.commercial_appointments (organization_id, prospect_name, starts_at, status, commercial_id)
    values (${quote(organizationId)}, 'Client fictif pilote', now() - interval '2 days', 'Non statué', ${quote(camille.id)});
  `);
  const prospectId = sql(`
    insert into public.commercial_opportunities (organization_id, name, stage, commercial_id)
    values (${quote(organizationId)}, 'Opportunité fictive pilote', 'Nouveau', ${quote(camille.id)})
    returning id;
  `).split("\n").pop();
  function insertDevis(number, owner, org, total) {
    return sql(`
      insert into public.devis (
        organization_id, kind, numero_devis, client_id, client_name, commercial_id, statut, total_ttc, extra
      ) values (
        ${quote(org)}, 'Devis', ${quote(number)}, ${owner === karim.id || owner === camille.id ? quote(clientId) : "null"},
        'Nora Client fictif pilote', ${quote(owner)}, 'Envoyé', ${total},
        ${owner === camille.id ? quote(JSON.stringify({ sourceProspectId: prospectId })) : "'{}'"}::jsonb
      ) returning id;
    `).split("\n").pop();
  }
  const devisA = insertDevis("DEV-PILOTE-A", camille.id, organizationId, 12000);
  const devisB = insertDevis("DEV-PILOTE-B", camille.id, organizationId, 8000);
  const devisOther = insertDevis("DEV-PILOTE-AUTRE", karim.id, organizationId, 4242);
  const devisOrg = insertDevis("DEV-PILOTE-ORG", actors["nassim.pilote@exemple.test"].id, orgB, 5000);
  const digest = randomBytes(32).toString("hex");
  const oldPath = `devis-signatures/${organizationId}/${devisOther}/${digest}.pdf`;
  sql(`
    insert into public.devis_signatures (
      organization_id, devis_id, commercial_id, proof_kind, status, declared_signature_on,
      amount_ttc, storage_path, proof_digest, idempotency_key, link_state, confirmed_at
    ) values (
      ${quote(organizationId)}::uuid, ${quote(devisOther)}::uuid, ${quote(karim.id)}::uuid, 'devis_signe', 'confirmee',
      '2026-10-01', 4242, ${quote(oldPath)}, ${quote(digest)}, ${quote(randomUUID())}, 'À rattacher', '2026-10-01T10:00:00Z'
    );
  `);
  const uploaded = await fetch(`${url}/storage/v1/object/devis-signatures/${organizationId}/${devisOther}/${digest}.pdf`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/pdf" },
    body: Buffer.from("%PDF-1.4\nancienne preuve fictive\n%%EOF"),
  });
  note("ancienne preuve préparée", uploaded.ok, String(uploaded.status));

  register(new URL("./resolve-js.mjs", import.meta.url).href, import.meta.url);
  const route = await import("../../app/api/devis/[id]/signature/route.js");
  const { COMMERCIAL_SALE_PRODUCTION_WRITE } = await import("../../app/lib/commercial-sale-production.js");
  note("constante production fermée", COMMERCIAL_SALE_PRODUCTION_WRITE === false);

  const date = "2026-11-13";
  const closed = await call(route, "POST", devisA, camille.token, {
    action: "demande", declaredSignatureDate: date, pdfBase64: pdf("preuve-a"), kind: "devis_signe",
  });
  const closedCount = sql(`select count(*)::text from public.devis_signatures where devis_id = ${quote(devisA)};`).trim();
  note("mode off refuse", closed.status === 403 && /désactivé/.test(closed.payload?.error || "") && closedCount === "0", closed.payload?.error || "");

  process.env.MKL_SIGNATURE_MODULE = "pilote";
  const unconfigured = await call(route, "POST", devisA, camille.token, {
    action: "demande", declaredSignatureDate: date, pdfBase64: pdf("preuve-a"), kind: "devis_signe",
  });
  note("pilote sans identifiants refuse", unconfigured.status === 403 && closedCount === sql(`select count(*)::text from public.devis_signatures where devis_id = ${quote(devisA)};`).trim(), unconfigured.payload?.error || "");

  process.env.MKL_SIGNATURE_PILOT_COMMERCIAL_ID = camille.id;
  process.env.MKL_SIGNATURE_PILOT_MANAGER_ID = rita.id;
  const forbiddenActors = [
    ["autre commercial", karim],
    ["autre responsable", actors["noah.pilote@exemple.test"]],
    ["admin vip", actors["admin.pilote@exemple.test"]],
    ["superadmin", actors["super.pilote@exemple.test"]],
    ["direction", actors["direction.pilote@exemple.test"]],
    ["autre organisation", actors["nassim.pilote@exemple.test"]],
  ];
  let refusals = true;
  for (const [label, actor] of forbiddenActors) {
    const response = await call(route, "POST", devisA, actor.token, {
      action: actor.role === "Commercial" ? "demande" : "confirmer",
      declaredSignatureDate: date,
      pdfBase64: pdf("intrus"),
      kind: "devis_signe",
      MKL_SIGNATURE_PILOT_COMMERCIAL_ID: camille.id,
      MKL_SIGNATURE_PILOT_MANAGER_ID: actor.id,
      userId: camille.id,
    });
    const own = await call(route, "GET", actor === actors["nassim.pilote@exemple.test"] ? devisOrg : devisA, actor.token);
    if (response.status !== 403 || own.status !== 403 || leaked(response.payload, [12000, 4242, digest]) || leaked(own.payload, [12000, 4242, digest])) {
      refusals = false;
      note(`refus ${label}`, false, `${response.status} ${own.status}`);
    }
  }
  if (refusals) note("autres comptes refusés sans fuite", true, String(forbiddenActors.length));

  const preview = await call(route, "POST", devisA, actors["admin.pilote@exemple.test"].token, {
    action: "demande", declaredSignatureDate: date, pdfBase64: pdf("apercu"), kind: "devis_signe",
  }, { "x-mkl-user-preview": camille.id });
  note("aperçu admin ignoré", preview.status === 403 && !leaked(preview.payload, [12000, digest]), preview.payload?.error || "");

  const colleague = await call(route, "POST", devisOther, camille.token, {
    action: "demande", declaredSignatureDate: date, pdfBase64: pdf("preuve-collegue"), kind: "devis_signe",
  });
  note("dépôt hors de ses devis refusé", colleague.status === 403, colleague.payload?.error || "");

  const forged = await call(route, "POST", devisA, camille.token, {
    action: "demande", declaredSignatureDate: date, pdfBase64: pdf("preuve-a"), kind: "devis_signe", amountTtc: 1,
  });
  note("montant falsifié refusé", forged.status === 400, forged.payload?.error || "");
  const demand = await call(route, "POST", devisA, camille.token, {
    action: "demande", declaredSignatureDate: date, pdfBase64: pdf("preuve-a"), kind: "devis_signe",
  });
  const repeated = await call(route, "POST", devisA, camille.token, {
    action: "demande", declaredSignatureDate: date, pdfBase64: pdf("preuve-a"), kind: "devis_signe",
  });
  const amount = sql(`
    select amount_ttc::text || '|' || count(*)::text
    from public.devis_signatures where devis_id = ${quote(devisA)} group by amount_ttc;
  `).trim();
  note("dépôt du commercial pilote", demand.status === 200 && amount === "12000.00|1" && (repeated.status === 200 || repeated.status === 400), `${demand.status} ${repeated.status} ${amount}`);
  const stillSent = sql(`select statut from public.devis where id = ${quote(devisA)};`).trim();
  note("dépôt ne rend pas le devis accepté", stillSent === "Envoyé", stillSent);

  const commercialConfirm = await call(route, "POST", devisA, camille.token, { action: "confirmer" });
  note("commercial pilote ne confirme pas", commercialConfirm.status === 403, commercialConfirm.payload?.error || "");
  const managerDeposit = await call(route, "POST", devisB, rita.token, {
    action: "demande", declaredSignatureDate: date, pdfBase64: pdf("preuve-b"), kind: "devis_signe",
  });
  note("responsable pilote ne dépose pas", managerDeposit.status === 403, managerDeposit.payload?.error || "");

  const confirmed = await call(route, "POST", devisA, rita.token, { action: "confirmer" });
  const after = sql(`
    select (select statut from public.devis where id = ${quote(devisA)});
    select (select stage from public.commercial_opportunities where id = ${quote(prospectId)});
    select (select statut from public.clients where id = ${quote(clientId)});
    select (select status from public.commercial_appointments where prospect_name = 'Client fictif pilote' limit 1);
    select (select amount_ttc::text from public.devis_signatures where devis_id = ${quote(devisA)});
    select (select confirmed_at::text from public.devis_signatures where devis_id = ${quote(devisA)});
  `).split(/\n/).map(item => item.trim()).filter(Boolean);
  const november = filterVerifiedSales([{
    status: "confirmee",
    amountTtc: Number(after[4]),
    confirmedAt: after[5],
    label: "DEV-PILOTE-A",
    client: "Nora",
  }], { from: "2026-11-01", to: "2026-11-30" });
  const december = filterVerifiedSales([{
    status: "confirmee",
    amountTtc: Number(after[4]),
    confirmedAt: after[5],
    label: "DEV-PILOTE-A",
    client: "Nora",
  }], { from: "2026-12-01", to: "2026-12-31" });
  note(
    "confirmation métier",
    confirmed.status === 200 && after[0] === "Accepté" && after[1] === "Gagné" && after[2] === "Devis en cours" && after[3] === "Non statué" && after[4] === "12000.00" && november.length === 1 && december.length === 0,
    after.join(" | "),
  );

  const proof = await call(route, "GET", devisA, camille.token, undefined, {}, "?fichier=1");
  const managerProof = await call(route, "GET", devisA, rita.token, undefined, {}, "?fichier=1");
  const adminProof = await call(route, "GET", devisA, actors["admin.pilote@exemple.test"].token, undefined, {}, "?fichier=1");
  note("pdf réservé au couple pilote", proof.status === 200 && proof.payload?.pdf === true && managerProof.status === 200 && adminProof.status === 403, `${proof.status} ${managerProof.status} ${adminProof.status}`);

  const storagePath = sql(`select storage_path from public.devis_signatures where devis_id = ${quote(devisA)};`).trim();
  const objectName = storagePath.replace(/^devis-signatures\//, "");
  const directHttp = await fetch(`${url}/storage/v1/object/devis-signatures/${objectName.split("/").map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${actors["admin.pilote@exemple.test"].token}`, apikey: actors["admin.pilote@exemple.test"].token },
  });
  const directSql = psql(asUser(actors["admin.pilote@exemple.test"].id, `
    select 'table=' || count(*)::text from public.devis_signatures;
  `), { stop: false });
  const directStorage = psql(asUser(actors["super.pilote@exemple.test"].id, `
    select 'storage=' || count(*)::text from storage.objects where bucket_id = 'devis-signatures';
  `), { stop: false });
  const storageCount = (directStorage.stdout.match(/storage=(\d+)/) || [])[1];
  note("storage direct refusé", directHttp.status !== 200 && (!directSql.ok || /permission denied|droit refusé/i.test(directSql.text)) && (!directStorage.ok || storageCount === "0"), `http ${directHttp.status} sql ${directSql.ok ? storageCount || directSql.text : "refusé"}`);

  const hiddenOld = await call(route, "GET", devisOther, camille.token);
  const hiddenManager = await call(route, "GET", devisOther, rita.token);
  note("ancienne preuve d’un autre commercial cachée", hiddenOld.status === 403 && hiddenManager.status === 403 && !leaked(hiddenOld.payload, [4242, digest]) && !leaked(hiddenManager.payload, [4242, digest]), `${hiddenOld.status} ${hiddenManager.status}`);

  await call(route, "POST", devisB, camille.token, {
    action: "demande", declaredSignatureDate: date, pdfBase64: pdf("preuve-b"), kind: "devis_signe",
  });
  const replaced = await call(route, "POST", devisB, rita.token, { action: "remplacer", replacesDevisId: devisA });
  const otherReplace = await call(route, "POST", devisB, actors["noah.pilote@exemple.test"].token, { action: "remplacer", replacesDevisId: devisA });
  const replacement = sql(`
    select (select status from public.devis_signatures where devis_id = ${quote(devisA)});
    select (select status from public.devis_signatures where devis_id = ${quote(devisB)});
    select (select statut from public.devis where id = ${quote(devisA)});
    select (select statut from public.devis where id = ${quote(devisB)});
  `).split(/\n/).map(item => item.trim()).filter(Boolean);
  note("avenant du commercial pilote", replaced.status === 200 && otherReplace.status === 403 && replacement[0] === "remplacee" && replacement[1] === "confirmee" && replacement[2] === "Accepté" && replacement[3] === "Accepté", replacement.join(" | "));

  const cancelled = await call(route, "POST", devisB, rita.token, { action: "annuler", reason: "Client fictif se rétracte" });
  const commercialCancel = await call(route, "POST", devisB, camille.token, { action: "annuler", reason: "Client fictif se rétracte" });
  const cancelState = sql(`
    select status || '|' || coalesce((select statut from public.devis where id = ${quote(devisB)}), '')
    from public.devis_signatures where devis_id = ${quote(devisB)};
  `).trim();
  note("annulation conservée dans la preuve", cancelled.status === 200 && commercialCancel.status === 403 && cancelState === "annulee|Accepté", `${cancelled.status} ${cancelState}`);
} catch (error) {
  note("parcours interrompu", false, redact(error?.stack || error?.message || error));
  process.exitCode = 1;
} finally {
  try {
    await removeFictional();
    const left = sql(`
      select (
        (select count(*) from public.devis where numero_devis like 'DEV-PILOTE-%')
        + (select count(*) from public.clients where nom = 'Client fictif pilote')
        + (select count(*) from public.profiles where lower(email) like '%.pilote@exemple.test')
        + (select count(*) from auth.users where lower(email) like '%.pilote@exemple.test')
        + (select count(*) from public.organizations where name = ${quote(ORG_B_NAME)})
        + (select count(*) from public.devis_signatures s join public.devis d on d.id = s.devis_id where d.numero_devis like 'DEV-PILOTE-%')
        + (select count(*) from public.commercial_opportunities where name = 'Opportunité fictive pilote')
        + (select count(*) from public.commercial_appointments where prospect_name = 'Client fictif pilote')
      )::text;
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
