import { requireApiSession } from "../../../lib/api-auth";
import { extractPvgisYearlyKwhPerKwp, estimateYieldFallback } from "../../../lib/pv-geo";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    // Sans session, ce proxy laisse n'importe qui consommer le quota PVGIS
    // au nom du domaine.
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const url = new URL(request.url);
    const lat = Number(url.searchParams.get("lat"));
    const lon = Number(url.searchParams.get("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return Response.json({ error: "Coordonnées invalides." }, { status: 400 });
    }
    if (lat < 41 || lat > 52 || lon < -6 || lon > 10) {
      return Response.json({ error: "Coordonnées hors France métropolitaine." }, { status: 400 });
    }

    const angle = Number(url.searchParams.get("angle") || 35);
    const aspect = Number(url.searchParams.get("aspect") || 0); // 0 = sud
    const pvgisUrl =
      `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?lat=${encodeURIComponent(lat)}` +
      `&lon=${encodeURIComponent(lon)}&peakpower=1&loss=14` +
      `&angle=${encodeURIComponent(angle)}&aspect=${encodeURIComponent(aspect)}&outputformat=json`;

    let yieldValue = null;
    let source = "fallback";
    try {
      const response = await fetch(pvgisUrl, { signal: AbortSignal.timeout(12000) });
      if (response.ok) {
        const payload = await response.json();
        yieldValue = extractPvgisYearlyKwhPerKwp(payload);
        if (yieldValue) source = "pvgis";
      }
    } catch {
      // fallback below
    }

    if (!yieldValue) {
      yieldValue = estimateYieldFallback(lat);
      source = "fallback";
    }

    return Response.json({
      yieldValue,
      source,
      lat,
      lon,
      angle,
      aspect,
      unit: "kWh/kWc/an",
    });
  } catch (error) {
    console.error("PV yield error", error.message);
    return Response.json({ error: "Calcul productible impossible." }, { status: 502 });
  }
}
