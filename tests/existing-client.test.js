import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { EXISTING_CLIENT_MESSAGE, findExistingClient, recipientLink, studySubject } from "../app/lib/existing-client.js";

const message = "Veuillez d'abord créer le client dans le module Clients, puis revenir ici pour créer votre document.";

test("un document ne se rattache qu a un client deja enregistre", () => {
  const clients = [{ id: "42", name: "Martin" }, { id: "a-b-c", name: "Durand" }];
  assert.equal(EXISTING_CLIENT_MESSAGE, message);
  assert.equal(findExistingClient(clients, "42")?.name, "Martin");
  assert.equal(findExistingClient(clients, "a-b-c")?.name, "Durand");
  assert.equal(findExistingClient(clients, ""), null);
  assert.equal(findExistingClient(clients, "inconnu"), null);
});

test("une etude s ouvre des qu un prospect est trouve", () => {
  const clients = [{ id: "c1", name: "Durand" }];
  const prospect = { id: "p1", name: "Martin", directoryKind: "prospect", prospectNumber: 12 };
  assert.deepEqual(recipientLink(prospect), { clientId: "", prospectId: "p1" });
  assert.equal(recipientLink({ id: "c1", name: "Durand" }).clientId, "c1");
  const subject = studySubject(clients, prospect);
  assert.equal(subject.directoryKind, "prospect");
  assert.equal(subject.clientId, "");
  assert.equal(subject.prospectId, "p1");
  assert.equal(studySubject(clients, { id: "c1", directoryKind: "client" }).name, "Durand");
  assert.equal(studySubject(clients, { id: "inconnu", directoryKind: "client" }), null);
  const thermal = readFileSync(new URL("../app/etude-thermique/page.js", import.meta.url), "utf8");
  const install = readFileSync(new URL("../app/components/pv-complete-study-form.js", import.meta.url), "utf8");
  const window = readFileSync(new URL("../app/components/document-window.js", import.meta.url), "utf8");
  assert.match(thermal, /allowProspect/);
  assert.match(install, /allowProspect/);
  assert.match(window, /allowProspect/);
  assert.match(window, /Prospect retenu/);
});
test("les creations de documents n ouvrent plus de fiche client", () => {
  const files = {
    thermal: readFileSync(new URL("../app/etude-thermique/page.js", import.meta.url), "utf8"),
    simulator: readFileSync(new URL("../app/simulateur-pv/page.js", import.meta.url), "utf8"),
    install: readFileSync(new URL("../app/components/pv-complete-study-form.js", import.meta.url), "utf8"),
    previsit: readFileSync(new URL("../app/previsite/page.js", import.meta.url), "utf8"),
    page: readFileSync(new URL("../app/page.js", import.meta.url), "utf8"),
    record: readFileSync(new URL("../app/components/client-record.js", import.meta.url), "utf8"),
  };
  for (const source of [files.thermal, files.simulator, files.install, files.previsit]) {
    assert.doesNotMatch(source, /onClientCreated/);
    assert.match(source, /allowCreate=\{false\}/);
    assert.match(source, /allowProspect/);
    assert.match(source, /findExistingClient|studySubject/);
  }
  assert.match(files.page, /allowCreate=\{false\}/);
  assert.match(files.page, /EXISTING_CLIENT_MESSAGE/);
  assert.match(files.page, /startClientDocument/);
  assert.match(files.record, /onStartDocument\("thermal"\)/);
  assert.match(files.record, /onStartDocument\("contract"\)/);
  assert.match(files.record, /onStartDocument\("soft"\)/);
  assert.match(files.record, /onStartDocument\("install"\)/);
  assert.match(files.record, /onStartDocument\("simulator"\)/);
  assert.match(files.page, /onClientCreated=\{rememberClient\}/);
});
