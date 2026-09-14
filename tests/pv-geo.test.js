import test from "node:test";
import assert from "node:assert/strict";
import {
  estimateYieldFallback,
  extractPvgisYearlyKwhPerKwp,
  normalizeBanFeature,
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
