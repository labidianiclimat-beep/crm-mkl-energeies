import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { emptySaleBook } from "./commercial-sale.js";

export function saleStoragePaths(root = path.join(process.cwd(), ".local")) {
  const directory = path.resolve(root);
  return {
    directory,
    bookPath: path.join(directory, "commercial-sales.json"),
    pdfDirectory: path.join(directory, "devis-signatures"),
  };
}

export async function readSaleBook(root) {
  try {
    const raw = await readFile(saleStoragePaths(root).bookPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      sales: Array.isArray(parsed.sales) ? parsed.sales : [],
      journal: Array.isArray(parsed.journal) ? parsed.journal : [],
    };
  } catch {
    return emptySaleBook();
  }
}

export async function writeSaleBook(book, root) {
  const paths = saleStoragePaths(root);
  await mkdir(paths.directory, { recursive: true });
  await writeFile(paths.bookPath, JSON.stringify({ sales: book.sales || [], journal: book.journal || [] }));
  return book;
}

export async function saveSalePdf(digest, bytes, root) {
  const paths = saleStoragePaths(root);
  const name = `${String(digest || "").replace(/[^a-f0-9]/gi, "")}.pdf`;
  if (!name || name === ".pdf") throw new Error("Justificatif illisible.");
  await mkdir(paths.pdfDirectory, { recursive: true });
  const file = path.resolve(paths.pdfDirectory, name);
  const relative = path.relative(paths.pdfDirectory, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Justificatif illisible.");
  await writeFile(file, bytes);
  return file;
}

export async function readSalePdf(digest, root) {
  const paths = saleStoragePaths(root);
  const name = `${String(digest || "").replace(/[^a-f0-9]/gi, "")}.pdf`;
  const file = path.resolve(paths.pdfDirectory, name);
  const relative = path.relative(paths.pdfDirectory, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  try {
    return await readFile(file);
  } catch {
    return null;
  }
}
