import { requireApiSession } from "../../../lib/api-auth";
import { loadGoogleSolarSite } from "../../../lib/google-solar-layers";
import { canCreateCompletePvStudy } from "../../../lib/pv-study-kinds";
import {
  compassToPvgisAspect,
  estimateYieldFallback,
  extractPvgisMonthlyKwhPerKwp,
  extractPvgisTypicalDays,
  extractPvgisYearlyKwhPerKwp,
  ignOrthoUrl,
  ignOrthoWms,
  typicalDaysMonthlyKwhPerKwp,
} from "../../../lib/pv-geo";

export const runtime = "nodejs";

async function fetchPvgisPlane(lat, lon, angle, aspect) {
  const url =
    `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lon)}&peakpower=1&loss=14` +
    `&angle=${encodeURIComponent(angle)}&aspect=${encodeURIComponent(aspect)}&outputformat=json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("PVGIS indisponible");
  return response.json();
}

async function fetchPvgisHourly(lat, lon, angle, aspect) {
  const url =
    `https://re.jrc.ec.europa.eu/api/v5_2/seriescalc?lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lon)}&startyear=2019&endyear=2019` +
    `&pvcalculation=1&peakpower=1&loss=14` +
    `&angle=${encodeURIComponent(angle)}&aspect=${encodeURIComponent(aspect)}&outputformat=json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error("PVGIS horaire indisponible");
  return response.json();
}

export async function POST(request) {
  try {
    const auth = await requireApiSession(request, { module: "Photovoltaïque administratif" });
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!canCreateCompletePvStudy(auth.profile)) {
      return Response.json({ error: "Étude d’installation réservée au responsable technique." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const lat = Number(body.lat);
    const lon = Number(body.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return Response.json({ error: "Coordonnées invalides." }, { status: 400 });
    }
    if (lat < 41 || lat > 52 || lon < -6 || lon > 10) {
      return Response.json({ error: "Coordonnées hors France métropolitaine." }, { status: 400 });
    }

    const planes = Array.isArray(body.planes) && body.planes.length ? body.planes : [{ compass: 180, tilt: 30 }];
    const reuse = body.reuseLayers && typeof body.reuseLayers === "object" ? body.reuseLayers : {};
    const solar = await loadGoogleSolarSite(lat, lon, {
      panelPower: Number(planes[0]?.panelPower || 500),
      reuse,
    }).catch(() => ({
      google: null,
      googleError: process.env.GOOGLE_SOLAR_API_KEY
        ? "Google Solar n’a pas répondu pour cette adresse."
        : "Licence Google Solar non configurée — productible horaire PVGIS.",
      fluxPng: reuse.fluxPng || "",
      rgbPng: reuse.rgbPng || "",
      suggestedPlanes: [],
    }));
    const google = solar.google;
    if (body.layersOnly) {
      const mapCenter = Number.isFinite(google?.center?.lat) && Number.isFinite(google?.center?.lon)
        ? google.center
        : { lat, lon };
      return Response.json({
        lat,
        lon,
        ortho: ignOrthoWms(mapCenter.lon, mapCenter.lat),
        orthoUrl: ignOrthoUrl(mapCenter.lon, mapCenter.lat),
        solarProvider: google ? "google" : "pvgis",
        google,
        googleError: solar.googleError || "",
        fluxPng: solar.fluxPng || "",
        rgbPng: solar.rgbPng || "",
        suggestedPlanes: solar.suggestedPlanes || [],
        planes: [],
      });
    }

    const nextPlanes = await Promise.all(planes.slice(0, 4).map(async plane => {
      const tilt = Number(plane.tilt || 30);
      const aspect = compassToPvgisAspect(plane.compass);
      let yieldValue = estimateYieldFallback(lat);
      let monthly = null;
      let typicalDays = null;
      let source = "fallback";
      const [calc, hourly] = await Promise.allSettled([
        fetchPvgisPlane(lat, lon, tilt, aspect),
        fetchPvgisHourly(lat, lon, tilt, aspect),
      ]);
      if (hourly.status === "fulfilled") {
        typicalDays = extractPvgisTypicalDays(hourly.value);
        const fromHours = typicalDaysMonthlyKwhPerKwp(typicalDays);
        if (fromHours) {
          monthly = fromHours;
          yieldValue = fromHours.reduce((sum, value) => sum + value, 0);
          source = "pvgis-hourly";
        }
      }
      if (calc.status === "fulfilled") {
        const yearly = extractPvgisYearlyKwhPerKwp(calc.value);
        if (!monthly) monthly = extractPvgisMonthlyKwhPerKwp(calc.value);
        if (yearly && source === "fallback") {
          yieldValue = yearly;
          source = "pvgis";
        }
      }
      return {
        ...plane,
        tilt,
        compass: Number(plane.compass || 180),
        aspect,
        yieldValue,
        monthly,
        typicalDays,
        source,
      };
    }));

    const mapCenter = Number.isFinite(google?.center?.lat) && Number.isFinite(google?.center?.lon)
      ? google.center
      : { lat, lon };
    const ortho = ignOrthoWms(mapCenter.lon, mapCenter.lat);
    return Response.json({
      lat,
      lon,
      ortho,
      orthoUrl: ignOrthoUrl(mapCenter.lon, mapCenter.lat),
      solarProvider: google?.provider || (nextPlanes.some(plane => plane.typicalDays) ? "pvgis-hourly" : "pvgis"),
      google,
      googleError: solar.googleError || "",
      fluxPng: solar.fluxPng || "",
      rgbPng: solar.rgbPng || "",
      suggestedPlanes: solar.suggestedPlanes || [],
      planes: nextPlanes,
    });
  } catch (error) {
    console.error("PV install yield error", error.message);
    return Response.json({ error: "Calcul d’installation impossible." }, { status: 502 });
  }
}
