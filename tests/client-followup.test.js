import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  hasQuoteFinancing,
  isKnownFinanceStatus,
  PREVISIT_SCHEDULED_STATUS,
  sameClientRecord,
  withScheduledPrevisit,
} from "../app/lib/client-followup.js";

test("un devis avec organisme a un financement à décider", () => {
  assert.equal(hasQuoteFinancing({ kind: "Devis", financier: "Sofinco" }), true);
  assert.equal(hasQuoteFinancing({ kind: "Devis", financeMode: "credit" }), true);
  assert.equal(hasQuoteFinancing({ kind: "Devis", financier: "Sans financement" }), false);
  assert.equal(hasQuoteFinancing({ kind: "Facture", financier: "Sofinco" }), false);
  assert.equal(isKnownFinanceStatus("Accepté"), true);
  assert.equal(isKnownFinanceStatus("Refusé"), true);
});

test("programmer une prévisite pose le statut et la date", () => {
  const client = { id: "c1", name: "SCI Horizon" };
  const next = withScheduledPrevisit([], client, "2026-10-02");
  assert.equal(next.length, 1);
  assert.equal(next[0].status, PREVISIT_SCHEDULED_STATUS);
  assert.equal(next[0].date, "2026-10-02");
  assert.equal(sameClientRecord(next[0], client), true);
  const updated = withScheduledPrevisit(next, client, "2026-10-08");
  assert.equal(updated.length, 1);
  assert.equal(updated[0].date, "2026-10-08");
});

test("la fiche client décide le financement et avise commercial et responsable", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const record = readFileSync(new URL("../app/components/client-record.js", import.meta.url), "utf8");
  const devisApi = readFileSync(new URL("../app/api/devis/[id]/route.js", import.meta.url), "utf8");
  const followupApi = readFileSync(new URL("../app/api/clients/[id]/followup/route.js", import.meta.url), "utf8");
  const notify = readFileSync(new URL("../app/lib/client-followup-notify.js", import.meta.url), "utf8");
  assert.match(record, /Accepter/);
  assert.match(record, /Refuser/);
  assert.match(record, /Prévisite programmée/);
  assert.match(page, /decideQuoteFinance/);
  assert.match(page, /\/api\/clients\/\$\{client\.id\}\/followup/);
  assert.match(devisApi, /isFinanceOnly/);
  assert.match(devisApi, /notifyCommercialAndManager/);
  assert.match(followupApi, /notifyCommercialAndManager/);
  assert.match(notify, /sendEmail: true/);
});
