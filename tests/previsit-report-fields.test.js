import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { omitEmptyPrevisitFields } from "../app/lib/previsit-report-fields.js";

function classNames(value) {
  const names = new Set(String(value || "").split(/\s+/).filter(Boolean));
  return {
    contains: name => names.has(name),
    add: name => names.add(name),
    remove: name => names.delete(name),
  };
}

function matchesComplex(node, selector) {
  const tokens = selector.trim().split(/\s+/);
  if (!matchSimple(node, tokens[tokens.length - 1])) return false;
  let current = node.parentNode;
  for (let index = tokens.length - 2; index >= 0; index -= 1) {
    while (current && !matchSimple(current, tokens[index])) current = current.parentNode;
    if (!current) return false;
    current = current.parentNode;
  }
  return true;
}

function matchSimple(node, token) {
  if (token.startsWith(".")) {
    return token.split(".").filter(Boolean).every(name => node.classList.contains(name));
  }
  return node.tagName === token.toUpperCase();
}

function querySelectorAll(node, selector) {
  const parts = selector.split(",").map(part => part.trim()).filter(Boolean);
  const found = [];
  const walk = current => {
    for (const child of current.children) {
      if (parts.some(part => matchesComplex(child, part))) found.push(child);
      walk(child);
    }
  };
  walk(node);
  return found;
}

function el(tag, props = {}, children = []) {
  const node = {
    tagName: tag.toUpperCase(),
    classList: classNames(props.class),
    type: props.type || "",
    value: props.value ?? "",
    checked: Boolean(props.checked),
    text: props.text || "",
    children: [],
    parentNode: null,
  };
  node.hasAttribute = name => name === "checked" && node.checked;
  node.matches = selector => matchesComplex(node, selector);
  node.closest = selector => {
    let current = node;
    while (current) {
      if (current.matches?.(selector)) return current;
      current = current.parentNode;
    }
    return null;
  };
  node.querySelectorAll = selector => querySelectorAll(node, selector);
  node.remove = () => {
    if (!node.parentNode) return;
    node.parentNode.children = node.parentNode.children.filter(child => child !== node);
    node.parentNode = null;
  };
  Object.defineProperty(node, "nextElementSibling", {
    get() {
      if (!node.parentNode) return null;
      const index = node.parentNode.children.indexOf(node);
      return node.parentNode.children[index + 1] || null;
    },
  });
  for (const child of children) {
    child.parentNode = node;
    node.children.push(child);
  }
  return node;
}

function label(text, control) {
  return el("label", {}, [el("span", { text }), control]);
}

function choice(text, { yes = false, no = false } = {}) {
  return el("div", { class: "choice" }, [
    el("span", { text }),
    el("label", {}, [el("input", { type: "radio", value: "Oui", checked: yes })]),
    el("label", {}, [el("input", { type: "radio", value: "Non", checked: no })]),
  ]);
}

function sampleForm() {
  return el("main", { class: "previsit-app" }, [
    el("div", { class: "previsit-client-search" }, [el("div", { class: "directory-search" })]),
    el("section", { class: "paper cover" }, [
      el("div", { class: "document-head" }, [el("h1", { text: "Fiche" })]),
      el("div", { class: "document-parties" }, [
        el("section", { class: "document-party is-company" }, [el("b", { text: "MKL" })]),
        el("section", { class: "document-party is-client" }, [
          el("div", { class: "field-grid party-fields" }, [
            label("Nom", el("input", { value: "Martin" })),
            label("Téléphone", el("input", { value: "" })),
          ]),
        ]),
      ]),
      el("h2", { text: "Informations du dossier" }),
      el("div", { class: "field-grid" }, [
        label("Date", el("input", { value: "2026-10-02" })),
        label("Commercial", el("input", { value: "  " })),
        label("Énergie", el("select", { value: "" })),
        label("Jours", el("input", { type: "number", value: "0" })),
      ]),
      el("h2", { text: "Pompe à chaleur" }),
      el("div", { class: "field-grid" }, [
        label("Marque", el("input", { value: "" })),
      ]),
      el("div", { class: "choice-grid" }, [
        choice("Wi-Fi", { yes: true }),
        choice("ECS"),
      ]),
      el("h2", { text: "Ballon" }),
      el("div", { class: "choice-grid" }, [choice("Trépied")]),
      el("div", { class: "field-grid" }, [
        label("Capacité", el("input", { value: "" })),
      ]),
    ]),
    el("section", { class: "paper previsit-photos-paper" }, [el("h1", { text: "Photos" })]),
    el("section", { class: "paper materials" }, [
      el("h1", { text: "Liste du matériel" }),
      el("section", { class: "material-section" }, [
        el("h2", { text: "Packs" }),
        label("Pack PAC", el("input", { type: "number", value: "2" })),
        label("Autre pack", el("input", { type: "number", value: "0" })),
      ]),
      el("section", { class: "material-section" }, [
        el("h2", { text: "Goulottes" }),
        label("Goulotte 140", el("input", { type: "number", value: "" })),
      ]),
    ]),
    el("section", { class: "paper signatures-page" }, [
      el("div", { class: "field-grid" }, [
        label("Réserves", el("textarea", { value: "" })),
        label("Signataire", el("input", { value: "Durand" })),
      ]),
      el("label", { class: "consent" }, [el("input", { type: "checkbox" })]),
      el("div", { class: "signature-grid" }, [el("div", { class: "signature-pad" })]),
    ]),
  ]);
}

