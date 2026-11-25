import { requireApiSession } from "../../../lib/api-auth";
import {
  buildUrbanismeRecord,
  parseCadastreFeature,
  parseZoneUrbaFeature,
  pointGeom,
} from "../../../lib/pv-urbanisme";

export const runtime = "nodejs";

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

export async function GET(request) {
  try {
    const auth = await requireApiSession(request, { module: "Photovoltaïque administratif" });
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

    const geom = encodeURIComponent(pointGeom(lon, lat));
    const [cadastrePayload, zonePayload] = await Promise.all([
      fetchJson(`https://apicarto.ign.fr/api/cadastre/parcelle?geom=${geom}&_limit=1`),
      fetchJson(`https://apicarto.ign.fr/api/gpu/zone-urba?geom=${geom}&_limit=1`),
    ]);

    const cadastre = parseCadastreFeature(cadastrePayload);
    const zone = parseZoneUrbaFeature(zonePayload);
    const urbanisme = buildUrbanismeRecord({ lat, lon, cadastre, zone });
    if (!urbanisme) {
      return Response.json({ error: "Parcelle introuvable à cette adresse." }, { status: 404 });
    }

    return Response.json({
      urbanisme,
      found: Boolean(cadastre || zone),
    });
  } catch (error) {
    console.error("PV urbanisme error", error.message);
    return Response.json({ error: "Consultation cadastre impossible pour le moment." }, { status: 502 });
  }
}
