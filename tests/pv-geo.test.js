import test from "node:test";
import assert from "node:assert/strict";
import {
  estimateYieldFallback,
  extractPvgisTypicalDays,
  extractPvgisYearlyKwhPerKwp,
  ignOrthoTileUrl,
  ignOrthoWms,
  lonLatToImagePercent,
  lonLatToTile,
  normalizeBanFeature,
  parsePvgisHourStamp,
  typicalDaysMonthlyKwhPerKwp,
} from "../app/lib/pv-geo.js";

test("normalizes BAN feature", () => {
  const item = normalizeBanFeature({
    geometry: { coordinates: [-1.55, 47.22] },
    properties: {
      label: "12 rue de la Paix 44000 Nantes",
      name: "12 rue de la Paix",
      postcode: "44000",
      city: "Nantes",
      score: 0.95,
    },
  });
  assert.equal(item.city, "Nantes");
  assert.equal(item.lat, 47.22);
  assert.equal(item.lon, -1.55);
});

test("estimates fallback yield by latitude", () => {
  assert.ok(estimateYieldFallback(43) > estimateYieldFallback(49));
});

test("reads PVGIS yearly output", () => {
  assert.equal(
    extractPvgisYearlyKwhPerKwp({ outputs: { totals: { fixed: { E_y: 1123.4 } } } }),
    1123
  );
  assert.equal(extractPvgisYearlyKwhPerKwp({}), null);
});

test("la serie horaire PVGIS devient 12 journees types", () => {
  assert.deepEqual(parsePvgisHourStamp("20200615:1210"), { month: 5, hour: 12 });
  const typicalDays = extractPvgisTypicalDays({
    outputs: {
      hourly: [
        { time: "20190115:0010", P: 0 },
        { time: "20190115:1210", P: 80 },
        { time: "20190615:1210", P: 420 },
        { time: "20190615:1310", P: 400 },
        ...Array.from({ length: 24 * 28 }, (_, index) => ({
          time: `201902${String((index % 28) + 1).padStart(2, "0")}:${String(index % 24).padStart(2, "0")}10`,
          P: index % 24 === 12 ? 200 : 0,
        })),
      ],
    },
  });
  assert.equal(typicalDays.length, 12);
  assert.equal(typicalDays[0].length, 24);
  assert.ok(typicalDays[5][12] >= 400);
  assert.equal(typicalDays[0][0], 0);
  assert.equal(typicalDaysMonthlyKwhPerKwp(typicalDays).length, 12);
});

test("la tuile IGN suit les coordonnees de la toiture", () => {
  const tile = lonLatToTile(6.95, 48.18, 18);
  assert.ok(tile.x > 0 && tile.y > 0);
  assert.match(ignOrthoTileUrl(6.95, 48.18), /ORTHOIMAGERY\.ORTHOPHOTOS/);
  const ortho = ignOrthoWms(6.9448, 48.1852);
  assert.match(ortho.url, /wms-r\/wms/);
  const mid = lonLatToImagePercent(6.9448, 48.1852, ortho.bounds);
  assert.ok(Math.abs(mid.x - 50) < 1);
  assert.ok(Math.abs(mid.y - 50) < 1);
});
