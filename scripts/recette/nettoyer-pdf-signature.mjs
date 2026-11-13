import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const text = readFileSync(`${process.env.HOME}/.mkl-secrets/recette-api.env`, "utf8");
const valeur = (name) => {
  const line = text.split(/\n/).find(item => item.startsWith(`${name}=`));
  if (!line) throw new Error(`coffre incomplet: ${name}`);
  return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
};
const url = valeur("MKL_RECETTE_URL");
const key = valeur("MKL_RECETTE_SERVICE_KEY");
if (new URL(url).host !== "xqbjfytrssslnsxxdrou.supabase.co" || url.includes("rzkwmwtjnwnmmcexwoov")) {
  console.error("Identité refusée.");
  process.exit(2);
}
const listed = spawnSync("bash", ["-lc", `
  set -euo pipefail
  . ./scripts/recette/cible.sh
  garde_cible >/dev/null
  q "select name from storage.objects where bucket_id = 'devis-signatures'"
`], { encoding: "utf8" });
if (listed.status !== 0) {
  console.error("lecture refusée");
  process.exit(1);
}
const names = listed.stdout.split(/\n/).map(item => item.trim()).filter(Boolean);
for (const name of names) {
  const response = await fetch(`${url}/storage/v1/object/devis-signatures/${name}`, {
    method: "DELETE",
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  console.log(response.ok ? "retire" : `echec ${response.status}`);
}
console.log("objets", names.length);
