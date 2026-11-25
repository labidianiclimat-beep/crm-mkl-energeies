import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function tokenKeyMaterial() {
  return [...new Set(
    [process.env.CRM_SESSION_SECRET, process.env.ACTIVATION_PIN_PEPPER, "mkl-agenda"]
      .map(value => String(value || "").trim())
      .filter(Boolean)
  )];
}

function tokenSecret() {
  return createHash("sha256").update(tokenKeyMaterial()[0]).digest();
}

export function encryptSecret(plain) {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptSecret(payload) {
  if (!payload || !String(payload).includes(".")) return "";
  const [ivB64, tagB64, dataB64] = String(payload).split(".");
  if (!ivB64 || !tagB64 || !dataB64) return "";
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  for (const material of tokenKeyMaterial()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(material).digest(), iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    } catch {}
  }
  throw new Error("La connexion Google n’est plus lisible. Déconnecte le compte, puis reconnecte-le.");
}
