/**
 * Recette locale de la signature commerciale.
 *
 * Base neuve sur 127.0.0.1:55432 uniquement. Aucune lecture de .env.local,
 * aucun appel au projet de production ni au projet de recette distant.
 */
import { CONNEXION, fichierSql, journal, recreerBase } from "./lib.mjs";

const PRODUCTION = "rzkwmwtjnwnmmcexwoov";
const RECETTE_DISTANTE = "xqbjfytrssslnsxxdrou";
const ORG = "00000000-0000-0000-0000-000000000001";
const COMMERCIAL = "11111111-1111-4111-8111-111111111111";
const RESPONSABLE = "22222222-2222-4222-8222-222222222222";
const DIRECTION = "33333333-3333-4333-8333-333333333333";
const DEVIS_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const DEVIS_2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const DEVIS_3 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const DEVIS_4 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4";
const PROSPECT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const PROSPECT_4 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4";
const CLIENT = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const RDV = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";

function exigerLocal() {
  const cible = `${CONNEXION.host}:${CONNEXION.port}`;
  if (CONNEXION.host !== "127.0.0.1" || Number(CONNEXION.port) !== 55432) {
    throw new Error(`Recette arrêtée : cible ${cible}. Seul 127.0.0.1:55432 est autorisé.`);
  }
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  if (url.includes(PRODUCTION) || url.includes(RECETTE_DISTANTE)) {
    throw new Error("Recette arrêtée : une URL Supabase distante est présente dans le processus.");
  }
}

function appel(sql, { devis, action, actor, kind = "devis_signe", date = "2026-11-13", digest = null, key = null, path = null, reason = null, replaces = null }) {
  return sql.begin(async (tx) => {
    const rows = await tx`
      select public.commit_devis_signature(
        ${devis}::uuid,
        ${action},
        ${actor}::uuid,
        ${kind},
        ${date}::date,
        ${digest},
        ${key},
        ${path},
        ${reason},
        ${replaces}::uuid
      ) as resultat
    `;
    return rows[0].resultat;
  });
}

