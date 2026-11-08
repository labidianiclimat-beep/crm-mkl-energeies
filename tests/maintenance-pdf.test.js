import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { omitEmptyMaintenanceFields } from "../app/lib/maintenance-pdf.js";

function classNames(value) {
  const names = new Set(String(value || "").split(/\s+/).filter(Boolean));
  return {
    contains: name => names.has(name),
    add: name => names.add(name),
    remove: name => names.delete(name),
  };
}

function matches(node, selector) {
  return selector.split(",").some(part => {
    const token = part.trim().split(/\s+/).pop();
    if (token.startsWith(".")) return node.classList.contains(token.slice(1).split(".")[0]);
    if (token.startsWith("input")) return node.tagName === "INPUT";
    return node.tagName === token.toUpperCase();
  });
}

function el(tag, props = {}, children = []) {
  const node = {
    tagName: tag.toUpperCase(),
    classList: classNames(props.class),
    type: props.type || "",
    value: props.value || "",
    checked: Boolean(props.checked),
    textContent: props.text || "",
    children: [],
    parentNode: null,
  };
  node.hasAttribute = name => (name === "checked" && node.checked) || (name === "type" && Boolean(node.type));
  node.getAttribute = name => (name === "value" ? node.value : name === "type" ? node.type : "");
  node.querySelector = selector => node.querySelectorAll(selector)[0] || null;
  node.querySelectorAll = selector => {
    const found = [];
    const walk = current => {
      for (const child of current.children) {
        if (matches(child, selector)) found.push(child);
        walk(child);
      }
    };
    walk(node);
    return found;
  };
  node.remove = () => {
    if (!node.parentNode) return;
    node.parentNode.children = node.parentNode.children.filter(child => child !== node);
    node.parentNode = null;
  };
  for (const child of children) {
    child.parentNode = node;
    node.children.push(child);
  }
  return node;
}

test("le pdf laisse les reponses et retire les controles vides", () => {
  const answered = el("div", { class: "control-row" }, [
    el("span", { text: "Pressions relevées" }),
    el("input", { type: "radio", value: "Conforme", checked: true }),
    el("input", { type: "text", value: "12 bar" }),
  ]);
  const empty = el("div", { class: "control-row" }, [
    el("span", { text: "Wi-Fi" }),
    el("input", { type: "radio", value: "Conforme" }),
  ]);
  const brand = el("label", {}, [
    el("span", { text: "Marque" }),
    el("select", { value: "Daikin" }),
  ]);
  const blank = el("label", {}, [
    el("span", { text: "N° de série" }),
    el("input", { value: "" }),
  ]);
  const root = el("main", { class: "maintenance-app" }, [
    el("section", { class: "paper" }, [
      el("div", { class: "field-grid" }, [brand, blank]),
      el("section", { class: "control-section" }, [
        el("h2", { text: "Circuit" }),
        answered,
        empty,
      ]),
    ]),
  ]);

  omitEmptyMaintenanceFields(root, { mark: true });

  assert.equal(empty.classList.contains("maintenance-omit"), true);
  assert.equal(answered.classList.contains("maintenance-omit"), false);
  assert.equal(blank.classList.contains("maintenance-omit"), true);
  assert.equal(brand.classList.contains("maintenance-omit"), false);
});

test("le rapport de maintenance est pagine pour le pdf", () => {
  const preview = readFileSync(new URL("../app/lib/document-preview.js", import.meta.url), "utf8");
  const pdf = readFileSync(new URL("../app/lib/html-to-pdf.js", import.meta.url), "utf8");
  const form = readFileSync(new URL("../app/maintenance-form/page.js", import.meta.url), "utf8");
  assert.match(preview, /omitEmptyMaintenanceFields/);
  assert.match(preview, /maintenance-pdf/);
  assert.match(pdf, /paginateMaintenanceSheets/);
  assert.match(form, /prepareMaintenancePrint/);
  assert.doesNotMatch(form, /omitEmpty/);
});
