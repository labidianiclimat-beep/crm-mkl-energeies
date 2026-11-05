import test from "node:test";
import assert from "node:assert/strict";
import { writeArrayBuffer } from "geotiff";
import {
  fluxPercentiles,
  googleImageryYear,
  googleSegmentsToPlanes,
  lerpColor,
  normalizeBuildingInsights,
  radiusMetersFromBounds,
  shadePercentFromSunshine,
  shouldTrustGoogleRoof,
  solarUrlWithKey,
} from "../app/lib/google-solar.js";
import { encodeRgbaPng, fluxTiffToPng, rgbTiffToPng } from "../app/lib/google-solar-layers.js";
import { completeStudyFromProject, emptyCompleteStudy } from "../app/lib/pv-install-study.js";

test("l ombrage vient de l ensoleillement du pan, pas d un pourcentage tape", () => {
  assert.equal(shadePercentFromSunshine(1000, 1000), 0);
  assert.equal(shadePercentFromSunshine(900, 1000), 10);
  assert.equal(shadePercentFromSunshine(500, 1000), 40);
  assert.equal(shadePercentFromSunshine(0, 1000), 0);
});

test("les segments Google deviennent des pans orientes avec ombrage", () => {
  const planes = googleSegmentsToPlanes({
    maxSunshineHoursPerYear: 1000,
    roofSegments: [
      { azimuth: 159, pitch: 27, area: 20, sunshineQuantiles: [800, 820, 840, 850, 860, 920, 930, 940, 950, 960, 980] },
      { azimuth: 340, pitch: 27, area: 18, sunshineQuantiles: [700, 720, 740, 750, 760, 840, 850, 860, 870, 880, 900] },
      { azimuth: 90, pitch: 40, area: 3, sunshineQuantiles: [400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400] },
    ],
    solarPanels: [
      { segmentIndex: 0 }, { segmentIndex: 0 }, { segmentIndex: 0 },
      { segmentIndex: 0 }, { segmentIndex: 0 }, { segmentIndex: 0 },
      { segmentIndex: 0 }, { segmentIndex: 0 }, { segmentIndex: 0 },
      { segmentIndex: 1 }, { segmentIndex: 1 }, { segmentIndex: 1 },
      { segmentIndex: 1 }, { segmentIndex: 1 }, { segmentIndex: 1 },
      { segmentIndex: 1 }, { segmentIndex: 1 }, { segmentIndex: 1 },
    ],
  }, { panelPower: 500 });
  assert.equal(planes.length, 2);
  assert.equal(planes[0].name, "Sud");
  assert.equal(planes[0].compass, 159);
  assert.equal(planes[0].tilt, 27);
  assert.equal(planes[0].panels, 9);
  assert.equal(planes[0].shadePercent, 8);
  assert.equal(planes[1].name, "Nord");
  assert.equal(planes[1].shadePercent, 16);
});

test("le rayon de couche reste autour de la maison", () => {
  assert.equal(radiusMetersFromBounds(null), 55);
  const radius = radiusMetersFromBounds({
    sw: { latitude: 48.1848, longitude: 6.9443 },
    ne: { latitude: 48.1856, longitude: 6.9453 },
  });
  assert.ok(radius >= 40 && radius <= 80);
});

test("la cle API s ajoute aux URL GeoTIFF expirees", () => {
  assert.match(solarUrlWithKey("https://example.test/flux.tif", "abc"), /\?key=abc$/);
  assert.match(solarUrlWithKey("https://example.test/flux.tif?x=1", "abc"), /&key=abc$/);
});

test("la palette de flux va du violet a l orange", () => {
  assert.deepEqual(lerpColor(0), [18, 12, 48]);
  const hot = lerpColor(1);
  assert.ok(hot[0] > 200 && hot[1] > 180);
  const range = fluxPercentiles([0, 200, 400, 800, 1200]);
  assert.ok(range.max > range.min);
});

test("une imagerie Google trop vieille ou trop loin du site n est pas fiable", () => {
  const site = { lat: 48.1852, lon: 6.9448 };
  assert.equal(shouldTrustGoogleRoof({
    imageryDate: { year: 2012 },
    center: site,
  }, site), false);
  assert.equal(shouldTrustGoogleRoof({
    imageryDate: { year: 2024 },
    center: { lat: 48.1865, lon: 6.9468 },
  }, site), false);
  assert.equal(shouldTrustGoogleRoof({
    imageryDate: { year: 2024 },
    center: site,
  }, site), true);
  assert.equal(googleImageryYear({ imageryDate: { year: 2012, month: 3 } }), 2012);
});

test("buildingInsights garde le median d ensoleillement", () => {
  const google = normalizeBuildingInsights({
    center: { latitude: 48.18, longitude: 6.94 },
    imageryDate: { year: 2012, month: 7, day: 12 },
    solarPotential: {
      maxSunshineHoursPerYear: 1100,
      roofSegmentStats: [{
        pitchDegrees: 27,
        azimuthDegrees: 160,
        center: { latitude: 48.18, longitude: 6.94 },
        stats: { areaMeters2: 22, sunshineQuantiles: [1, 2, 3, 4, 5, 900, 7, 8, 9, 10, 11] },
      }],
      solarPanels: [{ center: { latitude: 48.18, longitude: 6.94 }, segmentIndex: 0 }],
    },
  });
  assert.equal(google.roofSegments[0].sunshineMedian, 900);
  assert.equal(google.solarPanels.length, 1);
  assert.equal(google.imageryDate.year, 2012);
});

test("un PNG RGBA encode une signature PNG", () => {
  const png = encodeRgbaPng(1, 1, new Uint8Array([255, 128, 0, 255]));
  assert.match(png, /^data:image\/png;base64,/);
  const raw = Buffer.from(png.split(",")[1], "base64");
  assert.deepEqual([...raw.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test("un GeoTIFF de flux devient une carte de chaleur persistable", async () => {
  const tiff = writeArrayBuffer([20, 80, 160, 240], { width: 2, height: 2 });
  const png = await fluxTiffToPng(tiff);
  assert.match(png, /^data:image\/png;base64,/);
  assert.ok(png.length > 80);
});

test("un GeoTIFF RGB devient une photo de toiture", async () => {
  const tiff = writeArrayBuffer([
    [[10, 40], [80, 200]],
    [[20, 50], [90, 210]],
    [[30, 60], [100, 220]],
  ], { width: 2, height: 2 });
  const png = await rgbTiffToPng(tiff);
  assert.match(png, /^data:image\/png;base64,/);
});

test("l etude complete conserve la carte de flux", () => {
  const project = {
    completeStudy: emptyCompleteStudy({ fluxPng: "data:image/png;base64,xx", rgbPng: "data:image/png;base64,yy" }),
  };
  const stored = completeStudyFromProject(project);
  assert.equal(stored.fluxPng, "data:image/png;base64,xx");
  assert.equal(stored.rgbPng, "data:image/png;base64,yy");
});
