const OMIT_CLASS = "maintenance-omit";

function isOmitted(node) {
  return Boolean(node?.classList?.contains(OMIT_CLASS));
}

function isChecked(field) {
  return Boolean(field?.checked) || Boolean(field?.hasAttribute?.("checked"));
}

function controlValue(field) {
  if (!field || field.type === "hidden") return "";
  if (field.type === "radio" || field.type === "checkbox") return isChecked(field) ? (field.value || "1") : "";
  if (field.tagName === "SELECT") {
    const selected = [...(field.options || field.children || [])].find(option => option.selected || option.hasAttribute?.("selected"));
    const value = String(selected?.value ?? field.value ?? field.getAttribute?.("value") ?? "").trim();
    if (!value || value === "__manual__") return "";
    return String(selected?.textContent || selected?.text || value).trim();
  }
  const value = String(field.value ?? field.getAttribute?.("value") ?? "").trim();
  if (!value || value === "__manual__") return "";
  return value;
}

function labelValue(label) {
  const fields = [...(label.querySelectorAll?.("input, textarea, select") || [])];
  for (const field of fields) {
    const value = controlValue(field);
    if (value) return value;
  }
  return "";
}

function answeredChoice(row) {
  const checked = [...(row.querySelectorAll?.('input[type="radio"], input') || [])]
    .find(field => (field.type === "radio" || field.getAttribute?.("type") === "radio") && isChecked(field));
  return String(checked?.value || checked?.getAttribute?.("value") || "").trim();
}

function noteValue(row) {
  const note = [...(row.querySelectorAll?.("input") || [])]
    .find(field => field.type !== "radio" && field.type !== "checkbox" && field.type !== "hidden" && field.getAttribute?.("type") !== "radio");
  return String(note?.value ?? note?.getAttribute?.("value") ?? "").trim();
}

function dropNode(node, mark) {
  if (!node || isOmitted(node)) return;
  if (mark) node.classList.add(OMIT_CLASS);
  else node.remove();
}

function replaceWithFact(label, value) {
  const doc = label.ownerDocument;
  if (!doc?.createElement) return;
  const fact = doc.createElement("p");
  fact.className = label.classList?.contains("wide") ? "maintenance-fact is-wide" : "maintenance-fact";
  const title = doc.createElement("span");
  title.textContent = label.querySelector?.("span")?.textContent || "";
  const body = doc.createElement("b");
  body.textContent = value;
  fact.append(title, body);
  label.replaceWith(fact);
}

function replaceAnsweredRow(row, answer) {
  const doc = row.ownerDocument;
  if (!doc?.createElement) return;
  const line = doc.createElement("div");
  line.className = "control-row is-answered";
  const title = doc.createElement("span");
  title.textContent = row.querySelector?.(":scope > span, span")?.textContent || "";
  const choice = doc.createElement("b");
  choice.textContent = answer;
  line.append(title, choice);
  const note = noteValue(row);
  if (note) {
    const detail = doc.createElement("small");
    detail.textContent = note;
    line.append(detail);
  }
  row.replaceWith(line);
}

function headingHasContent(heading) {
  let sibling = heading.nextElementSibling;
  while (sibling && sibling.tagName !== "H2" && !sibling.classList?.contains("document-head")) {
    if (!isOmitted(sibling)) return true;
    sibling = sibling.nextElementSibling;
  }
  return false;
}

/** Retire du rapport les contrôles sans réponse et les cases vides. */
export function omitEmptyMaintenanceFields(root, { mark = false } = {}) {
  if (!root?.querySelectorAll) return root;

  root.querySelectorAll(".maintenance-steps, input[type='hidden']").forEach(node => dropNode(node, mark));

  root.querySelectorAll(".control-row").forEach(row => {
    if (isOmitted(row)) return;
    const answer = answeredChoice(row);
    if (!answer) {
      dropNode(row, mark);
      return;
    }
    if (!mark) replaceAnsweredRow(row, answer);
  });

  root.querySelectorAll(".control-head").forEach(node => dropNode(node, mark));

  root.querySelectorAll(".field-grid label, .measure-grid label, .document-closing-meta label").forEach(label => {
    if (isOmitted(label)) return;
    const value = labelValue(label);
    if (!value) {
      dropNode(label, mark);
      return;
    }
    if (!mark) replaceWithFact(label, value);
  });

  root.querySelectorAll(".consent").forEach(consent => {
    if (isOmitted(consent)) return;
    const box = consent.querySelector?.("input");
    if (box && !isChecked(box)) dropNode(consent, mark);
  });

  root.querySelectorAll(".field-grid, .measure-grid, .document-closing-meta, .control-section").forEach(node => {
    if (isOmitted(node)) return;
    const children = [...(node.children || [])].filter(child => !isOmitted(child));
    if (!children.length) dropNode(node, mark);
  });

  root.querySelectorAll("h2").forEach(heading => {
    if (isOmitted(heading) || isOmitted(heading.parentNode)) return;
    if (!headingHasContent(heading)) dropNode(heading, mark);
  });

  root.querySelectorAll(".control-section, .paper").forEach(node => {
    if (isOmitted(node)) return;
    const rest = [...(node.children || [])].filter(child => !isOmitted(child) && child.tagName !== "H2" && !child.classList?.contains("document-head"));
    if (!rest.length) [...(node.children || [])].forEach(child => dropNode(child, mark));
  });

  return root;
}

