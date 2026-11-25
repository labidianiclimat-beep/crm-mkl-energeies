function asBuffer(bytes) {
  return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
}

function ascii(text) {
  return Buffer.from(text, "latin1");
}

export function inspectJpeg(bytes) {
  const data = asBuffer(bytes);
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
    throw new Error("JPEG invalide.");
  }

  let offset = 2;
  while (offset < data.length - 8) {
    if (data[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = data[offset + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height = data.readUInt16BE(offset + 5);
      const width = data.readUInt16BE(offset + 7);
      const components = data[offset + 9] || 3;
      if (!width || !height) throw new Error("JPEG invalide.");
      return { width, height, components };
    }
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = data.readUInt16BE(offset + 2);
    if (length < 2) throw new Error("JPEG invalide.");
    offset += 2 + length;
  }

  throw new Error("JPEG invalide.");
}

function colorSpace(components) {
  if (components === 1) return "/DeviceGray";
  if (components === 4) return "/DeviceCMYK";
  return "/DeviceRGB";
}

const A4_PORTRAIT = { width: 595.28, height: 841.89 };
const A4_LANDSCAPE = { width: 841.89, height: 595.28 };
const MARGIN = 28;

function pageBox(width, height) {
  return width > height ? A4_LANDSCAPE : A4_PORTRAIT;
}

function imagePlacement(imgW, imgH, page) {
  const maxW = page.width - MARGIN * 2;
  const maxH = page.height - MARGIN * 2;
  const scale = Math.min(maxW / imgW, maxH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return {
    w,
    h,
    x: (page.width - w) / 2,
    y: (page.height - h) / 2,
  };
}

function formatNum(value) {
  return Number(value.toFixed(2)).toString();
}

export function jpegPagesToPdf(jpegs) {
  if (!jpegs?.length) throw new Error("Ajoutez au moins une photo.");

  const pages = jpegs.map(raw => {
    const bytes = asBuffer(raw);
    return { bytes, ...inspectJpeg(bytes) };
  });

  const catalogId = 1;
  const pagesId = 2;
  let nextId = 3;
  const pageRefs = [];
  const objects = [];

  for (const page of pages) {
    const box = pageBox(page.width, page.height);
    const place = imagePlacement(page.width, page.height, box);
    const content = `q\n${formatNum(place.w)} 0 0 ${formatNum(place.h)} ${formatNum(place.x)} ${formatNum(place.y)} cm\n/Im0 Do\nQ\n`;
    const contentBytes = Buffer.from(content, "ascii");
    const pageId = nextId;
    nextId += 1;
    const contentId = nextId;
    nextId += 1;
    const imageId = nextId;
    nextId += 1;
    pageRefs.push(pageId);

    objects.push({
      id: pageId,
      body: ascii(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${formatNum(box.width)} ${formatNum(box.height)}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`
      ),
    });
    objects.push({
      id: contentId,
      body: Buffer.concat([
        ascii(`<< /Length ${contentBytes.length} >>\nstream\n`),
        contentBytes,
        ascii("endstream"),
      ]),
    });
    objects.push({
      id: imageId,
      body: Buffer.concat([
        ascii(
          `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace ${colorSpace(page.components)} /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`
        ),
        page.bytes,
        ascii("\nendstream"),
      ]),
    });
  }

  objects.unshift({
    id: pagesId,
    body: ascii(`<< /Type /Pages /Kids [${pageRefs.map(id => `${id} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`),
  });
  objects.unshift({
    id: catalogId,
    body: ascii(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`),
  });
  objects.sort((left, right) => left.id - right.id);

  const chunks = [ascii("%PDF-1.4\n")];
  const offsets = [0];
  let cursor = chunks[0].length;

  for (const object of objects) {
    offsets[object.id] = cursor;
    const header = ascii(`${object.id} 0 obj\n`);
    const footer = ascii("\nendobj\n");
    chunks.push(header, object.body, footer);
    cursor += header.length + object.body.length + footer.length;
  }

  const maxId = objects[objects.length - 1].id;
  let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id += 1) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF\n`;
  chunks.push(ascii(xref));
  return Buffer.concat(chunks);
}

const DCT_LENGTH_MARKER = ascii("/Filter /DCTDecode /Length ");
const STREAM_MARKER = ascii("stream\n");

export function extractJpegsFromPdf(pdf) {
  const data = asBuffer(pdf);
  const jpegs = [];
  let offset = 0;
  while (offset < data.length) {
    const at = data.indexOf(DCT_LENGTH_MARKER, offset);
    if (at === -1) break;
    let cursor = at + DCT_LENGTH_MARKER.length;
    let lengthText = "";
    while (cursor < data.length && data[cursor] >= 48 && data[cursor] <= 57) {
      lengthText += String.fromCharCode(data[cursor]);
      cursor += 1;
    }
    const length = Number(lengthText);
    const streamAt = data.indexOf(STREAM_MARKER, at);
    if (!length || streamAt === -1) break;
    const start = streamAt + STREAM_MARKER.length;
    jpegs.push(Buffer.from(data.subarray(start, start + length)));
    offset = start + length;
  }
  if (!jpegs.length) throw new Error("PDF sans photo exploitable.");
  return jpegs;
}

export function mergeJpegPdfs(pdfs) {
  if (!pdfs?.length) throw new Error("Sélectionnez au moins un document.");
  return jpegPagesToPdf(pdfs.flatMap(pdf => extractJpegsFromPdf(pdf)));
}

function pdfHasPhotos(pdf) {
  try {
    extractJpegsFromPdf(pdf);
    return true;
  } catch {
    return false;
  }
}

/** Photos déjà en PDF image, ou fichiers PDF d’origine, réunis en un seul PDF. */
export async function mergeStoredPdfs(pdfs) {
  if (!pdfs?.length) throw new Error("Sélectionnez au moins un document.");
  if (pdfs.every(pdfHasPhotos)) return mergeJpegPdfs(pdfs);
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  for (const bytes of pdfs) {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const copied = await out.copyPages(src, src.getPageIndices());
    copied.forEach(page => out.addPage(page));
  }
  if (!out.getPageCount()) throw new Error("PDF sans page.");
  return Buffer.from(await out.save());
}
