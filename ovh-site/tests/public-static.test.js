import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { isDeniedPublicPath, servePublicFile } from "../lib/public-static.mjs";

const CANARY = "CANARY-DO-NOT-LEAK";

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function get(server, urlPath) {
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}${urlPath}`);
  const body = await response.text();
  return { status: response.status, body };
}

test("les fichiers sensibles sont refusés et les pages publiques restent lisibles", async () => {
  assert.equal(isDeniedPublicPath("/"), false);
  assert.equal(isDeniedPublicPath("/index.html"), false);
  assert.equal(isDeniedPublicPath("/app.js"), false);
  assert.equal(isDeniedPublicPath("/lib/conversion-datalayer.mjs"), false);
  assert.equal(isDeniedPublicPath("/lib/form-legal-copy.mjs"), false);
  assert.equal(isDeniedPublicPath("/data/realisations.js"), false);
  assert.equal(isDeniedPublicPath("/data/covers.json"), false);

  for (const secretPath of [
    "/.env",
    "/.env.local",
    "/%2eenv",
    "/server.mjs",
    "/package.json",
    "/package-lock.json",
    "/lib/admin-auth.mjs",
    "/lib/compliance-proof.mjs",
    "/data/leads.json",
    "/data/appointments.json",
    "/data/crm-outbox.json",
    "/data/google-reviews.json",
    "/data/consent-proofs.jsonl",
    "/data/proofs/abc.json",
    "/data/.store.lock",
    "/deploy/ovh/nginx.conf",
    "/deploy/ovh/deploy.sh",
    "/node_modules/sharp/package.json",
    "/../.env",
  ]) {
    assert.equal(isDeniedPublicPath(secretPath), true, secretPath);
  }

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mkl-static-"));
  await fs.writeFile(path.join(root, ".env"), `${CANARY}=1\n`);
  await fs.writeFile(path.join(root, "server.mjs"), `export const secret = "${CANARY}";\n`);
  await fs.mkdir(path.join(root, "data"), { recursive: true });
  await fs.writeFile(path.join(root, "data", "leads.json"), `[{"note":"${CANARY}"}]\n`);
  await fs.writeFile(path.join(root, "data", "appointments.json"), `[{"note":"${CANARY}"}]\n`);
  await fs.writeFile(path.join(root, "index.html"), "<p>site</p>\n");

  const server = await listen((req, res) => servePublicFile(req, res, root));
  try {
    for (const secretPath of ["/.env", "/server.mjs", "/data/leads.json", "/data/appointments.json", "/%2eenv"]) {
      const hidden = await get(server, secretPath);
      assert.equal(hidden.status, 404, secretPath);
      assert.equal(hidden.body, "Not found");
      assert.equal(hidden.body.includes(CANARY), false);
    }
    const home = await get(server, "/");
    assert.equal(home.status, 200);
    assert.equal(home.body.includes("site"), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  }
});
