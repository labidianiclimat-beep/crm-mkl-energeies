import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addMonthsIso,
  applyTownHallStatus,
  buildTownHallNotice,
  defaultProcedureId,
  emptyTownHall,
  requiredPieceIds,
  townHallFromProject,
  townHallPieceProgress,
} from "../app/lib/pv-town-hall.js";
import { buildTownHallDossierPdfBlob } from "../app/lib/pv-town-hall-pdf.js";
import {
  buildUrbanismeRecord,
  geoportailCadastreUrl,
  parseCadastreFeature,
  parseZoneUrbaFeature,
} from "../app/lib/pv-urbanisme.js";

const maison = {
  housingType: "Maison",
  constructionYear: "1998",
  occupancy: "Propriétaire",
  address: "12 rue des Énergies",
  postalCode: "44500",
  city: "La Baule",
};

const project = {
  id: 1,
  name: "Toiture 6 kWc",
  client: "Dupont",
  address: "12 rue des Énergies",
  postcode: "44500",
  city: "La Baule",
  powerKwp: 6,
  panels: 14,
  panelPower: 430,
  estimatedProduction: 7200,
  townHallStatus: "À préparer",
};

test("une maison part sur une DP maison individuelle", () => {
  assert.equal(defaultProcedureId(maison), "dp-maison");
  assert.equal(defaultProcedureId({ housingType: "Appartement" }), "dp-autre");
});

test("le locataire et l ABF ajoutent des pièces", () => {
  const base = requiredPieceIds(emptyTownHall({ person: maison }), maison);
  assert.ok(base.includes("cerfa"));
  assert.ok(base.includes("notice"));
  assert.equal(base.includes("owner"), false);
  const locataire = requiredPieceIds({}, { ...maison, occupancy: "Locataire" });
  assert.ok(locataire.includes("owner"));
  const abf = requiredPieceIds({ abf: "oui" }, maison);
  assert.ok(abf.includes("abf"));
});

test("la progression compte uniquement les pièces exigées", () => {
  const townHall = emptyTownHall({ person: maison });
  const ids = requiredPieceIds(townHall, maison);
  townHall.pieces = Object.fromEntries(ids.map(id => [id, true]));
  const progress = townHallPieceProgress(townHall, maison);
  assert.equal(progress.done, ids.length);
  assert.equal(progress.ready, true);
});

test("déposer une DP pose les dates d instruction", () => {
  const next = applyTownHallStatus({ ...project, townHall: emptyTownHall({ person: maison }) }, "Déposée", maison);
  assert.equal(next.townHallStatus, "Déposée");
  assert.match(next.townHall.depositedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(next.townHall.instructionUntil, addMonthsIso(next.townHall.depositedAt, 1));
  const protectedSite = applyTownHallStatus({
    ...project,
    townHall: { ...emptyTownHall({ person: maison }), abf: "oui" },
  }, "Déposée", maison);
  assert.equal(protectedSite.townHall.instructionUntil, addMonthsIso(protectedSite.townHall.depositedAt, 2));
});

test("la notice reprend puissance adresse et occupant", () => {
  const notice = buildTownHallNotice(project, maison, emptyTownHall({ person: maison }));
  assert.match(notice, /6/);
  assert.match(notice, /La Baule/);
  assert.match(notice, /propriétaire/i);
  assert.match(notice, /14/);
});

test("le cadastre IGN est relu", () => {
  const cadastre = parseCadastreFeature({
    features: [{
      properties: {
        nom_com: "La Baule-Escoublac",
        commune: "44055",
        section: "AB",
        numero: "0123",
        prefixe: "000",
        contenance: 540,
      },
    }],
  });
  assert.equal(cadastre.section, "AB");
  assert.equal(cadastre.numero, "0123");
  const zone = parseZoneUrbaFeature({
    features: [{ properties: { libelle: "Ua", libelong: "Zone urbaine mixte", typezone: "U" } }],
  });
  assert.equal(zone.zoneLabel, "Ua");
  const record = buildUrbanismeRecord({ lat: 47.28, lon: -2.39, cadastre, zone });
  assert.match(record.geoportailUrl, /geoportail\.gouv\.fr/);
  assert.equal(geoportailCadastreUrl(-2.39, 47.28).includes("-2.39"), true);
});

test("le PDF dossier mairie est vectoriel", async () => {
  const blob = await buildTownHallDossierPdfBlob({
    project: { ...project, townHall: townHallFromProject({ townHall: emptyTownHall({ person: maison }) }, maison) },
    client: { name: "Jean Dupont", ...maison },
    company: { legalName: "MKL Énergies", siret: "93002197200010" },
    logoData: "",
  });
  assert.ok(blob?.size > 800);
  const raw = Buffer.from(await blob.arrayBuffer()).toString("latin1");
  assert.equal(raw.slice(0, 5), "%PDF-");
  assert.match(raw, /DOSSIER MAIRIE|MAIRIE/);
  assert.match(raw, /Dupont|La Baule/);
});

test("le module PV ouvre le dossier mairie", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/pv/urbanisme/route.js", import.meta.url), "utf8");
  assert.match(page, /PvTownHallDossier/);
  assert.match(page, /emptyTownHall/);
  assert.match(page, /pv-table/);
  assert.match(page, /data-panel pv-table/);
  assert.match(api, /apicarto\.ign\.fr/);
  assert.match(api, /requireApiSession/);
});
