import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { register } from "node:module";

const PRODUCTION = "rzkwmwtjnwnmmcexwoov";
const RECETTE = "xqbjfytrssslnsxxdrou";
const CLUSTER = "7703759698107299042";
const SQL_FILE = "/tmp/mkl-recette-signature-securite.sql";
const ORG_B_NAME = "Organisation fictive signature";
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
delete process.env.MKL_SIGNATURE_MODULE;
delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const identity = sql(`
select system_identifier from pg_control_system();
select inet_server_addr();
select case when to_regclass('public.crm_files') is null then 0 else 1 end;
select count(*) from public.clients where coalesce(nom, '') <> 'Client fictif signature';
select count(*) from public.devis where coalesce(numero_devis, '') not like 'DEV-FICTIF-%';
select count(*) from public.profiles where coalesce(email, '') not like '%@exemple.test';
select count(*) from public.organizations where name <> ${quote(ORG_B_NAME)} and id <> ${quote(organizationId)};
`);
const [cluster, address, crmFiles, foreignClients, foreignDevis, foreignProfiles, foreignOrgs] = identity.split(/\n/).map(item => item.trim()).filter(Boolean);
if (cluster !== CLUSTER || address.includes(PRODUCTION) || crmFiles !== "0") {
  console.error("Identité de recette non démontrée. Arrêt.");
  process.exit(2);
}
if (foreignClients !== "0" || foreignDevis !== "0" || foreignProfiles !== "0" || foreignOrgs !== "0") {
  console.error("La recette contient des données hors jeu fictif. Arrêt.");
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

const orgB = randomUUID();

async function removeFictional() {
  const rows = sql(`
    select coalesce(string_agg(storage_path, ','), '')
    from public.devis_signatures s
    join public.devis d on d.id = s.devis_id
    where d.numero_devis like 'DEV-SEC-%' or d.numero_devis like 'DEV-FICTIF-%';
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
    where j.devis_id = d.id and (d.numero_devis like 'DEV-SEC-%' or d.numero_devis like 'DEV-FICTIF-%');
    delete from public.devis_signatures s
    using public.devis d
    where s.devis_id = d.id and (d.numero_devis like 'DEV-SEC-%' or d.numero_devis like 'DEV-FICTIF-%');
    delete from public.commercial_appointments where prospect_name = 'Client fictif signature';
    delete from public.devis where numero_devis like 'DEV-SEC-%' or numero_devis like 'DEV-FICTIF-%';
    delete from public.commercial_opportunities where name like 'Opportunité fictive signature%';
    delete from public.clients where nom = 'Client fictif signature';
    delete from public.profiles where email like '%@exemple.test';
    delete from public.organizations where name = ${quote(ORG_B_NAME)};
  `);
  const listed = await api("/auth/v1/admin/users?per_page=200");
  for (const user of listed.users || []) {
    if (String(user.email || "").endsWith("@exemple.test")) {
      await api(`/auth/v1/admin/users/${user.id}`, { method: "DELETE", prefer: "" }).catch(() => {});
    }
  }
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

async function call(route, method, id, token, body) {
  const request = new Request(`http://recette.local/api/devis/${id}/signature`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const response = await route[method](request, { params: Promise.resolve({ id }) });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

try {
  await removeFictional();
  const rights = sql(`
    select has_table_privilege('authenticated', 'public.devis_signatures', 'INSERT')::text;
    select has_table_privilege('anon', 'public.devis_signatures', 'INSERT')::text;
    select has_table_privilege('service_role', 'public.devis_signatures', 'INSERT')::text;
    select count(*)::text from pg_policies where schemaname = 'public' and tablename = 'devis_signatures' and cmd = 'INSERT';
    select count(*)::text from pg_policies
      where ((schemaname = 'public' and tablename in ('devis_signatures', 'devis_signature_journal')) or policyname like 'devis_signatures%')
        and (coalesce(qual, '') || coalesce(with_check, '') like '%d.organization_id = d.organization_id%'
          or coalesce(qual, '') || coalesce(with_check, '') like '%actor.organization_id = actor.organization_id%');
    select public::text || ',' || file_size_limit::text || ',' || allowed_mime_types::text
      from storage.buckets where id = 'devis-signatures';
  `).split(/\n/).map(item => item.trim()).filter(Boolean);
  note("insertion directe révoquée", rights[0] === "false" && rights[1] === "false" && rights[2] === "true" && rights[3] === "0", rights.slice(0, 4).join(" | "));
  note("comparaisons tautologiques absentes", rights[4] === "0", rights[4]);
  note("bucket privé pdf 4 Mo", rights[5] === "false,4000000,{application/pdf}", rights[5]);

  const people = [
    ["camille.sec@exemple.test", "Camille Fictive", "Commercial", organizationId],
    ["admin.sec@exemple.test", "Admin Fictif", "Admin VIP", organizationId],
    ["rita.sec@exemple.test", "Rita Fictive", "Responsable commercial", organizationId],
    ["direction.sec@exemple.test", "Direction Fictive", "Direction", organizationId],
    ["nassim.sec@exemple.test", "Nassim Fictif", "Commercial", orgB],
    ["adminb.sec@exemple.test", "Admin Fictif B", "Admin VIP", orgB],
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
    actors[`${role}:${org === organizationId ? "A" : "B"}`] = { id: user.id, token: session.access_token };
  }

  const commercialA = actors["Commercial:A"].id;
  const clientId = sql(`
    insert into public.clients (organization_id, nom, prenom, statut, commercial_id)
    values (${quote(organizationId)}, 'Client fictif signature', 'Nora', 'Devis en cours', ${quote(commercialA)})
    returning id;
  `).split("\n").pop();
  sql(`
    insert into public.commercial_appointments (organization_id, prospect_name, starts_at, status, commercial_id)
    values (${quote(organizationId)}, 'Client fictif signature', now() - interval '2 days', 'Non statué', ${quote(commercialA)});
  `);
  const devisA = sql(`
    insert into public.devis (organization_id, numero_devis, client_id, client_name, commercial_id, statut, total_ttc, extra)
    values (${quote(organizationId)}, 'DEV-SEC-A', ${quote(clientId)}, 'Nora Client fictif', ${quote(commercialA)}, 'Envoyé', 12000, '{}'::jsonb)
    returning id;
  `).split("\n").pop();
  const devisB = sql(`
    insert into public.devis (organization_id, numero_devis, client_id, client_name, commercial_id, statut, total_ttc, extra)
    values (${quote(organizationId)}, 'DEV-SEC-B', ${quote(clientId)}, 'Nora Client fictif', ${quote(commercialA)}, 'Envoyé', 8000, '{}'::jsonb)
    returning id;
  `).split("\n").pop();
  const devisC = sql(`
    insert into public.devis (organization_id, numero_devis, client_name, commercial_id, statut, total_ttc, extra)
    values (${quote(orgB)}, 'DEV-SEC-C', 'Client fictif autre organisation', ${quote(actors["Commercial:B"].id)}, 'Envoyé', 5000, '{}'::jsonb)
    returning id;
  `).split("\n").pop();

  function directInsert(actorId, devisId, org) {
    return asUser(actorId, `
      insert into public.devis_signatures (
        organization_id, devis_id, proof_kind, status, amount_ttc, proof_digest, idempotency_key, link_state, requested_by
      ) values (
        ${quote(org)}::uuid, ${quote(devisId)}::uuid, 'devis_signe', 'demande', 1, 'digest-direct', ${quote(randomUUID())}, 'À rattacher', ${quote(actorId)}::uuid
      );
    `);
  }
  const commercialInsert = psql(directInsert(commercialA, devisA, organizationId));
  const adminInsert = psql(directInsert(actors["Admin VIP:A"].id, devisA, organizationId));
  note("commercial ne peut pas insérer", !commercialInsert.ok && /permission denied|droit refusé/i.test(commercialInsert.text), commercialInsert.text);
  note("administrateur ne peut pas insérer", !adminInsert.ok && /permission denied|droit refusé/i.test(adminInsert.text), adminInsert.text);

  const mismatched = psql(`
    begin;
    insert into public.devis_signatures (
      organization_id, devis_id, proof_kind, status, amount_ttc, proof_digest, idempotency_key, link_state, storage_path
    ) values (
      ${quote(organizationId)}::uuid, ${quote(devisA)}::uuid, 'devis_signe', 'demande', 12000, 'digest-chemin', ${quote(randomUUID())}, 'À rattacher',
      'devis-signatures/${orgB}/${devisC}/autre.pdf'
    );
    rollback;
  `);
  note("chemin d un autre devis refusé", !mismatched.ok && /violates check constraint/i.test(mismatched.text), mismatched.text);

  register(new URL("./resolve-js.mjs", import.meta.url).href, import.meta.url);
  const route = await import("../../app/api/devis/[id]/signature/route.js");
  const date = "2026-11-13";
  const forged = await call(route, "POST", devisA, actors["Commercial:A"].token, {
    action: "demande", declaredSignatureDate: date, pdfBase64: pdf("preuve-a"), kind: "devis_signe", amountTtc: 1,
  });
  note("montant falsifié refusé", forged.status === 400, forged.payload?.error || "");
  const demand = await call(route, "POST", devisA, actors["Commercial:A"].token, {
    action: "demande", declaredSignatureDate: date, pdfBase64: pdf("preuve-a"), kind: "devis_signe",
  });
  const amount = sql(`select amount_ttc::text from public.devis_signatures where devis_id = ${quote(devisA)};`).trim();
  note("dépôt serveur et montant relu", demand.status === 200 && amount === "12000.00", `${demand.status} ${amount} ${demand.payload?.error || ""}`);

  const visible = sql(`
    ${asUser(actors["Commercial:B"].id, "select 'b-commercial=' || count(*)::text from public.devis_signatures;")}
    ${asUser(actors["Admin VIP:B"].id, "select 'b-admin=' || count(*)::text from public.devis_signatures;")}
    ${asUser(actors["Admin VIP:A"].id, "select 'a-admin=' || count(*)::text from public.devis_signatures;")}
    ${asUser(actors["Commercial:B"].id, "select 'b-pdf=' || count(*)::text from storage.objects where bucket_id = 'devis-signatures';")}
    ${asUser(actors["Commercial:A"].id, "select 'a-pdf=' || count(*)::text from storage.objects where bucket_id = 'devis-signatures';")}
  `);
  const compact = visible.split(/\n/).map(line => line.trim()).filter(line => /=/.test(line)).join(" ");
  note("isolation entre organisations", compact.includes("b-commercial=0") && compact.includes("b-admin=0") && compact.includes("a-admin=1"), compact);
  note("pdf non autorisé refusé", compact.includes("b-pdf=0") && compact.includes("a-pdf=1"), compact);

  const direction = await call(route, "POST", devisA, actors["Direction:A"].token, { action: "confirmer" });
  note("direction ne confirme pas", direction.status === 403, direction.payload?.error || "");
  const confirmed = await call(route, "POST", devisA, actors["Responsable commercial:A"].token, { action: "confirmer" });
  const after = sql(`
    select (select statut from public.clients where id = ${quote(clientId)});
    select (select status from public.commercial_appointments where prospect_name = 'Client fictif signature' limit 1);
    select (select count(*) from public.devis_signature_journal where devis_id = ${quote(devisA)})::text;
  `).split(/\n/).map(item => item.trim()).filter(Boolean);
  note("confirmation sans toucher client ni rendez-vous", confirmed.status === 200 && after[0] === "Devis en cours" && after[1] === "Non statué" && Number(after[2]) >= 2, after.join(" | "));

  await call(route, "POST", devisB, actors["Commercial:A"].token, {
    action: "demande", declaredSignatureDate: date, pdfBase64: pdf("preuve-b"), kind: "devis_signe",
  });
  const replaced = await call(route, "POST", devisB, actors["Responsable commercial:A"].token, {
    action: "remplacer", replacesDevisId: devisA,
  });
  const replacement = sql(`
    select (select status from public.devis_signatures where devis_id = ${quote(devisA)});
    select (select status from public.devis_signatures where devis_id = ${quote(devisB)});
    select (select count(*) from public.devis_signature_journal where devis_id in (${quote(devisA)}, ${quote(devisB)}))::text;
  `).split(/\n/).map(item => item.trim()).filter(Boolean);
  note("avenant et journal", replaced.status === 200 && replacement[0] === "remplacee" && replacement[1] === "confirmee" && Number(replacement[2]) >= 3, replacement.join(" | "));

  const cancelled = await call(route, "POST", devisB, actors["Responsable commercial:A"].token, {
    action: "annuler", reason: "Client fictif se rétracte",
  });
  const cancelState = sql(`select status from public.devis_signatures where devis_id = ${quote(devisB)};`).trim();
  note("annulation", cancelled.status === 200 && cancelState === "annulee", cancelState);
} catch (error) {
  note("parcours interrompu", false, redact(error?.stack || error?.message || error));
  process.exitCode = 1;
} finally {
  try {
    await removeFictional();
    const left = sql(`
      select (select count(*) from public.devis where numero_devis like 'DEV-SEC-%' or numero_devis like 'DEV-FICTIF-%')
        + (select count(*) from public.clients where nom = 'Client fictif signature')
        + (select count(*) from public.profiles where email like '%@exemple.test')
        + (select count(*) from public.organizations where name = ${quote(ORG_B_NAME)})
        + (select count(*) from public.devis_signatures)
        + (select count(*) from storage.objects where bucket_id = 'devis-signatures');
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
