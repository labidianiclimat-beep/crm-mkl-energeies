import fs from "node:fs/promises";
import path from "node:path";

const tails = new Map();
const depths = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function lockFile(directory) {
  return path.join(directory, ".store.lock");
}

async function acquireFileLock(lockPath) {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  const started = Date.now();
  for (;;) {
    try {
      const handle = await fs.open(lockPath, "wx");
      await handle.writeFile(`${process.pid}\n${Date.now()}\n`);
      return handle;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        const stat = await fs.stat(lockPath);
        if (Date.now() - stat.mtimeMs > 15000) await fs.unlink(lockPath);
      } catch {
        /* le verrou a déjà disparu */
      }
      if (Date.now() - started > 20000) {
        throw new Error("Verrou de stockage occupé.");
      }
      await sleep(15);
    }
  }
}

/** Lit une liste JSON. Un fichier illisible n’est pas remplacé par une liste vide. */
export async function readJsonArray(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) {
      const error = new Error("Le fichier de stockage n’est pas une liste.");
      error.code = "INVALID_JSON_ARRAY";
      throw error;
    }
    return data;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function atomicWriteJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
  );
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tmp, filePath);
}

/**
 * Sérialise les lectures-modifications-écritures d’un même dossier.
 * Réentrant pour écrire deux fichiers dans la même opération.
 */
export function withStoreLock(directory, fn) {
  const key = lockFile(directory);
  if ((depths.get(key) || 0) > 0) {
    depths.set(key, depths.get(key) + 1);
    return Promise.resolve()
      .then(() => fn())
      .finally(() => {
        depths.set(key, (depths.get(key) || 1) - 1);
      });
  }

  const previous = tails.get(key) || Promise.resolve();
  const run = previous.then(async () => {
    const handle = await acquireFileLock(key);
    depths.set(key, 1);
    try {
      return await fn();
    } finally {
      depths.set(key, 0);
      await handle.close().catch(() => {});
      await fs.unlink(key).catch(() => {});
    }
  });
  tails.set(
    key,
    run.then(
      () => undefined,
      () => undefined
    )
  );
  return run;
}
