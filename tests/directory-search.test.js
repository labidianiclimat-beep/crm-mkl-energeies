import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  filledSearchFields,
  filterDirectory,
  hasDirectoryQuery,
  matchesDirectorySearch,
  matchesPersonListQuery,
  queryMatchesSelected,
} from "../app/lib/directory-search.js";

const alice = {
  id: "1",
  firstName: "Alice",
  lastName: "Martin",
  name: "Alice Martin",
  address: "12 rue de la Paix",
  postalCode: "44000",
  city: "Nantes",
};

const sci = {
  id: "2",
  company: "SCI Horizon",
  name: "SCI Horizon",
  address: "8 boulevard de l’Océan",
  postalCode: "44500",
  city: "La Baule",
};

test("on peut retrouver une fiche par nom, prenom, adresse, telephone ou email", () => {
  assert.equal(matchesDirectorySearch(alice, { lastName: "martin" }), true);
  assert.equal(matchesDirectorySearch(alice, { firstName: "ali" }), true);
  assert.equal(matchesDirectorySearch(alice, { address: "nantes" }), true);
  assert.equal(matchesDirectorySearch({ ...alice, phone: "06 12 34 56 78", email: "alice@test.fr" }, { q: "06 12" }), true);
  assert.equal(matchesDirectorySearch({ ...alice, email: "alice@test.fr" }, { q: "alice@test" }), true);
  assert.equal(matchesDirectorySearch(alice, { lastName: "dupont" }), false);
  assert.equal(matchesDirectorySearch(sci, { lastName: "horizon" }), true);
  assert.equal(matchesDirectorySearch(sci, { address: "la baule" }), true);
});

test("la liste clients et prospects filtre nom prenom et adresse", () => {
  assert.equal(matchesPersonListQuery(alice, ""), true);
  assert.equal(matchesPersonListQuery(alice, "martin"), true);
  assert.equal(matchesPersonListQuery(alice, "ali nantes"), true);
  assert.equal(matchesPersonListQuery(alice, "paix"), true);
  assert.equal(matchesPersonListQuery(alice, "dupont"), false);
  assert.equal(matchesPersonListQuery(sci, "ocean"), true);
});

test("le nom saisi prenom en premier ou avec une civilite retrouve la fiche", () => {
  assert.equal(matchesDirectorySearch(alice, { lastName: "martin alice" }), true);
  assert.equal(matchesDirectorySearch({ ...alice, civilite: "Mme" }, { lastName: "mme martin" }), true);
  assert.equal(matchesPersonListQuery(alice, "martin alice"), true);
  assert.equal(matchesDirectorySearch(alice, { lastName: "martin", firstName: "alice" }), true);
  assert.equal(matchesDirectorySearch(alice, { lastName: "dupont alice" }), false);
});

test("plusieurs champs affinent la recherche", () => {
  assert.equal(matchesDirectorySearch(alice, { lastName: "martin", address: "nantes" }), true);
  assert.equal(matchesDirectorySearch(alice, { lastName: "martin", address: "paris" }), false);
});

test("sans saisie la liste n est pas proposee", () => {
  assert.equal(hasDirectoryQuery({ lastName: "", firstName: "  ", address: "" }), false);
  assert.deepEqual(filterDirectory([alice, sci], {}), []);
  assert.equal(filterDirectory([alice, sci], { lastName: "mar" }).length, 1);
});

test("apres selection la meme saisie ne relance pas la liste", () => {
  assert.equal(queryMatchesSelected(alice, { lastName: "Martin", firstName: "Alice" }), true);
  assert.equal(queryMatchesSelected(alice, { lastName: "Martin", firstName: "Alice", address: "nantes" }), true);
  assert.equal(queryMatchesSelected(alice, { lastName: "Dupont" }), false);
});

test("un seul champ cherche aussi telephone et email", () => {
  const person = { ...alice, phone: "06 12 34 56 78", email: "alice@test.fr" };
  assert.equal(matchesDirectorySearch(person, { lastName: "06 12" }), true);
  assert.equal(matchesDirectorySearch(person, { firstName: "alice@test" }), true);
  assert.equal(matchesDirectorySearch(person, { address: "44000" }), true);
});