export function prepareMaintenancePrint(root) {
  return omitEmptyMaintenanceFields(root, { mark: true });
}

export function restoreMaintenancePrint(root) {
  root?.querySelectorAll?.(`.${OMIT_CLASS}`).forEach(node => node.classList.remove(OMIT_CLASS));
}

function isHeading(node) {
  return node?.tagName === "H2" || Boolean(node?.classList?.contains("document-head"));
}

function flowPieces(node) {
  if (!node || isOmitted(node)) return [];
  if (node.classList?.contains("field-grid") || node.classList?.contains("measure-grid")) {
    return groupFacts(node);
  }
  if (node.classList?.contains("control-section")) {
    return [...node.children].flatMap(flowPieces);
  }
  if (node.classList?.contains("document-closing")) {
    return [...node.children].flatMap(flowPieces);
  }
  if (node.classList?.contains("document-closing-signs")) {
    return [...node.children];
  }
  return [node];
}

function groupFacts(grid) {
  const groups = [];
  let row = null;
  const doc = grid.ownerDocument;
  for (const child of [...grid.children]) {
    if (isOmitted(child)) continue;
    const wide = child.classList?.contains("wide") || child.classList?.contains("is-wide") || Boolean(child.querySelector?.("textarea"));
    if (wide || !doc?.createElement) {
      row = null;
      groups.push(child);
      continue;
    }
    if (!row || row.children.length >= 2) {
      row = doc.createElement("div");
      row.className = "maintenance-fact-row";
      groups.push(row);
    }
    row.appendChild(child);
  }
  return groups;
}

function collectBlocks(app) {
  const blocks = [];
  app.querySelectorAll(".paper").forEach(paper => {
    [...paper.children].forEach(child => {
      blocks.push(...flowPieces(child));
    });
  });
  return blocks.filter(Boolean);
}

function openSheet(app, continued) {
  const doc = app.ownerDocument;
  const sheet = doc.createElement("section");
  sheet.className = "sheet maintenance-sheet";
  const body = doc.createElement("div");
  body.className = "sheet-body";
  if (continued) {
    const banner = doc.createElement("p");
    banner.className = "maintenance-continue";
    banner.textContent = "Rapport de maintenance — suite";
    body.appendChild(banner);
  }
  const footer = doc.createElement("footer");
  footer.className = "maintenance-page-num";
  sheet.append(body, footer);
  app.appendChild(sheet);
  if (body.clientHeight < 200) body.style.height = "960px";
  return { sheet, body };
}

function fits(body) {
  return body.scrollHeight <= body.clientHeight + 1;
}

/** Découpe le rapport en pages A4, avec un bandeau de suite. */
export function paginateMaintenanceSheets(host) {
  const app = host?.querySelector?.(".maintenance-app.maintenance-pdf");
  if (!app || app.querySelector(".maintenance-sheet")) return 0;
  const blocks = collectBlocks(app);
  app.querySelectorAll(".paper, .maintenance-steps").forEach(node => node.remove());
  if (!blocks.length) return 0;

  const pages = [];
  let body = null;

  function startPage(continued) {
    const opened = openSheet(app, continued);
    body = opened.body;
    pages.push(opened.sheet);
  }

  startPage(false);
  for (const block of blocks) {
    body.appendChild(block);
    if (fits(body)) continue;
    body.removeChild(block);
    const previous = body.lastElementChild;
    const carry = isHeading(previous) ? previous : null;
    if (carry) body.removeChild(carry);
    const hasContent = [...body.children].some(node => !node.classList.contains("maintenance-continue"));
    if (!hasContent) {
      if (carry) body.appendChild(carry);
      body.appendChild(block);
      continue;
    }
    startPage(true);
    if (carry) body.appendChild(carry);
    body.appendChild(block);
  }

  pages.forEach((sheet, index) => {
    const label = sheet.querySelector(".maintenance-page-num");
    if (label) label.textContent = `Page ${index + 1} / ${pages.length}`;
  });
  return pages.length;
}
