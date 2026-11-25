function text(value) {
  return String(value ?? "").trim();
}

function firstFeature(payload) {
  const list = Array.isArray(payload?.features) ? payload.features : [];
  return list[0] || null;
}

function propsOf(feature) {
  return feature && typeof feature.properties === "object" ? feature.properties : {};
}

export function pointGeom(lon, lat) {
  return JSON.stringify({ type: "Point", coordinates: [Number(lon), Number(lat)] });
}

export function geoportailCadastreUrl(lon, lat) {
  const x = Number(lon);
  const y = Number(lat);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return "";
  return `https://www.geoportail.gouv.fr/carte?c=${encodeURIComponent(x)},${encodeURIComponent(y)}&z=19&l0=ORTHOIMAGERY.ORTHOPHOTOS::GEOPORTAIL:OGC:WMTS(1)&l1=CADASTRALPARCELS.PARCELLAIRE_EXPRESS::GEOPORTAIL:OGC:WMTS(0.8)&permalink=yes`;
}

export function parseCadastreFeature(payload) {
  const feature = firstFeature(payload);
  if (!feature) return null;
  const props = propsOf(feature);
  const section = text(props.section);
  const numero = text(props.numero || props.ndeb);
  if (!section && !numero) return null;
  return {
    commune: text(props.nom_com || props.nomcom || props.commune_name),
    insee: text(props.code_insee || props.insee || props.commune),
    department: text(props.code_dep || props.dep),
    prefixe: text(props.prefixe || props.com_abs || props.feuille || "000"),
    section,
    numero,
    contenance: Number(props.contenance || props.contenance_m2 || 0) || null,
  };
}

export function parseZoneUrbaFeature(payload) {
  const feature = firstFeature(payload);
  if (!feature) return null;
  const props = propsOf(feature);
  const label = text(props.libelle || props.libelong || props.typezone || props.nomfic);
  if (!label) return null;
  return {
    zoneLabel: text(props.libelle) || label,
    zoneDetail: text(props.libelong || props.destdomi || props.typezone),
    zoneType: text(props.typezone),
  };
}

export function buildUrbanismeRecord({ lat, lon, cadastre, zone } = {}) {
  const x = Number(lon);
  const y = Number(lat);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    fetchedAt: new Date().toISOString(),
    lat: y,
    lon: x,
    commune: text(cadastre?.commune),
    insee: text(cadastre?.insee),
    department: text(cadastre?.department),
    prefixe: text(cadastre?.prefixe),
    section: text(cadastre?.section),
    numero: text(cadastre?.numero),
    contenance: cadastre?.contenance || null,
    zoneLabel: text(zone?.zoneLabel),
    zoneDetail: text(zone?.zoneDetail),
    zoneType: text(zone?.zoneType),
    geoportailUrl: geoportailCadastreUrl(x, y),
  };
}
