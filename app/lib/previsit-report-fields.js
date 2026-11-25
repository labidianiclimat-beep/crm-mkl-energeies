const OMIT_CLASS = "previsit-omit";

function isOmitted(node) {
  return Boolean(node?.classList?.contains(OMIT_CLASS));
}

function isChecked(field) {
  return Boolean(field?.checked) || Boolean(field?.hasAttribute?.("checked"));
}

function isFilledControl(field) {
  if (!field) return false;
  if (field.type === "radio" || field.type === "checkbox") return isChecked(field);
  const value = String(field.value ?? "").trim();
  if (!value) return false;
  if (field.closest?.(".material-section")) {
    const qty = Number(value.replace(",", "."));
    return Number.isFinite(qty) && qty > 0;
  }
  return true;
}

function firstControl(node, selector) {
  return [...node.querySelectorAll(selector)][0] || null;
}

/**
 * Retire du rapport de prévisite les champs, choix et articles non renseignés.
 * `mark` ajoute une classe (impression de la page) au lieu de supprimer les nœuds.
 */
export function omitEmptyPrevisitFields(root, { mark = false } = {}) {
  if (!root?.querySelectorAll) return root;
  const drop = node => {
    if (!node || isOmitted(node)) return;
    if (mark) node.classList.add(OMIT_CLASS);
    else node.remove();
  };

  root.querySelectorAll(".previsit-photos-paper, .previsit-client-search").forEach(drop);

  root.querySelectorAll(".field-grid label").forEach(label => {
    if (isOmitted(label)) return;
    if (!isFilledControl(firstControl(label, "input, textarea, select"))) drop(label);
  });

  root.querySelectorAll(".choice").forEach(choice => {
    if (isOmitted(choice)) return;
    const selected = [...choice.querySelectorAll("input")].some(input => input.type === "radio" && isChecked(input));
    if (!selected) drop(choice);
  });

  root.querySelectorAll(".material-section label").forEach(label => {
    if (isOmitted(label)) return;
    if (!isFilledControl(firstControl(label, "input"))) drop(label);
  });

  root.querySelectorAll(".field-grid, .choice-grid").forEach(grid => {
    if (isOmitted(grid)) return;
    if (![...grid.children].some(child => !isOmitted(child))) drop(grid);
  });

  root.querySelectorAll(".material-section").forEach(section => {
    if (isOmitted(section)) return;
    if (![...section.querySelectorAll("label")].some(label => !isOmitted(label))) drop(section);
  });

  root.querySelectorAll(".paper.materials").forEach(paper => {
    if (isOmitted(paper)) return;
    if (![...paper.querySelectorAll(".material-section")].some(section => !isOmitted(section))) drop(paper);
  });

  root.querySelectorAll("h2").forEach(heading => {
    if (isOmitted(heading) || isOmitted(heading.parentNode)) return;
    let sibling = heading.nextElementSibling;
    let hasContent = false;
    while (sibling && sibling.tagName !== "H2") {
      if (!isOmitted(sibling)) hasContent = true;
      sibling = sibling.nextElementSibling;
    }
    if (!hasContent) drop(heading);
  });

  return root;
}
