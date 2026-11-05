import fs from "node:fs/promises";
import path from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
  ".gif": "image/gif",
};

const PUBLIC_DATA = new Set([
  "/data/covers.json",
  "/data/category-covers.json",
  "/data/slots.js",
  "/data/realisations.js",
]);

const PUBLIC_LIB = new Set([
  "/lib/conversion-datalayer.mjs",
  "/lib/form-legal-copy.mjs",
  "/lib/attribution-capture.mjs",
]);

function notFound(res) {
  res.writeHead(404, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end("Not found");
}

/** Décide si une URL publique doit être refusée, sans lire le fichier. */
export function isDeniedPublicPath(urlPath) {
  let decoded = String(urlPath || "/");
  const hash = decoded.indexOf("#");
  if (hash >= 0) decoded = decoded.slice(0, hash);
  const query = decoded.indexOf("?");
  if (query >= 0) decoded = decoded.slice(0, query);
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    return true;
  }
  if (decoded.includes("\0")) return true;
  let normalized = path.posix.normalize(decoded.startsWith("/") ? decoded : `/${decoded}`);
  if (!normalized.startsWith("/")) normalized = `/${normalized}`;
  if (normalized === "/") return false;
  const lower = normalized.toLowerCase();
  const base = path.posix.basename(lower);
  if (!base || base.startsWith(".")) return true;
  if (
    base.endsWith(".lock") ||
    base.endsWith(".tmp") ||
    base.endsWith(".bak") ||
    base.endsWith("~")
  ) {
    return true;
  }
  if (base === "server.mjs" || base.startsWith("server.mjs.")) return true;
  if (base === "package.json" || base === "package-lock.json") return true;
  if (lower === "/deploy" || lower.startsWith("/deploy/")) return true;
  if (lower === "/node_modules" || lower.startsWith("/node_modules/")) return true;
  if (lower === "/tests" || lower.startsWith("/tests/")) return true;
  if (lower === "/lib" || lower.startsWith("/lib/")) return !PUBLIC_LIB.has(lower);
  if (lower === "/data" || lower.startsWith("/data/")) return !PUBLIC_DATA.has(lower);
  return false;
}

export async function servePublicFile(req, res, root) {
  const requestPath = String(req.url || "/").split("?")[0];
  if (isDeniedPublicPath(requestPath)) {
    notFound(res);
    return;
  }

  let decoded = requestPath;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    notFound(res);
    return;
  }
  const cleaned = decoded === "/" ? "/index.html" : decoded;
  const rootResolved = path.resolve(root);
  const full = path.resolve(rootResolved, `.${cleaned}`);
  if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end("Forbidden");
    return;
  }
  const relative = `/${path.relative(rootResolved, full).split(path.sep).join("/")}`;
  if (relative !== "/" && isDeniedPublicPath(relative)) {
    notFound(res);
    return;
  }

  try {
    let statPath = full;
    let stat = await fs.stat(statPath).catch(() => null);
    if (stat?.isDirectory()) {
      statPath = path.join(statPath, "index.html");
      stat = await fs.stat(statPath);
    }
    if (!stat || !stat.isFile()) {
      notFound(res);
      return;
    }
    const ext = path.extname(statPath).toLowerCase();
    const data = await fs.readFile(statPath);
    let cacheControl = "no-cache";
    if (ext === ".json") cacheControl = "no-store";
    else if ([".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico", ".woff2", ".gif", ".pdf"].includes(ext)) {
      cacheControl = "public, max-age=31536000, immutable";
    } else if ([".css", ".js", ".mjs"].includes(ext)) {
      cacheControl = "public, max-age=86400";
    } else if (ext === ".html") {
      cacheControl = "no-cache";
    }
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": cacheControl,
    });
    if (req.method === "HEAD") res.end();
    else res.end(data);
  } catch {
    notFound(res);
  }
}
