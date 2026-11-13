import { requireApiSession } from "../../../../lib/api-auth";
import { proofAccess, runSaleRequest, saleView } from "../../../../lib/commercial-sale-flow";
import { saleForDevis } from "../../../../lib/commercial-sale";
import { readSaleBook, readSalePdf, saveSalePdf, writeSaleBook } from "../../../../lib/commercial-sale-file";
import { loadRecordedDevis } from "../../../../lib/commercial-sale-record";
import { COMMERCIAL_SALE_PRODUCTION_WRITE, commitDevisSignatureInDatabase } from "../../../../lib/commercial-sale-production";
import { readRemoteSaleBook, readRemoteSalePdf } from "../../../../lib/commercial-sale-remote";
import { signatureAccess } from "../../../../lib/commercial-sale-target";

export const runtime = "nodejs";

function closedProject(access) {
  const disabled = access?.mode === "off";
  return Response.json(
    {
      error: disabled
        ? "Le module signature est désactivé. Les preuves déjà enregistrées sont conservées."
        : "La signature n’est pas ouverte sur ce projet.",
      productionWrite: false,
    },
    { status: 403 }
  );
}

function readOnly() {
  return Response.json(
    {
      error: "Le module signature est en lecture seule. Les preuves déjà enregistrées sont conservées.",
      productionWrite: false,
    },
    { status: 403 }
  );
}

function pdfFromBody(body = {}) {
  const raw = String(body.pdfBase64 || "").replace(/^data:application\/pdf;base64,/i, "").trim();
  if (!raw) return null;
  return Buffer.from(raw, "base64");
}

async function recordedOrResponse(id, accessToken) {
  try {
    const recorded = await loadRecordedDevis(id, accessToken);
    if (!recorded) return { response: Response.json({ error: "Devis introuvable.", productionWrite: false }, { status: 404 }) };
    return { recorded };
  } catch (error) {
    console.error("Commercial sale devis read", error?.message || error);
    return {
      response: Response.json(
        { error: "Le devis enregistré ne peut pas être relu.", productionWrite: false },
        { status: error?.status || 503 }
      ),
    };
  }
}

function currentGate() {
  return signatureAccess(process.env, { productionWrite: COMMERCIAL_SALE_PRODUCTION_WRITE === true });
}

function remoteTarget(target) {
  return target === "recette" || target === "production";
}

async function currentBook(target, organizationId) {
  if (remoteTarget(target)) return readRemoteSaleBook(organizationId);
  return readSaleBook();
}

export async function GET(request, { params }) {
  try {
    const gate = currentGate();
    const target = gate.target;
    if (!gate.reads) return closedProject(gate);
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    const { id } = await params;
    const url = new URL(request.url);
    if (url.searchParams.get("fichier") === "1") {
      const loaded = await recordedOrResponse(id, auth.accessToken);
      if (loaded.response) return loaded.response;
      const book = await currentBook(target, loaded.recorded.organizationId);
      const sale = saleForDevis(book, id);
      const access = proofAccess({ profile: auth.profile, userId: auth.user.id, sale });
      if (access.status !== 200) return Response.json({ error: access.error, productionWrite: false }, { status: access.status });
      const bytes = remoteTarget(target) ? await readRemoteSalePdf(sale.storagePath) : await readSalePdf(sale.proofDigest);
      if (!bytes) return Response.json({ error: "Justificatif introuvable.", productionWrite: false }, { status: 404 });
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": "inline; filename=\"devis-signe.pdf\"",
          "Cache-Control": "private, no-store",
        },
      });
    }
    const loaded = await recordedOrResponse(id, auth.accessToken);
    if (loaded.response) return loaded.response;
    const book = await currentBook(target, loaded.recorded.organizationId);
    return Response.json(saleView({ profile: auth.profile, book, devisId: id, recorded: loaded.recorded }));
  } catch (error) {
    console.error("Commercial sale read", error?.message || error);
    return Response.json({ error: "Lecture de la signature impossible.", productionWrite: false }, { status: 503 });
  }
}

export async function POST(request, { params }) {
  try {
    const gate = currentGate();
    const target = gate.target;
    if (!gate.writes) return gate.reads ? readOnly() : closedProject(gate);
    const auth = await requireApiSession(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    const body = await request.json().catch(() => ({}));
    const { id } = await params;
    const loaded = await recordedOrResponse(id, auth.accessToken);
    if (loaded.response) return loaded.response;
    const book = await currentBook(target, loaded.recorded.organizationId);
    const bytes = pdfFromBody(body);
    const outcome = await runSaleRequest({
      profile: auth.profile,
      user: auth.user,
      action: body.action,
      recorded: loaded.recorded,
      body,
      book,
      requireStatusSync: remoteTarget(target),
      transaction: async ({ sale }) => {
        await commitDevisSignatureInDatabase({
          sale,
          action: body.action,
          actorId: auth.user.id,
          reason: body.reason || null,
          bytes: body.action === "annuler" ? null : bytes,
        });
        return { ok: true };
      },
    });
    if (!outcome.persist) return Response.json(outcome.body, { status: outcome.status });
    if (remoteTarget(target)) {
      const again = await loadRecordedDevis(id, auth.accessToken);
      const fresh = await readRemoteSaleBook(again?.organizationId || loaded.recorded.organizationId);
      return Response.json({
        ...saleView({ profile: auth.profile, book: fresh, devisId: id, recorded: again || loaded.recorded }),
        identical: Boolean(outcome.body.identical),
        sync: outcome.body.sync || null,
        productionWrite: false,
      });
    }
    if (outcome.pdf) await saveSalePdf(outcome.pdf.digest, outcome.pdf.bytes);
    await writeSaleBook(outcome.book);
    return Response.json(outcome.body, { status: outcome.status });
  } catch (error) {
    console.error("Commercial sale write", error?.message || error);
    return Response.json({ error: "Enregistrement de la signature impossible.", productionWrite: false }, { status: 503 });
  }
}
