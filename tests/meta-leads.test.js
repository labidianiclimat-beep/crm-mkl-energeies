import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  META_SOURCE,
  metaFieldObject,
  metaLeadToWebPayload,
  metaLeadgenChanges,
  metaSignatureValid,
  metaVerifyChallenge,
} from "../app/lib/meta-leads.js";
import { parseWebLeadPayload } from "../app/lib/web-lead-ingest.js";
import { webLeadOrigin, webLeadProspectInput } from "../app/lib/web-lead-consumer.js";

const ROUTE = readFileSync(new URL("../app/api/webhooks/meta-leads/route.js", import.meta.url), "utf8");
const CRON = readFileSync(new URL("../app/api/cron/meta-leads-sync/route.js", import.meta.url), "utf8");
const GOOGLE = readFileSync(new URL("../app/api/web-leads/route.js", import.meta.url), "utf8");

test("la vérification Meta renvoie le challenge seulement si le jeton correspond", () => {
  const ok = metaVerifyChallenge({
    mode: "subscribe",
    token: "jeton-meta",
    challenge: "test123",
    expected: "jeton-meta",
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.challenge, "test123");
  assert.equal(metaVerifyChallenge({
    mode: "subscribe",
    token: "autre",
    challenge: "test123",
    expected: "jeton-meta",
  }).ok, false);
  assert.equal(metaVerifyChallenge({
    mode: "unsubscribe",
    token: "jeton-meta",
    challenge: "test123",
    expected: "jeton-meta",
  }).ok, false);
});

test("la signature HMAC refuse un corps modifié", () => {
  const secret = "secret-application-meta";
  const body = '{"entry":[]}';
  const header = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(metaSignatureValid(body, header, secret), true);
  assert.equal(metaSignatureValid(`${body} `, header, secret), false);
  assert.equal(metaSignatureValid(body, header, "autre-secret"), false);
  assert.equal(metaSignatureValid(body, "", secret), false);
});

test("un lead Meta devient une demande Facebook Lead Ads, sans doublon d’identifiant", () => {
  const payload = metaLeadToWebPayload({
    id: "123456789012345",
    created_time: "2026-11-18T10:00:00+0000",
    campaign_name: "PAC hiver",
    adset_name: "Île-de-France",
    ad_name: "Visuel toiture",
    form_id: "999",
    ad_id: "888",
    field_data: [
      { name: "email", values: ["ada@example.fr"] },
      { name: "full_name", values: ["Ada Lovelace"] },
      { name: "phone_number", values: ["+33612345678"] },
      { name: "post_code", values: ["75011"] },
      { name: "quel_est_votre_projet", values: ["Rénovation"] },
      { name: "etes_vous_proprietaire", values: ["oui"] },
    ],
  });
  const parsed = parseWebLeadPayload(payload);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.submissionId, "123456789012345");
  assert.equal(parsed.value.source, META_SOURCE);
  assert.equal(parsed.value.email, "ada@example.fr");
  assert.equal(parsed.value.phone, "+33612345678");
  assert.equal(parsed.value.postalCode, "75011");
  assert.deepEqual(parsed.value.projects, ["Rénovation"]);
  assert.match(parsed.value.message, /Propriétaire : oui/);
  assert.match(parsed.value.message, /form_id : 999/);
  assert.equal(parsed.value.attribution.utm_campaign, "PAC hiver");
  assert.equal(parsed.value.attribution.utm_content, "Île-de-France");
  assert.equal(parsed.value.attribution.utm_term, "Visuel toiture");

  const origin = webLeadOrigin(parsed.value);
  assert.equal(origin.category, "meta_ads");
  const input = webLeadProspectInput(parsed.value, origin);
  assert.equal(input.source, "Facebook Lead Ads");
  assert.equal(input.extra.webLead.submissionId, "123456789012345");
});

test("seuls les changements leadgen sont retenus", () => {
  const changes = metaLeadgenChanges({
    entry: [{
      changes: [
        { field: "feed", value: { leadgen_id: "1" } },
        { field: "leadgen", value: { leadgen_id: "123456789", form_id: "f", ad_id: "a", page_id: "p" } },
      ],
    }],
  });
  assert.deepEqual(changes, [{ leadgenId: "123456789", formId: "f", adId: "a", pageId: "p" }]);
});

test("les champs Meta deviennent un objet", () => {
  assert.deepEqual(metaFieldObject([{ name: "email", values: ["a@b.c", "ignore"] }]), { email: "a@b.c, ignore" });
});

test("la route webhook vérifie le corps brut et la route Google Ads n’est pas branchée sur Meta", () => {
  assert.match(ROUTE, /request\.text\(\)/);
  assert.match(ROUTE, /x-hub-signature-256/);
  assert.match(ROUTE, /recordMetaLead/);
  assert.equal(ROUTE.includes("google"), false);
  assert.match(CRON, /cronAuthorized/);
  assert.match(CRON, /META_FORM_IDS|metaFormIds/);
  assert.equal(GOOGLE.includes("meta-leads"), false);
  assert.equal(GOOGLE.includes("Facebook Lead Ads"), false);
});

test("une demande du site sans source explicite garde le libellé Google Ads", () => {
  const parsed = parseWebLeadPayload({
    submissionId: "11111111-1111-4111-8111-111111111111",
    kind: "lead",
    name: "Ada",
    phone: "0612345678",
    attribution: { gclid: "clic-google" },
  });
  assert.equal(parsed.value.source, undefined);
  const input = webLeadProspectInput(parsed.value);
  assert.equal(input.source, "Prospect GG Ads");
});