function texts(root, selector) {
  return root.querySelectorAll(selector).map(node => node.text).filter(Boolean);
}

test("le rapport de prévisite ne garde que les éléments renseignés", () => {
  const root = sampleForm();
  omitEmptyPrevisitFields(root);

  assert.deepEqual(texts(root, "label span"), ["Nom", "Date", "Jours", "Pack PAC", "Signataire"]);
  assert.deepEqual(texts(root, ".choice span"), ["Wi-Fi"]);
  assert.deepEqual(texts(root, "h2"), ["Informations du dossier", "Pompe à chaleur", "Packs"]);
  assert.equal(root.querySelectorAll(".previsit-client-search").length, 0);
  assert.equal(root.querySelectorAll(".previsit-photos-paper").length, 0);
  assert.equal(root.querySelectorAll(".document-parties").length, 1);
  assert.equal(root.querySelectorAll(".paper.materials").length, 1);
  assert.equal(root.querySelectorAll(".material-section").length, 1);
  assert.equal(root.querySelectorAll(".consent").length, 1);
  assert.equal(root.querySelectorAll(".signature-pad").length, 1);
  assert.equal(root.querySelectorAll(".document-head").length, 1);
});

test("une liste matériel vide disparaît du rapport", () => {
  const root = el("main", {}, [
    el("section", { class: "paper materials" }, [
      el("h1", { text: "Liste du matériel" }),
      el("section", { class: "material-section" }, [
        el("h2", { text: "Électrique" }),
        label("Câble", el("input", { type: "number", value: "" })),
      ]),
    ]),
  ]);
  omitEmptyPrevisitFields(root);
  assert.equal(root.querySelectorAll(".paper.materials").length, 0);
});

test("l impression masque les champs vides sans les supprimer", () => {
  const root = sampleForm();
  omitEmptyPrevisitFields(root, { mark: true });
  const phone = root.querySelectorAll("label").find(node => node.children.some(child => child.text === "Téléphone"));
  const name = root.querySelectorAll("label").find(node => node.children.some(child => child.text === "Nom"));
  assert.equal(phone.classList.contains("previsit-omit"), true);
  assert.equal(name.classList.contains("previsit-omit"), false);
  assert.equal(name.parentNode !== null, true);
  assert.equal(root.querySelectorAll(".previsit-photos-paper")[0].classList.contains("previsit-omit"), true);
});

test("le filtre ne s applique pas aux autres documents", () => {
  const previsit = readFileSync(new URL("../app/previsite/page.js", import.meta.url), "utf8");
  const maintenance = readFileSync(new URL("../app/maintenance-form/page.js", import.meta.url), "utf8");
  const contract = readFileSync(new URL("../app/maintenance-contract/page.js", import.meta.url), "utf8");
  const preview = readFileSync(new URL("../app/lib/document-preview.js", import.meta.url), "utf8");
  assert.match(previsit, /omitEmpty:\s*true/);
  assert.match(previsit, /beforeprint/);
  assert.match(preview, /omitEmptyPrevisitFields/);
  assert.doesNotMatch(maintenance, /omitEmpty/);
  assert.doesNotMatch(contract, /omitEmpty/);
});
