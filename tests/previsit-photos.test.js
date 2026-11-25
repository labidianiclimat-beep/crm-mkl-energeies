import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CLIENT_DOCUMENT_KINDS, normalizeDocumentKind } from "../app/lib/client-documents.js";
import {
  PREVISIT_EQUIPMENT,
  createMark,
  normalizeCaption,
  normalizeComment,
  normalizeMarks,
  normalizeVisitKey,
  parseJpegBuffer,
  storagePathForPhoto,
} from "../app/lib/previsit-photos.js";
import { assertReportPhotos, groupPhotosForReport, parseReportJpegPages } from "../app/lib/previsit-photo-report.js";
import { roleModuleDefaults } from "../app/lib/roles.js";

function tinyJpeg() {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
}

test("clé de prévisite et chemin Storage privés", () => {
  assert.equal(normalizeVisitKey("1742160000000"), "1742160000000");
  assert.equal(normalizeVisitKey("PRE-123"), "PRE-123");
  assert.throws(() => normalizeVisitKey("../secret"), /Prévisite introuvable/);
  assert.equal(
    storagePathForPhoto({
      organizationId: "org-1",
      visitKey: "1742160000000",
      photoId: "photo-1",
      kind: "original",
    }),
    "org-1/previsits/1742160000000/photo-1-original.jpg"
  );
});

test("bibliothèque : 4 équipements, annotations normalisées", () => {
  assert.equal(PREVISIT_EQUIPMENT.length, 4);
  assert.deepEqual(PREVISIT_EQUIPMENT.map(item => item.id), [
    "indoor_ac",
    "indoor_hp",
    "outdoor_ac",
    "outdoor_hp",
  ]);
  const mark = createMark("outdoor_hp", 0.4, 1.8);
  assert.equal(mark.equipmentType, "outdoor_hp");
  assert.equal(mark.y, 1);
  const [saved] = normalizeMarks([{ equipmentType: "indoor_ac", x: -1, y: 0.2, scale: 9, rotation: -90 }]);
  assert.equal(saved.x, 0);
  assert.equal(saved.scale, 0.8);
  assert.equal(saved.rotation, 270);
  assert.throws(() => normalizeMarks([{ equipmentType: "unknown", x: 0.5, y: 0.5 }]), /bibliothèque/);
  assert.equal(normalizeCaption("  Unité extérieure  "), "Unité extérieure");
  assert.equal(normalizeComment("a".repeat(600)).length, 500);
});

test("rapport : 1 à 2 photos par page, JPEG obligatoire", () => {
  assert.throws(() => assertReportPhotos([]), /au moins une photo/);
  const pages = groupPhotosForReport([
    { id: "a", width: 1600, height: 900 },
    { id: "b", width: 1800, height: 1000 },
    { id: "c", width: 900, height: 1400 },
  ]);
  assert.equal(pages.length, 2);
  assert.equal(pages[0].length, 2);
  assert.equal(pages[1][0].id, "c");
  assert.doesNotThrow(() => parseJpegBuffer(tinyJpeg(), "La photo originale"));
  assert.throws(() => parseJpegBuffer(Buffer.from("%PDF"), "La photo originale"), /JPEG/);
  const reportPages = parseReportJpegPages(Array.from({ length: 12 }, tinyJpeg));
  assert.equal(reportPages.length, 12);
});

test("le PDF est un justificatif client Rapport de prévisite", () => {
  assert.ok(CLIENT_DOCUMENT_KINDS.includes("Rapport de prévisite"));
  assert.equal(normalizeDocumentKind("Rapport de prévisite"), "Rapport de prévisite");
});

test("technicien et responsable technique ont Visites techniques", () => {
  const defaults = roleModuleDefaults();
  assert.ok(defaults.Technicien.includes("Visites techniques"));
  assert.ok(defaults["Responsable technique"].includes("Visites techniques"));
});

test("le formulaire prévisite embarque photos, capture et génération PDF", () => {
  const page = readFileSync(new URL("../app/previsite/page.js", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../app/components/previsit-photos-panel.js", import.meta.url), "utf8");
  const sql = readFileSync(new URL("../supabase/migrations/20260921_previsit_photos.sql", import.meta.url), "utf8");
  const photos = readFileSync(new URL("../app/api/previsits/[visitKey]/photos/route.js", import.meta.url), "utf8");
  const report = readFileSync(new URL("../app/api/previsits/[visitKey]/report/route.js", import.meta.url), "utf8");
  assert.match(page, /loadSharedRecords\("mkl-technical-visits"\)/);
  assert.match(page, /saveSharedRecords\("mkl-technical-visits"/);
  assert.doesNotMatch(page, /loadSharedOrgState|saveSharedOrgState/);
  assert.match(page, /PrevisitPhotosPanel/);
  assert.match(page, /ensureVisit/);
  assert.match(panel, /Photos techniques/);
  assert.match(panel, /Générer le rapport PDF/);
  assert.match(panel, /composeReportPageJpegs/);
  assert.match(sql, /previsit-photos/);
  assert.match(sql, /previsit_photo_marks/);
  assert.match(photos, /module: "Visites techniques"/);
  assert.match(report, /Rapport de prévisite/);
});
