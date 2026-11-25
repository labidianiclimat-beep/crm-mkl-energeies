import assert from "node:assert/strict";
import net from "node:net";
import { spawn } from "node:child_process";
import test from "node:test";

/**
 * Le 7 novembre 2026 à 23 h 55, une seule requête `GET //` a tué le serveur de
 * production. `//` est une URL relative au protocole, donc une URL sans hôte :
 * `new URL("//", base)` lève, et rien n'entourait le gestionnaire. systemd a
 * relancé le processus en six secondes, mais le site a répondu 502 pendant tout
 * ce temps, et n'importe qui pouvait recommencer.
 *
 * Cet essai ne se contente pas de lire le code : il envoie la requête brute sur
 * une socket, parce que `fetch` normalise `//` et ne pourrait donc pas la
 * reproduire. Et il vérifie les deux choses qui comptent — la réponse refuse,
 * et le serveur est encore là pour répondre à la suivante.
 */

const serverUrl = new URL("../server.mjs", import.meta.url);
const PORT = 47317;

function demanderBrut(port, cible) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1", () => {
      socket.write(`GET ${cible} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
    });
    let recu = "";
    socket.setTimeout(5000, () => socket.destroy(new Error("délai dépassé")));
    socket.on("data", (c) => { recu += c.toString("utf8"); });
    socket.on("end", () => resolve(recu));
    socket.on("error", reject);
  });
}

async function attendreEcoute(port, limiteMs = 10000) {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) {
    const ouvert = await new Promise((resolve) => {
      const s = net.connect(port, "127.0.0.1", () => { s.end(); resolve(true); });
      s.on("error", () => resolve(false));
    });
    if (ouvert) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

test("une cible de requête illisible est refusée, et le serveur survit", async (t) => {
  const enfant = spawn(process.execPath, [serverUrl.pathname], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let erreurs = "";
  enfant.stderr.on("data", (c) => { erreurs += c.toString("utf8"); });
  t.after(() => { enfant.kill("SIGKILL"); });

  assert.ok(await attendreEcoute(PORT), `le serveur n'écoute pas — ${erreurs}`);

  const reponse = await demanderBrut(PORT, "//");
  assert.match(reponse, /^HTTP\/1\.1 400 /, `réponse inattendue : ${reponse.split("\r\n")[0]}`);

  // Le point essentiel : le processus n'est pas mort, et une requête normale
  // passe encore. Sans le filet, c'est ici que l'essai échouait.
  assert.equal(enfant.exitCode, null, "le serveur est mort sur une requête malformée");
  const apres = await demanderBrut(PORT, "/");
  assert.match(apres, /^HTTP\/1\.1 \d\d\d /);
});

test("le gestionnaire est entouré d'un filet, et la cible est lue sous garde", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(serverUrl, "utf8");
  assert.match(source, /handleRequest\(req, res\)\.catch\(/);
  assert.match(source, /url = new URL\(req\.url \|\| "\/"/);
  // Le journal d'erreur ne doit pas recracher la requête : ni corps, ni
  // en-têtes, ni cookies.
  assert.equal(source.includes("req.headers)"), false);
});
