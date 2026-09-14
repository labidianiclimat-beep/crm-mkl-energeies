import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  articleIdentity,
  billingIdentity,
  buildLegacyReport,
  clientIdentity,
  diffLegacyRecords,
  legacyArticleToPayload,
  legacyClientToPayload,
  mergeLegacySources,
} from "../app/lib/legacy-state-recovery.js";

test("un client est identifie par son email quelle que soit la casse", () => {
  const a = clientIdentity({ email: "Jean.Dupont@Example.FR", name: "Jean Dupont" });
  const b = clientIdentity({ email: " jean.dupont@example.fr ", name: "Autre libelle" });
  assert.equal(a, b);
});

test("sans email un client retombe sur le nom et la ville", () => {
  assert.equal(clientIdentity({ name: "SCI Horizon", city: "Nantes" }), "name:sci horizon|nantes");
  assert.notEqual(
    clientIdentity({ name: "SCI Horizon", city: "Nantes" }),
    clientIdentity({ name: "SCI Horizon", city: "Rennes" })
  );
});

test("un client sans email ni nom n'est pas identifiable", () => {
  assert.equal(clientIdentity({ city: "Nantes" }), "");
  assert.equal(clientIdentity({}), "");
});

test("le nom compose sert de repli quand name est absent", () => {
  assert.equal(
    clientIdentity({ firstName: "Marie", lastName: "Laurent", city: "Angers" }),
    "name:marie laurent|angers"
  );
});

test("un article est identifie par son code, un devis par son numero", () => {
  assert.equal(articleIdentity({ code: "ART-001", name: "Panneau" }), "code:art-001");
  assert.equal(articleIdentity({ name: "Panneau" }), "name:panneau");
  assert.equal(billingIdentity({ number: "DEV-2026-042" }), "number:dev-2026-042");
  assert.equal(billingIdentity({}), "");
});

test("la comparaison ne retient que les absents de la base", () => {
  const legacy = [
    { email: "a@x.fr", name: "A" },
    { email: "b@x.fr", name: "B" },
    { email: "c@x.fr", name: "C" },
  ];
  const current = [{ email: "B@X.FR", name: "B en base" }];
  const missing = diffLegacyRecords(legacy, current, clientIdentity);
  assert.deepEqual(missing.map(row => row.email), ["a@x.fr", "c@x.fr"]);
});

test("les doublons internes a l'ancien stockage sont reduits", () => {
  const legacy = [
    { email: "a@x.fr" },
    { email: "A@x.fr" },
    { name: "Sans email", city: "Nantes" },
    { name: "sans email", city: "NANTES" },
  ];
  const missing = diffLegacyRecords(legacy, [], clientIdentity);
  assert.equal(missing.length, 2);
});

test("les enregistrements non identifiables sont ignores plutot que dupliques", () => {
  const missing = diffLegacyRecords([{ city: "Nantes" }, {}], [], clientIdentity);
  assert.equal(missing.length, 0);
});

test("la fusion de plusieurs sources dedoublonne par identite", () => {
  const local = [{ email: "a@x.fr" }, { email: "b@x.fr" }];
  const cloud = [{ email: "B@x.fr" }, { email: "c@x.fr" }];
  const merged = mergeLegacySources([local, cloud], clientIdentity);
  assert.deepEqual(merged.map(row => row.email), ["a@x.fr", "b@x.fr", "c@x.fr"]);
});

test("des entrees vides ou absentes ne cassent pas la fusion", () => {
  assert.deepEqual(mergeLegacySources([null, undefined, []], clientIdentity), []);
  assert.deepEqual(diffLegacyRecords(null, null, clientIdentity), []);
});

test("le rapport compte le total et distingue ce qui est recuperable", () => {
  const report = buildLegacyReport({
    legacy: {
      clients: [[{ email: "a@x.fr" }, { email: "b@x.fr" }]],
      articles: [[{ code: "ART-1" }]],
      billing: [[{ number: "DEV-1" }, { number: "DEV-2" }]],
    },
    current: {
      clients: [{ email: "b@x.fr" }],
      articles: [],
      billing: [{ number: "DEV-1" }],
    },
  });

  assert.equal(report.clients.length, 1);
  assert.equal(report.articles.length, 1);
  assert.equal(report.billing.length, 1);
  assert.equal(report.total, 3);
  // Les devis ne sont pas recreables automatiquement.
  assert.equal(report.recoverable, 2);
});

test("un rapport sans ancien stockage est vide", () => {
  const report = buildLegacyReport();
  assert.equal(report.total, 0);
  assert.equal(report.recoverable, 0);
});

test("les charges utiles reprennent les champs attendus par les API", () => {
  const client = legacyClientToPayload({
    firstName: "Jean",
    lastName: "Dupont",
    email: "jean@x.fr",
    city: "Nantes",
  });
  assert.equal(client.name, "Jean Dupont");
  assert.equal(client.contact, "Jean Dupont");
  assert.equal(client.status, "Actif");
  assert.equal(client.customerType, "Particulier");

  const article = legacyArticleToPayload({ code: "ART-1", name: "Panneau", sell: "120" });
  assert.equal(article.code, "ART-1");
  assert.equal(article.sell, 120);
  assert.equal(article.tax, 20);
});

test("l'instantane de l'ancien stockage est pris au montage, pas apres le chargement des api", () => {
  const source = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const start = source.indexOf("setLegacySnapshot");
  assert.ok(start > 0, "l'instantane de l'ancien stockage n'est plus pris");
  // useStored reecrit le blob 450 ms apres le chargement : l'effet ne doit
  // dependre ni du profil ni des API, sinon il lirait un blob deja ecrase.
  const effectEnd = source.indexOf("},[]);", start);
  const nextDeps = source.indexOf("},[", start);
  assert.equal(effectEnd, nextDeps, "l'instantane depend d'un chargement et arrive trop tard");
});

test("le rapport compare la reponse des api et non les listes affichees", () => {
  const source = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(source, /buildLegacyReport\(\{legacy,current:apiSnapshot\}\)/);
  assert.ok(
    !/buildLegacyReport\(\{legacy,current:\{clients/.test(source),
    "la comparaison porte encore sur l'etat de l'ecran, que des injections locales faussent"
  );
});
