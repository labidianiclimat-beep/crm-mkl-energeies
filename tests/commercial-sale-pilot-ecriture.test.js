import test, { after } from "node:test";
import assert from "node:assert/strict";

const productionUrl = "https://rzkwmwtjnwnmmcexwoov.supabase.co";
const pfalzgrafId = "b8230f67-2bc0-4a9b-b569-3f824c299b84";
const elOuariachiId = "f9562652-1ad4-40b5-9c55-318a83ef0476";
const devisId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const organizationId = "00000000-0000-0000-0000-000000000001";

const previous = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  mode: process.env.MKL_SIGNATURE_MODULE,
  commercial: process.env.MKL_SIGNATURE_PILOT_COMMERCIAL_ID,
  manager: process.env.MKL_SIGNATURE_PILOT_MANAGER_ID,
  vercel: process.env.VERCEL_ENV,
  productionRef: process.env.SUPABASE_PRODUCTION_REF,
  publishable: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};

delete process.env.VERCEL_ENV;
delete process.env.SUPABASE_PRODUCTION_REF;
delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
process.env.NEXT_PUBLIC_SUPABASE_URL = productionUrl;
process.env.SUPABASE_SERVICE_ROLE_KEY = "cle-simulee-locale";
process.env.MKL_SIGNATURE_MODULE = "pilote";
process.env.MKL_SIGNATURE_PILOT_COMMERCIAL_ID = pfalzgrafId;
process.env.MKL_SIGNATURE_PILOT_MANAGER_ID = elOuariachiId;

const calls = [];
let rpc = null;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const target = String(input?.url || input);
  const method = String(init.method || "GET").toUpperCase();
  if (!target.startsWith(`${productionUrl}/`)) throw new Error("connexion distante interdite");
  calls.push({ method, path: target.slice(productionUrl.length) });
  if (method === "POST" && target === `${productionUrl}/rest/v1/rpc/commit_devis_signature`) {
    rpc = JSON.parse(init.body);
    return new Response(JSON.stringify({ ok: true, simulated: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  throw new Error("connexion distante interdite");
};

after(() => {
  globalThis.fetch = originalFetch;
  const values = [
    ["NEXT_PUBLIC_SUPABASE_URL", previous.url],
    ["SUPABASE_SERVICE_ROLE_KEY", previous.key],
    ["MKL_SIGNATURE_MODULE", previous.mode],
    ["MKL_SIGNATURE_PILOT_COMMERCIAL_ID", previous.commercial],
    ["MKL_SIGNATURE_PILOT_MANAGER_ID", previous.manager],
    ["VERCEL_ENV", previous.vercel],
    ["SUPABASE_PRODUCTION_REF", previous.productionRef],
    ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", previous.publishable],
  ];
  for (const [name, value] of values) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("l’écriture SQL du pilote est simulée et n’atteint pas la production", async () => {
  const { COMMERCIAL_SALE_PRODUCTION_WRITE, commitDevisSignatureInDatabase } = await import("../app/lib/commercial-sale-production.js");
  const { signatureRemoteAllowed } = await import("../app/lib/commercial-sale-target.js");
  assert.equal(COMMERCIAL_SALE_PRODUCTION_WRITE, false);
  assert.equal(signatureRemoteAllowed(process.env, { write: true }), true);

  const digest = "ab".repeat(32);
  const sale = {
    id: "c".repeat(64),
    devisId,
    organizationId,
    commercialId: pfalzgrafId,
    proofKind: "devis_signe",
    proofDigest: digest,
    declaredSignatureDate: "2026-11-13",
    storagePath: `devis-signatures/${organizationId}/${devisId}/${digest}.pdf`,
    amountTtc: 4800,
    clientActorId: "99999999-9999-4999-8999-999999999999",
  };
  const result = await commitDevisSignatureInDatabase({
    sale,
    action: "confirmer",
    actorId: elOuariachiId,
    bytes: null,
  });
  assert.equal(result.simulated, true);
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{ method: "POST", path: "/rest/v1/rpc/commit_devis_signature" }]);
  assert.equal(rpc.p_actor_id, elOuariachiId);
  assert.equal(rpc.p_devis_id, devisId);
  assert.equal(rpc.p_action, "confirmer");
  assert.equal(JSON.stringify(rpc).includes("99999999-9999-4999-8999-999999999999"), false);

  process.env.MKL_SIGNATURE_MODULE = "actif";
  await assert.rejects(
    () => commitDevisSignatureInDatabase({ sale, action: "confirmer", actorId: elOuariachiId }),
    /Écriture production interdite/,
  );
  process.env.MKL_SIGNATURE_MODULE = "off";
  await assert.rejects(
    () => commitDevisSignatureInDatabase({ sale, action: "confirmer", actorId: pfalzgrafId }),
    /Écriture production interdite/,
  );
  process.env.MKL_SIGNATURE_MODULE = "pilote";
  process.env.MKL_SIGNATURE_PILOT_MANAGER_ID = pfalzgrafId;
  await assert.rejects(
    () => commitDevisSignatureInDatabase({ sale, action: "confirmer", actorId: elOuariachiId }),
    /Écriture production interdite/,
  );
  assert.equal(calls.length, 1);
});
