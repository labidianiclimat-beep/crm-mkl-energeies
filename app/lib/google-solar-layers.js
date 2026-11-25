/** Couches Google Solar (GeoTIFF → PNG) — serveur uniquement. */

import { deflateSync } from "node:zlib";
import { fromArrayBuffer } from "geotiff";
import {
  colorizeFluxRgba,
  googleSegmentsToPlanes,
  normalizeBuildingInsights,
  radiusMetersFromBounds,
  rgbRastersToRgba,
  shouldTrustGoogleRoof,
  solarUrlWithKey,
} from "./google-solar.js";

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buffer) {
  let crc = ~0;
  for (let index = 0; index < buffer.length; index += 1) {
    crc ^= buffer[index];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (~crc) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([length, typeBuf, data, crc]);
}

export function encodeRgbaPng(width, height, rgba) {
  const pixels = Buffer.from(rgba);
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0;
    pixels.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    PNG_SIG,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 6 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

function asArrayBuffer(input) {
  if (input instanceof ArrayBuffer) return input;
  if (ArrayBuffer.isView(input)) {
    return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  }
  const node = Buffer.from(input);
  return node.buffer.slice(node.byteOffset, node.byteOffset + node.byteLength);
}

export async function geotiffToRasters(buffer, maxEdge = 480) {
  const tiff = await fromArrayBuffer(asArrayBuffer(buffer));
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const scale = Math.max(width, height) / maxEdge;
  const outW = scale > 1 ? Math.max(1, Math.round(width / scale)) : width;
  const outH = scale > 1 ? Math.max(1, Math.round(height / scale)) : height;
  const rasters = scale > 1
    ? await image.readRasters({ width: outW, height: outH, resampleMethod: "bilinear" })
    : await image.readRasters();
  return { rasters, width: outW, height: outH };
}

export async function fluxTiffToPng(buffer) {
  const { rasters, width, height } = await geotiffToRasters(buffer);
  return encodeRgbaPng(width, height, colorizeFluxRgba(rasters[0], width, height));
}

export async function rgbTiffToPng(buffer) {
  const { rasters, width, height } = await geotiffToRasters(buffer);
  return encodeRgbaPng(width, height, rgbRastersToRgba(rasters, width, height));
}

async function fetchGoogleBuildingInsights(lat, lon, key) {
  const url =
    `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${encodeURIComponent(lat)}` +
    `&location.longitude=${encodeURIComponent(lon)}&requiredQuality=BASE&key=${encodeURIComponent(key)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) return { error: "Google Solar n’a pas répondu pour cette adresse." };
  return normalizeBuildingInsights(await response.json());
}

async function fetchTiff(url, key) {
  const response = await fetch(solarUrlWithKey(url, key), { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error("couche Google Solar indisponible");
  return Buffer.from(await response.arrayBuffer());
}

export async function fetchGoogleSolarLayers({ lat, lon, bounds, key }) {
  if (!key) return { fluxPng: "", rgbPng: "", error: "Licence Google Solar non configurée." };
  const radius = radiusMetersFromBounds(bounds);
  const url =
    `https://solar.googleapis.com/v1/dataLayers:get?location.latitude=${encodeURIComponent(lat)}` +
    `&location.longitude=${encodeURIComponent(lon)}` +
    `&radiusMeters=${radius}&view=IMAGERY_AND_ANNUAL_FLUX_LAYERS` +
    `&requiredQuality=BASE&pixelSizeMeters=0.5&key=${encodeURIComponent(key)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) return { fluxPng: "", rgbPng: "", error: "Couches Google Solar indisponibles pour cette adresse." };
  const data = await response.json();
  const [flux, rgb] = await Promise.allSettled([
    data.annualFluxUrl ? fetchTiff(data.annualFluxUrl, key).then(fluxTiffToPng) : Promise.reject(new Error("sans flux")),
    data.rgbUrl ? fetchTiff(data.rgbUrl, key).then(rgbTiffToPng) : Promise.reject(new Error("sans rgb")),
  ]);
  return {
    fluxPng: flux.status === "fulfilled" ? flux.value : "",
    rgbPng: rgb.status === "fulfilled" ? rgb.value : "",
    imageryDate: data.imageryDate || null,
    error: flux.status === "rejected" && rgb.status === "rejected"
      ? "Images de toiture Google Solar illisibles."
      : "",
  };
}

export async function loadGoogleSolarSite(lat, lon, { panelPower = 500, reuse = {} } = {}) {
  const key = process.env.GOOGLE_SOLAR_API_KEY;
  if (!key && !reuse.google) {
    return {
      google: null,
      googleError: "Licence Google Solar non configurée — productible horaire PVGIS.",
      fluxPng: reuse.fluxPng || "",
      rgbPng: reuse.rgbPng || "",
      suggestedPlanes: [],
    };
  }

  const insights = reuse.google && !reuse.google.error
    ? reuse.google
    : key
      ? await fetchGoogleBuildingInsights(lat, lon, key)
      : null;
  if (!insights || insights.error) {
    return {
      google: null,
      googleError: insights?.error || "Google Solar n’a pas répondu pour cette adresse.",
      fluxPng: reuse.fluxPng || "",
      rgbPng: reuse.rgbPng || "",
      suggestedPlanes: [],
    };
  }

  const layers = reuse.fluxPng || reuse.rgbPng
    ? { fluxPng: reuse.fluxPng || "", rgbPng: reuse.rgbPng || "", error: "", imageryDate: reuse.google?.imageryDate || null }
    : await fetchGoogleSolarLayers({ lat, lon, bounds: insights.boundingBox, key });
  const google = {
    ...insights,
    imageryDate: insights.imageryDate || layers.imageryDate || null,
  };

  return {
    google,
    googleError: layers.error || "",
    fluxPng: layers.fluxPng || "",
    rgbPng: layers.rgbPng || "",
    suggestedPlanes: shouldTrustGoogleRoof(google, { lat, lon })
      ? googleSegmentsToPlanes(google, { panelPower })
      : [],
  };
}