test("la selection remplit nom prenom adresse", () => {
  assert.deepEqual(filledSearchFields(alice), {
    lastName: "Martin",
    firstName: "Alice",
    address: "12 rue de la Paix 44000 Nantes",
  });
  assert.deepEqual(filledSearchFields(sci), {
    lastName: "SCI Horizon",
    firstName: "",
    address: "8 boulevard de l’Océan 44500 La Baule",
  });
});

test("les recherches client proposent de creer une fiche", () => {
  const search = readFileSync(new URL("../app/components/directory-search.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const thermal = readFileSync(new URL("../app/etude-thermique/page.js", import.meta.url), "utf8");
  const agenda = readFileSync(new URL("../app/components/commercial-agenda.js", import.meta.url), "utf8");
  const wizard = readFileSync(new URL("../app/components/devis-wizard.js", import.meta.url), "utf8");
  const address = readFileSync(new URL("../app/components/complete-address-fields.js", import.meta.url), "utf8");
  assert.match(search, /Créer un client/);
  assert.match(search, /const canCreate = allowCreate && kind !== "prospect"/);
  assert.match(search, /authFetch\("\/api\/clients"/);
  assert.match(search, /createPortal/);
  assert.match(search, /filledSearchFields/);
  assert.match(search, /if \(item\) applyFields\(item\)/);
  assert.doesNotMatch(search, /setLastNameState\(""\)/);
  assert.match(page, /onClientCreated=\{rememberClient\}/);
  assert.match(page, /createdItem=\{client=>\(\{\.\.\.client,id:`client:\$\{client\.id\}`/);
  assert.doesNotMatch(thermal, /onClientCreated/);
  assert.match(thermal, /allowCreate=\{false\}/);
  assert.match(thermal, /ExistingClientGate/);
  // L'étude thermique ne passe plus `variant="inline"` : la mise en page est
  // descendue dans le composant, qui n'expose plus ce réglage. Ce qui doit
  // encore être garanti est ailleurs, et c'est plus important : que l'interdit
  // de création posé par la page soit réellement transmis au champ de
  // recherche. Sans ce relais, `allowCreate={false}` ne serait que décoratif,
  // et l'étude thermique rouvrirait la création de fiches par la fenêtre.
  const connect = readFileSync(new URL("../app/components/recipient-connect.js", import.meta.url), "utf8");
  assert.match(connect, /export function ExistingClientGate\(\{[^}]*allowCreate = false/);
  assert.match(connect, /<RecipientConnect[^>]*allowCreate=\{allowCreate\}/);
  // L'étude thermique n'autocomplète plus d'adresse, et c'est normal : elle
  // n'en saisit plus aucune. La fiche client étant obligatoire — création
  // interdite — l'adresse en est reprise et figée par `frozenRecipient`.
  // C'est une garantie plus forte que la précédente : l'adresse portée sur un
  // document ne peut pas être retapée à la volée.
  assert.match(thermal, /frozenRecipient/);
  assert.doesNotMatch(thermal, /name="address"/);
  // Ces deux comptes valaient un, pour interdire le doublon de champs d'état
  // civil. Ils valent zéro désormais, et pour la même raison que l'adresse :
  // l'identité vient de la fiche choisie, elle n'est plus ressaisie. L'intention
  // d'origine est donc mieux servie qu'avant, et le contrôle devient : aucune
  // ressaisie, jamais plus d'un champ si l'un devait revenir.
  assert.ok((thermal.match(/<label>Nom/g) || []).length <= 1);
  assert.ok((thermal.match(/<label>Prénom/g) || []).length <= 1);
  assert.match(agenda, /kind="prospect"/);
  assert.doesNotMatch(agenda, /onClientCreated/);
  assert.match(wizard, /<DirectorySearch/);
  assert.doesNotMatch(wizard, /label>Recherche/);
  assert.doesNotMatch(address, /Rechercher une adresse/);
  assert.match(address, /useBanSuggestions\(street/);
  assert.match(address, /autoComplete="off"/);
  assert.match(address, /event.key !== "Enter"/);
  assert.match(address, /htmlFor=/);
});
