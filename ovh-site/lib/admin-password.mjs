/**
 * Génération / persistance du mot de passe admin (hash scrypt + fichier .env).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, randomInt } from "node:crypto";
import { hashPassword } from "./admin-auth.mjs";

const MIN_LEN = 12;

export function generateAdminPassword(length = 16) {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*?";
  const chars = [];
  for (let i = 0; i < length; i += 1) {
    chars.push(alphabet[randomInt(alphabet.length)]);
  }
  // Garantir diversité minimale
  chars[0] = "ABCDEFGHJKLMNPQRSTUVWXYZ"[randomInt(24)];
  chars[1] = "abcdefghijkmnopqrstuvwxyz"[randomInt(24)];
  chars[2] = "23456789"[randomInt(8)];
  chars[3] = "!@#$%*?"[randomInt(7)];
  // mélange
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function validateNewPassword(password) {
  const pwd = String(password || "");
  if (pwd.length < MIN_LEN) {
    return { ok: false, error: `Le mot de passe doit faire au moins ${MIN_LEN} caractères.` };
  }
  if (pwd.length > 128) {
    return { ok: false, error: "Mot de passe trop long." };
  }
  return { ok: true };
}

/**
 * Met à jour process.env + le fichier .env sur disque (ADMIN_PASSWORD_HASH).
 * @param {string} rootDir
 * @param {string} plainPassword
 */
export async function persistAdminPassword(rootDir, plainPassword) {
  const check = validateNewPassword(plainPassword);
  if (!check.ok) throw new Error(check.error);
  const hash = hashPassword(plainPassword);
  process.env.ADMIN_PASSWORD_HASH = hash;

  const envPath = path.join(rootDir, ".env");
  let raw = "";
  try {
    raw = await fs.readFile(envPath, "utf8");
  } catch {
    raw = "";
  }
  const lines = raw ? raw.split("\n") : [];
  let found = false;
  const next = lines.map((line) => {
    if (line.startsWith("ADMIN_PASSWORD_HASH=")) {
      found = true;
      return `ADMIN_PASSWORD_HASH=${hash}`;
    }
    return line;
  });
  if (!found) next.push(`ADMIN_PASSWORD_HASH=${hash}`);
  // Ne jamais écrire le mot de passe en clair dans .env
  const cleaned = next.filter((line) => !line.startsWith("ADMIN_PASSWORD_PLAINTEXT_HINT="));
  await fs.writeFile(envPath, `${cleaned.join("\n").replace(/\n*$/, "\n")}`, "utf8");
  try {
    await fs.chmod(envPath, 0o600);
  } catch {
    /* ignore */
  }
  return hash;
}