async function main() {
  exigerLocal();
  const rapport = journal();
  const sql = await recreerBase("signature_recette");
  try {
    const identite = await sql`
      select current_database() as db, host(inet_server_addr()) as addr, inet_server_port() as port, version() as version
    `;
    rapport.info(`Base ${identite[0].db} sur ${identite[0].addr}:${identite[0].port}`);
    rapport.info(String(identite[0].version).split(",")[0]);
    if (identite[0].addr !== "127.0.0.1" || Number(identite[0].port) !== 55432 || identite[0].db !== "signature_recette") {
      throw new Error("Isolement non démontré.");
    }

    await sql.unsafe(fichierSql("scripts/pg-test/supabase-shim.sql"));
    await sql.unsafe(`
      create table public.profiles (
        id uuid primary key,
        organization_id uuid not null,
        full_name text,
        role text,
        active boolean not null default true,
        onboarding_completed_at timestamptz
      );
      create table public.devis (
        id uuid primary key,
        organization_id uuid not null,
        kind text not null,
        numero_devis text,
        commercial_id uuid,
        statut text,
        total_ttc numeric(14,2),
        extra jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now()
      );
      create table public.commercial_opportunities (
        id uuid primary key,
        organization_id uuid not null,
        stage text not null,
        updated_at timestamptz not null default now()
      );
      create table public.clients (
        id uuid primary key,
        organization_id uuid not null,
        statut text not null
      );
      create table public.commercial_appointments (
        id uuid primary key,
        organization_id uuid not null,
        status text not null
      );
      insert into public.profiles values
        ('${COMMERCIAL}', '${ORG}', 'Camille Martin', 'Commercial', true, now()),
        ('${RESPONSABLE}', '${ORG}', 'Rita Conseil', 'Responsable commercial', true, now()),
        ('${DIRECTION}', '${ORG}', 'Dana Direction', 'Direction', true, now());
      insert into public.commercial_opportunities values
        ('${PROSPECT}', '${ORG}', 'Nouveau', now()),
        ('${PROSPECT_4}', '${ORG}', 'Devis envoyé', now());
      insert into public.devis values
        ('${DEVIS_1}', '${ORG}', 'Devis', 'DEV-FICTIF-1', '${COMMERCIAL}', 'Envoyé', 12000, '{"sourceProspectId":"${PROSPECT}"}', now()),
        ('${DEVIS_2}', '${ORG}', 'Devis', 'DEV-FICTIF-2', '${COMMERCIAL}', 'Envoyé', 15000, '{"sourceProspectId":"${PROSPECT}"}', now()),
        ('${DEVIS_3}', '${ORG}', 'Devis', 'DEV-FICTIF-3', '${COMMERCIAL}', 'Envoyé', 4000, '{}', now()),
        ('${DEVIS_4}', '${ORG}', 'Devis', 'DEV-FICTIF-4', '${COMMERCIAL}', 'Envoyé', 900, '{"sourceProspectId":"${PROSPECT_4}"}', now());
      insert into public.clients values ('${CLIENT}', '${ORG}', 'Devis en cours');
      insert into public.commercial_appointments values ('${RDV}', '${ORG}', 'Non statué');
      create or replace function public.recette_bloquer_gain()
      returns trigger language plpgsql as $fn$
      begin
        if current_setting('recette.bloquer_gain', true) = '1' then
          raise exception 'opportunite indisponible';
        end if;
        return new;
      end
      $fn$;
      create trigger recette_bloquer_gain
      before update on public.commercial_opportunities
      for each row execute function public.recette_bloquer_gain();
    `);
    await sql.unsafe(fichierSql("supabase/migrations/20261113_devis_signatures.sql"));
    await sql.unsafe(fichierSql("supabase/migrations/20261113_devis_signatures_rls_securite.sql"));
    rapport.ok("Migrations appliquées sur la base locale signature_recette");

    const depot = await appel(sql, {
      devis: DEVIS_1, action: "demande", actor: COMMERCIAL, digest: "a".repeat(64), key: "b".repeat(64),
      path: `devis-signatures/${ORG}/${DEVIS_1}/${"a".repeat(64)}.pdf`,
    });
    rapport[depot.status === "demande" && Number(depot.amountTtc) === 12000 ? "ok" : "ko"](
      "Le dépôt enregistre le montant relu, 12 000 €",
      JSON.stringify(depot)
    );

    let refuse;
    try {
      await appel(sql, { devis: DEVIS_1, action: "confirmer", actor: COMMERCIAL, digest: "a".repeat(64), key: "b".repeat(64) });
      refuse = false;
    } catch (error) {
      refuse = /confirmer/.test(error.message);
    }
    rapport[refuse ? "ok" : "ko"]("Un commercial ne confirme pas la vente");

    let direction;
    try {
      await appel(sql, { devis: DEVIS_1, action: "demande", actor: DIRECTION, digest: "c".repeat(64), key: "d".repeat(64) });
      direction = false;
    } catch (error) {
      direction = /déposer|autorisé/.test(error.message);
    }
    rapport[direction ? "ok" : "ko"]("La direction ne dépose pas de signature");

    const confirme = await appel(sql, {
      devis: DEVIS_1, action: "confirmer", actor: RESPONSABLE, digest: "a".repeat(64), key: "b".repeat(64),
    });
    const devis1 = await sql`select statut from public.devis where id = ${DEVIS_1}::uuid`;
    const prospect = await sql`select stage from public.commercial_opportunities where id = ${PROSPECT}::uuid`;
    const client = await sql`select statut from public.clients where id = ${CLIENT}::uuid`;
    const rdv = await sql`select status from public.commercial_appointments where id = ${RDV}::uuid`;
    rapport[confirme.status === "confirmee" && confirme.linkState === "reliée" && Number(confirme.amountTtc) === 12000 ? "ok" : "ko"](
      "La confirmation relit 12 000 € et rattache l’opportunité",
      JSON.stringify(confirme)
    );
    rapport[devis1[0].statut === "Accepté" ? "ok" : "ko"](`Devis fictif passé à ${devis1[0].statut}`);
    rapport[prospect[0].stage === "Gagné" ? "ok" : "ko"](`Opportunité fictive passée à ${prospect[0].stage}`);
    rapport[client[0].statut === "Devis en cours" && rdv[0].status === "Non statué" ? "ok" : "ko"](
      "La fiche client et le rendez-vous fictifs restent inchangés"
    );

    let doublon;
    try {
      await appel(sql, { devis: DEVIS_1, action: "confirmer", actor: RESPONSABLE, digest: "e".repeat(64), key: "f".repeat(64) });
      doublon = false;
    } catch (error) {
      doublon = /déjà confirmée/.test(error.message);
    }
    const ouvertes = await sql`select count(*)::int as n from public.devis_signatures where devis_id = ${DEVIS_1}::uuid and status = 'confirmee'`;
    rapport[doublon && ouvertes[0].n === 1 ? "ok" : "ko"]("Une seconde confirmation est refusée");

    const sansLien = await appel(sql, {
      devis: DEVIS_3, action: "confirmer", actor: RESPONSABLE, kind: "manuel", digest: "1".repeat(64), key: "2".repeat(64),
    });
    const devis3 = await sql`select statut from public.devis where id = ${DEVIS_3}::uuid`;
    rapport[sansLien.linkState === "À rattacher" && sansLien.opportunityStage == null && devis3[0].statut === "Accepté" ? "ok" : "ko"](
      "Sans opportunité, la vente reste à rattacher",
      JSON.stringify(sansLien)
    );

    let motifCourt;
    try {
      await appel(sql, { devis: DEVIS_3, action: "annuler", actor: RESPONSABLE, reason: "ok" });
      motifCourt = false;
    } catch (error) {
      motifCourt = /motif/.test(error.message);
    }
    const annule = await appel(sql, { devis: DEVIS_3, action: "annuler", actor: RESPONSABLE, reason: "Client fictif se rétracte" });
    const devis3Apres = await sql`select statut from public.devis where id = ${DEVIS_3}::uuid`;
    rapport[motifCourt && annule.status === "annulee" && devis3Apres[0].statut === "Accepté" ? "ok" : "ko"](
      "L’annulation exige un motif et ne change pas le devis"
    );

    await sql`select set_config('recette.bloquer_gain', '1', false)`;
    let retour;
    try {
      await appel(sql, { devis: DEVIS_4, action: "confirmer", actor: RESPONSABLE, kind: "manuel", digest: "3".repeat(64), key: "4".repeat(64) });
      retour = false;
    } catch (error) {
      retour = /indisponible/.test(error.message);
    }
    await sql`select set_config('recette.bloquer_gain', '', false)`;
    const devis4 = await sql`select statut from public.devis where id = ${DEVIS_4}::uuid`;
    const prospect4 = await sql`select stage from public.commercial_opportunities where id = ${PROSPECT_4}::uuid`;
    const signatures4 = await sql`select count(*)::int as n from public.devis_signatures where devis_id = ${DEVIS_4}::uuid`;
    rapport[retour && devis4[0].statut === "Envoyé" && prospect4[0].stage === "Devis envoyé" && signatures4[0].n === 0 ? "ok" : "ko"](
      "Si l’opportunité échoue, le devis et la confirmation reviennent en arrière"
    );

    const avenant = await appel(sql, {
      devis: DEVIS_2, action: "remplacer", actor: RESPONSABLE, kind: "manuel",
      digest: "5".repeat(64), key: "6".repeat(64), replaces: DEVIS_1,
    });
    const ancien = await sql`select statut from public.devis where id = ${DEVIS_1}::uuid`;
    const ancienVente = await sql`select status from public.devis_signatures where devis_id = ${DEVIS_1}::uuid`;
    const totaux = await sql`select * from public.commercial_sale_totals(${ORG}::uuid)`;
    let reprise;
    try {
      await appel(sql, { devis: DEVIS_1, action: "confirmer", actor: RESPONSABLE, kind: "manuel", digest: "7".repeat(64), key: "8".repeat(64) });
      reprise = false;
    } catch (error) {
      reprise = /remplacé/.test(error.message);
    }
    rapport[avenant.status === "confirmee" && Number(avenant.amountTtc) === 15000 ? "ok" : "ko"]("L’avenant confirme le nouveau montant, 15 000 €");
    rapport[ancien[0].statut === "Accepté" && ancienVente[0].status === "remplacee" ? "ok" : "ko"](
      "L’ancien devis fictif n’est pas réécrit, sa vente sort du chiffre"
    );
    rapport[Number(totaux[0].net) === 15000 && Number(totaux[0].brut) === 19000 && reprise ? "ok" : "ko"](
      `Chiffre net ${totaux[0].net}, brut ${totaux[0].brut}, ancienne vente non reconfirmée`
    );

    let electronique;
    try {
      await appel(sql, { devis: DEVIS_4, action: "confirmer", actor: RESPONSABLE, kind: "electronique", digest: "9".repeat(64), key: "0".repeat(64) });
      electronique = false;
    } catch (error) {
      electronique = /électronique/.test(error.message);
    }
    rapport[electronique ? "ok" : "ko"]("Une référence électronique est refusée");

    const seau = await sql`select public, file_size_limit from storage.buckets where id = 'devis-signatures'`;
    rapport[seau[0] && seau[0].public === false && Number(seau[0].file_size_limit) === 4000000 ? "ok" : "ko"](
      "Le bac devis-signatures est privé et limité aux PDF de 4 Mo"
    );

    await sql.unsafe(`
      alter table storage.objects enable row level security;
      grant select on storage.objects to authenticated;
      insert into storage.objects (bucket_id, name)
      values ('devis-signatures', '${ORG}/${DEVIS_1}/${"a".repeat(64)}.pdf');
    `);
    const visibleCommercial = await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub', ${COMMERCIAL}, true)`;
      await tx.unsafe("set local role authenticated");
      return tx`select count(*)::int as n from public.devis_signatures`;
    });
    const visibleDirection = await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub', ${DIRECTION}, true)`;
      await tx.unsafe("set local role authenticated");
      return tx`select count(*)::int as n from public.devis_signatures`;
    });
    const visibleResponsable = await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub', ${RESPONSABLE}, true)`;
      await tx.unsafe("set local role authenticated");
      return tx`select count(*)::int as n from public.devis_signatures`;
    });
    let majInterdite = false;
    try {
      await sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claim.sub', ${RESPONSABLE}, true)`;
        await tx.unsafe("set local role authenticated");
        await tx`update public.devis_signatures set status = 'annulee'`;
      });
    } catch (error) {
      majInterdite = /permission denied|42501/i.test(`${error.code || ""} ${error.message}`);
    }
    const fichierCommercial = await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub', ${COMMERCIAL}, true)`;
      await tx.unsafe("set local role authenticated");
      return tx`select count(*)::int as n from storage.objects`;
    });
    const fichierDirection = await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub', ${DIRECTION}, true)`;
      await tx.unsafe("set local role authenticated");
      return tx`select count(*)::int as n from storage.objects`;
    });
    rapport[visibleCommercial[0].n === 3 && visibleDirection[0].n === 0 && visibleResponsable[0].n === 3 ? "ok" : "ko"](
      `RLS : commercial ${visibleCommercial[0].n}, direction ${visibleDirection[0].n}, responsable ${visibleResponsable[0].n}`
    );
    rapport[majInterdite ? "ok" : "ko"]("Un rôle connecté ne peut pas confirmer en mettant la table à jour directement");
    rapport[fichierCommercial[0].n === 1 && fichierDirection[0].n === 0 ? "ok" : "ko"](
      "Le justificatif n’est visible que pour un rôle autorisé à voir la vente"
    );

    const clientFin = await sql`select statut from public.clients where id = ${CLIENT}::uuid`;
    const rdvFin = await sql`select status from public.commercial_appointments where id = ${RDV}::uuid`;
    rapport[clientFin[0].statut === "Devis en cours" && rdvFin[0].status === "Non statué" ? "ok" : "ko"](
      "Après tout le parcours, la fiche et le rendez-vous fictifs sont identiques"
    );

    const reussi = rapport.bilan();
    if (!reussi) process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
