import { inflateRawSync } from "zlib";

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;

export function unzipBuffers(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const files = {};
  let offset = 0;
  while (offset + 30 <= buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig === CENTRAL_SIG) break;
    if (sig !== LOCAL_SIG) {
      offset += 1;
      continue;
    }
    const flags = buf.readUInt16LE(offset + 6);
    const method = buf.readUInt16LE(offset + 8);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.slice(offset + 30, offset + 30 + nameLen).toString("utf8");
    let dataStart = offset + 30 + nameLen + extraLen;
    let compSize = buf.readUInt32LE(offset + 18);
    if (flags & 0x8) {
      const dataDesc = buf.indexOf(Buffer.from([0x50, 0x4b, 0x07, 0x08]), dataStart);
      if (dataDesc < 0) break;
      compSize = buf.readUInt32LE(dataDesc + 8);
      const compressed = buf.slice(dataStart, dataStart + compSize);
      files[name] = method === 0 ? compressed : inflateRawSync(compressed);
      offset = dataDesc + 16;
      continue;
    }
    const compressed = buf.slice(dataStart, dataStart + compSize);
    files[name] = method === 0 ? compressed : inflateRawSync(compressed);
    offset = dataStart + compSize;
  }
  return files;
}

function xmlLocalName(tag) {
  return String(tag || "").replace(/^.*:/, "");
}

function parseXmlElements(xml, tag) {
  const out = [];
  const re = new RegExp(`<(?:[A-Za-z0-9]+:)?${tag}\\b([^>]*)(?:/>|>([\\s\\S]*?)</(?:[A-Za-z0-9]+:)?${tag}>)`, "g");
  let match;
  while ((match = re.exec(xml))) out.push({ attrs: match[1] || "", body: match[2] || "" });
  return out;
}

function attr(attrs, name) {
  const match = String(attrs || "").match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? match[1] : "";
}

function cellRef(ref) {
  const match = String(ref || "").match(/^([A-Z]+)(\d+)$/i);
  if (!match) return { col: 0, row: 0 };
  const letters = match[1].toUpperCase();
  let col = 0;
  for (const ch of letters) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col, row: Number(match[2]) };
}

function sharedStrings(xml) {
  const items = [];
  const sis = xml.split(/<(?:[A-Za-z0-9]+:)?si\b/).slice(1);
  for (const chunk of sis) {
    const texts = [];
    const re = /<(?:[A-Za-z0-9]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9]+:)?t>/g;
    let match;
    while ((match = re.exec(chunk))) texts.push(decodeXml(match[1]));
    items.push(texts.join(""));
  }
  return items;
}

function decodeXml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function sheetRows(xml, strings) {
  const rows = new Map();
  const data = String(xml || "").split(/<sheetData\b[^>]*>/)[1]?.split("</sheetData>")[0] || "";
  const parts = data.split(/<c /);
  for (const part of parts.slice(1)) {
    const self = part.match(/^([^>]*?)\/>/);
    const paired = self ? null : part.match(/^([^>]*)>([\s\S]*?)<\/c>/);
    const attrs = (self || paired)?.[1] || "";
    const body = paired?.[2] || "";
    const ref = attr(attrs, "r");
    const type = attr(attrs, "t");
    const { col, row } = cellRef(ref);
    if (!row || !col) continue;
    let value = "";
    if (type === "inlineStr") {
      const t = body.match(/<(?:[A-Za-z0-9]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9]+:)?t>/);
      value = decodeXml(t?.[1] || "");
    } else {
      const v = body.match(/<(?:[A-Za-z0-9]+:)?v\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9]+:)?v>/);
      const rawValue = decodeXml(v?.[1] || "");
      if (type === "s" && rawValue !== "") value = strings[Number(rawValue)] || "";
      else value = rawValue;
    }
    if (!rows.has(row)) rows.set(row, {});
    rows.get(row)[col] = value;
  }
  const ordered = [...rows.keys()].sort((a, b) => a - b);
  return ordered.map(row => {
    const cells = rows.get(row) || {};
    const maxCol = Math.max(0, ...Object.keys(cells).map(Number));
    return Array.from({ length: maxCol }, (_, index) => String(cells[index + 1] || "").trim());
  });
}

function workbookSheets(files) {
  const wb = files["xl/workbook.xml"]?.toString("utf8") || "";
  const rels = files["xl/_rels/workbook.xml.rels"]?.toString("utf8") || "";
  const relMap = {};
  for (const item of parseXmlElements(rels, "Relationship")) {
    relMap[attr(item.attrs, "Id")] = attr(item.attrs, "Target");
  }
  const sheets = [];
  const re = /<(?:[A-Za-z0-9]+:)?sheet\b([^>]*)\/>/g;
  let match;
  while ((match = re.exec(wb))) {
    const name = attr(match[1], "name");
    const rid = attr(match[1], "r:id") || attr(match[1], "id");
    let target = relMap[rid] || "";
    if (target.startsWith("/")) target = target.replace(/^\//, "");
    else if (!target.startsWith("xl/")) target = `xl/${target.replace(/^\//, "")}`;
    sheets.push({ name, path: target });
  }
  return sheets;
}

export function parseXlsxBuffer(buffer) {
  const files = unzipBuffers(buffer);
  const strings = files["xl/sharedStrings.xml"]
    ? sharedStrings(files["xl/sharedStrings.xml"].toString("utf8"))
    : [];
  const sheets = workbookSheets(files).map(sheet => ({
    name: sheet.name,
    rows: sheetRows(files[sheet.path]?.toString("utf8") || "", strings),
  }));
  return { sheets };
}

void xmlLocalName;
