import { buildQuoteLineFromArticle, buildQuoteLinesFromBundle, isBundleActive } from "./article-picker.js";
import { formatClientNumber } from "./client-number.js";
import { matchesPersonListQuery } from "./directory-search.js";
import { filledQuoteItems, isPreparedFreeLine, withPreparedFreeLine, WIZARD_STEPS } from "./devis-wizard.js";
import { formatProspectNumber } from "./prospect-number.js";
import {
  foldRadiatorQuoteLines,
  isRadiatorBundle,
  isRadiatorMachineArticle,
  radiatorFootAndWheelChoices,
} from "./radiator-bundle.js";

const QTY_WORDS = {
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
};

const TAX_RATES = [0, 5.5, 10, 20];

const STEP_BY_WORD = {
  client: "client",
  produits: "products",
  produit: "products",
  conditions: "conditions",
  condition: "conditions",
  financement: "finance",
  recapitulatif: "summary",
  recap: "summary",
};

export function normalizeVoiceText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9,.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripCourtesy(text) {
  return text.replace(/^(?:s il te plait|s il vous plait|stp|je voudrais|je veux|peux tu|pouvez vous|merci de|alors)\s+/, "");
}

function wordToQty(token) {
  if (QTY_WORDS[token]) return QTY_WORDS[token];
  if (/^\d+$/.test(token)) {
    const qty = Number(token);
    if (qty >= 1 && qty <= 99) return qty;
  }
  return 0;
}

function leadingQty(text) {
  const match = text.match(/^(?<n>\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze)\s+(?<tail>.+)$/);
  if (!match) return null;
  const qty = wordToQty(match.groups.n);
  if (!qty) return null;
  return { qty, tail: match.groups.tail };
}

function stripArticle(text) {
  return String(text || "").replace(/^(?:le|la|les|l|un|une|des|du|de|d)\s+/, "").trim();
}

function catalogRequest(text) {
  let query = stripArticle(text).replace(/\bkilowatts?\b/g, "kw");
  let prefer = "either";
  if (/^groupes?\b/.test(query)) {
    prefer = "group";
    query = stripArticle(query.replace(/^groupes?(?:\s+d(?:e)?\s+|\s+)?(?:articles?\s+)?/, ""));
  } else if (/^articles?\b/.test(query)) {
    prefer = "article";
    query = stripArticle(query.replace(/^articles?\s+/, ""));
  }
  return { prefer, query };
}

function parseTaxRate(raw) {
  const text = normalizeVoiceText(raw)
    .replace(/\bvirgule\b/g, ".")
    .replace(/pour cent|pourcent/g, "")
    .replace(",", ".")
    .replace(/\s+/g, "");
  const words = { zero: 0, cinq: 5, dix: 10, vingt: 20 };
  if (text === "zero" || text === "dix" || text === "vingt") return words[text];
  if (text === "cinq.cinq" || text === "cinq cinq" || text === "5.5") return 5.5;
  const amount = Number(text);
  if (!Number.isFinite(amount)) return null;
  return TAX_RATES.find(rate => Math.abs(rate - amount) < 0.001) ?? null;
}

const UNIT_WORDS = { zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9 };
const TEEN_WORDS = { dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16 };
const TEN_WORDS = { vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60 };

function frenchCardinal(text) {
  const tokens = normalizeVoiceText(text).split(/\s+/).filter(token => token && token !== "et" && token !== "numero" && token !== "n");
  if (!tokens.length) return "";
  if (tokens.every(token => token === "zero" || /^\d$/.test(token))) {
    return tokens.map(token => (token === "zero" ? "0" : token)).join("").replace(/^0+(?=\d)/, "");
  }
  if (tokens.every(token => UNIT_WORDS[token] != null || /^\d$/.test(token))) {
    return tokens.map(token => (UNIT_WORDS[token] != null ? String(UNIT_WORDS[token]) : token)).join("").replace(/^0+(?=\d)/, "");
  }
  let total = 0;
  let current = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (token === "quatre" && next === "vingt") {
      index += 1;
      let value = 80;
      const after = tokens[index + 1];
      if (after === "dix") {
        value = 90;
        index += 1;
        if (UNIT_WORDS[tokens[index + 1]] != null) {
          value += UNIT_WORDS[tokens[index + 1]];
          index += 1;
        }
      } else if (TEEN_WORDS[after] != null) {
        value += TEEN_WORDS[after];
        index += 1;
      } else if (UNIT_WORDS[after] != null) {
        value += UNIT_WORDS[after];
        index += 1;
      }
      current += value;
      continue;
    }
    if (token === "soixante" && next === "dix") {
      current += 70;
      index += 1;
      if (UNIT_WORDS[tokens[index + 1]] != null) {
        current += UNIT_WORDS[tokens[index + 1]];
        index += 1;
      }
      continue;
    }
    if (TEEN_WORDS[token] != null) {
      current += TEEN_WORDS[token];
      continue;
    }
    if (TEN_WORDS[token] != null) {
      current += TEN_WORDS[token];
      continue;
    }
    if (token === "cent") {
      current = (current || 1) * 100;
      continue;
    }
    if (token === "mille") {
      total += (current || 1) * 1000;
      current = 0;
      continue;
    }
    if (UNIT_WORDS[token] != null) {
      current += UNIT_WORDS[token];
      continue;
    }
    if (/^\d+$/.test(token)) return token.replace(/^0+(?=\d)/, "");
    return "";
  }
  total += current;
  return total > 0 ? String(total) : "";
}

export function voiceDigits(query) {
  const text = normalizeVoiceText(query).replace(/\b(mkl|cl|pr)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const tokens = text.split(/\s+/).filter(token => token !== "numero" && token !== "n");
  const allowed = /^(?:zero|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|cent|mille|et|\d+)$/;
  if (!tokens.length || !tokens.every(token => allowed.test(token))) return "";
  if (tokens.every(token => /^\d+$/.test(token))) return tokens.join("").replace(/^0+(?=\d)/, "");
  return frenchCardinal(tokens.join(" "));
}

function accessoryKind(token) {
  if (/^pieds?$/.test(token)) return "pied";
  if (/^roulettes?$/.test(token)) return "roulette";
  return "";
}

export function parseDevisVoice(transcript) {
  let text = stripCourtesy(normalizeVoiceText(transcript));
  text = stripCourtesy(text);
  if (!text) return { intent: "empty" };

  const tax = text.match(/^(?:tva|taxe)(?:\s+a)?\s+(.+)$/);
  if (tax) {
    const rate = parseTaxRate(tax[1]);
    return rate == null ? { intent: "tax-invalid" } : { intent: "tax", rate };
  }

  if (/^(?:paiement\s+comptant|paiement\s+au\s+comptant|au\s+comptant|comptant)$/.test(text)) {
    return { intent: "finance", mode: "cash" };
  }
  if (/^(?:paiement\s+)?(?:en\s+)?plusieurs fois$/.test(text) || /^paiement echelon/.test(text)) return { intent: "finance", mode: "installments" };
  if (/^(?:paiement\s+)?credit\b/.test(text) || text === "sofinco") return { intent: "finance", mode: "credit" };
  if (/^(?:financement\s+)?a definir$/.test(text)) return { intent: "finance", mode: "to_define" };
  if (/^(?:aucun financement|sans financement)$/.test(text)) return { intent: "finance", mode: "none" };
  if (/^(?:voir|montre|afficher|affiche|ouvre|ouvrir|previsualise|previsualiser|visualise|visualiser|apercu)\s+(?:le\s+|l\s+|un\s+)?pdf$/.test(text)) {
    return { intent: "preview" };
  }
  if (/^(?:previsualise|previsualiser|visualise|visualiser)(?:\s+le)?(?:\s+devis)?$/.test(text) || text === "apercu pdf") {
    return { intent: "preview" };
  }
  if (/^valide/.test(text)) return { intent: "validate-blocked" };

  if (/^(?:enregistre(?:r)?(?:\s+le)?(?:\s+brouillon)?|sauvegarde(?:r)?|brouillon)$/.test(text)) {
    return { intent: "save" };
  }

  if (/^(?:etape\s+suivante|suivant|continue|continuer)$/.test(text)) return { intent: "step", target: "next" };
  if (/^(?:precedent|retour|etape\s+precedente)$/.test(text)) return { intent: "step", target: "back" };
  if (/^(?:ajoute|ajouter|mets|met|pose|rajoute|rajouter)(?:\s+(?:le|la|l|ca|cela|celui la|celui ci|cet article|ce groupe))?$/.test(text)) {
    return { intent: "add-pending" };
  }
  if (/^(?:cherche|chercher|voir|montre|montrer|trouve|trouver)$/.test(text)) return { intent: "need-product" };
  const look = text.match(/^(?:cherche|chercher|voir|montre|montrer|affiche|afficher|trouve|trouver)(?:\s+moi)?\s+(.+)$/);
  if (look) {
    const asked = catalogRequest(look[1]);
    return asked.query ? { intent: "search", prefer: asked.prefer, query: asked.query, qty: 1 } : { intent: "need-product" };
  }
  const numbered = text.match(/^(?:(?<who>client|prospect)\s+)?(?:numero|n)(?:\s+(?:du|de|d))?\s+(?:(?<who2>client|prospect)\s+)?(?<num>.+)$/);
  if (numbered && voiceDigits(numbered.groups.num)) {
    const label = `${numbered.groups.who || ""} ${numbered.groups.who2 || ""}`;
    const who = label.includes("prospect") ? "prospect" : label.includes("client") ? "client" : "any";
    return { intent: "client", who, query: numbered.groups.num.trim(), byNumber: true };
  }
  const stepWord = text.match(/^(?:etape\s+)?(client|produits?|conditions?|financement|recapitulatif|recap)$/);
  if (stepWord) return { intent: "step", target: STEP_BY_WORD[stepWord[1]] || stepWord[1] };

  const accessory = text.match(/^(?:(?<n>\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze)\s+)?(?:le |la |les |un |une |des )?(?<kind>pieds?|roulettes?)(?:\s+pour\s+(?<target>.+))?$/);
  if (accessory) {
    return {
      intent: "accessory",
      kind: accessoryKind(accessory.groups.kind),
      qty: accessory.groups.n ? wordToQty(accessory.groups.n) : 0,
      target: stripArticle(accessory.groups.target || ""),
    };
  }

  const person = text.match(/^(?<who>devis\s+pour|pour\s+le\s+prospect|pour\s+le\s+client|prospect|client)\s+(?<name>.+)$/);
  if (person) {
    const who = person.groups.who.includes("prospect") ? "prospect" : person.groups.who === "client" || person.groups.who.includes("client") ? "client" : "any";
    const name = person.groups.name.replace(/^(?:monsieur|madame|mme|mr|m)\s+/, "").trim();
    return name ? { intent: "client", who, query: name } : { intent: "need-client" };
  }

  let adding = text.match(/^(?:ajoute|ajouter|mets|met|pose|rajoute|rajouter)\s+(.+)$/);
  let rest = adding ? adding[1] : "";
  let qty = 1;
  let prefer = "either";
  if (!rest) {
    const implied = leadingQty(text);
    if (implied) {
      qty = implied.qty;
      rest = implied.tail;
    }
  }
  if (rest) {
    const counted = leadingQty(stripArticle(rest));
    if (counted) {
      qty = counted.qty;
      rest = counted.tail;
    } else {
      rest = stripArticle(rest);
    }
    const asked = catalogRequest(rest);
    prefer = asked.prefer;
    rest = asked.query;
    const nested = accessoryKind(rest.split(/\s+/)[0] || "");
    if (nested && !rest.includes(" ")) {
      return { intent: "accessory", kind: nested, qty, target: "" };
    }
    if (!rest) return { intent: "need-product" };
    return { intent: "add", qty, prefer, query: rest };
  }

  return { intent: "unknown" };
}

export function scoreVoiceLabel(label, query) {
  const name = normalizeVoiceText(label);
  const wanted = normalizeVoiceText(query);
  if (!name || !wanted) return 0;
  const words = wanted.split(/\s+/).filter(Boolean);
  if (!words.every(word => name.includes(word))) return 0;
  let score = 10;
  if (name === wanted) score += 50;
  else if (name.startsWith(wanted)) score += 25;
  else if (name.includes(wanted)) score += 15;
  score -= Math.min(20, Math.max(0, name.length - wanted.length)) / 10;
  return score;
}

export function pickVoiceMatches(candidates, query) {
  const ranked = (candidates || [])
    .map(item => ({ ...item, score: scoreVoiceLabel(item.haystack || item.label, query) }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score || String(left.label).localeCompare(String(right.label), "fr"));
  if (!ranked.length) return { pick: null, choices: [] };
  if (ranked.length === 1 || ranked[0].score >= ranked[1].score + 20) return { pick: ranked[0], choices: [] };
  return { pick: null, choices: ranked.slice(0, 5) };
}

function isActiveArticle(article) {
  return Boolean(article) && article.status !== "Inactif" && article.active !== false && article.actif !== false;
}

function catalogCandidates(articles, bundles, prefer) {
  const groups = prefer === "article" ? [] : (bundles || []).filter(isBundleActive).map(bundle => ({
    kind: "bundle",
    id: bundle.id,
    label: bundle.name || bundle.family || "Groupe",
    detail: ["Groupe", bundle.brand, bundle.subcategory].filter(Boolean).join(" · "),
    haystack: [
      bundle.name, bundle.brand, bundle.category, bundle.subcategory, bundle.family,
      ...(bundle.items || []).map(item => `${item.code || ""} ${item.name || ""}`),
      isRadiatorBundle(bundle) ? "radiateur radiateurs" : "",
    ].join(" "),
  }));
  const rows = prefer === "group" ? [] : (articles || []).filter(isActiveArticle).map(article => ({
    kind: "article",
    id: article.id || article.code,
    label: article.name || article.designation || article.code || "Article",
    detail: ["Article", article.brand || article.marque, article.code].filter(Boolean).join(" · "),
    haystack: `${article.name || article.designation || ""} ${article.code || ""} ${article.brand || article.marque || ""} ${article.category || ""} ${article.subcategory || ""} ${isRadiatorMachineArticle(article) ? "radiateur radiateurs" : ""}`,
  }));
  return [...groups, ...rows];
}

function withSpokenQty(lines, qty) {
  if (!qty || qty === 1) return lines;
  if ((lines || []).some(isRadiatorMachineArticle)) {
    return lines.map(line => isRadiatorMachineArticle(line) ? { ...line, qty } : line);
  }
  return lines.map((line, index) => index === 0 ? { ...line, qty } : line);
}

function quoteLines(lines, articles, tax) {
  return withPreparedFreeLine(foldRadiatorQuoteLines(lines, articles), tax);
}

function personDetail(person) {
  return [
    person.badge || (person.directoryKind === "prospect" ? "Prospect" : "Client"),
    formatClientNumber(person.clientNumber),
    formatProspectNumber(person.prospectNumber),
  ].filter(Boolean).join(" · ");
}

function peopleCandidates(people, who) {
  return (people || []).filter(person => {
    if (who === "prospect") return person.directoryKind === "prospect";
    if (who === "client") return person.directoryKind === "client";
    return true;
  }).filter(person => person?.name || person?.contact).map(person => ({
    kind: "person",
    id: person.id,
    label: person.name || person.contact,
    detail: personDetail(person),
    haystack: [
      person.name, person.contact, person.firstName, person.lastName,
      formatClientNumber(person.clientNumber), person.clientNumber,
      formatProspectNumber(person.prospectNumber), person.prospectNumber,
    ].join(" "),
    person,
  }));
}

function retainPerson(person, context) {
  const number = person.directoryKind === "prospect"
    ? formatProspectNumber(person.prospectNumber)
    : formatClientNumber(person.clientNumber) || formatProspectNumber(person.prospectNumber);
  return {
    message: `${person.directoryKind === "prospect" ? "Prospect" : "Client"} ${person.name || person.contact}${number ? `, ${number}` : ""}.`,
    choices: [],
    recipient: person,
    ready: true,
    patch: { step: Math.max(Number(context.step) || 0, 1) },
  };
}

function choiceView(item, extra = {}) {
  return {
    kind: item.kind,
    id: item.id,
    label: item.label,
    detail: item.detail || "",
    ...extra,
  };
}

function addLines(context, lines, label, qty) {
  const next = quoteLines([...filledQuoteItems(context.items), ...withSpokenQty(lines, qty)], context.articles, context.tax);
  const step = Math.max(Number(context.step) || 0, 1);
  const count = qty > 1 ? `, quantité ${qty}` : "";
  return {
    message: `${label} est sur le devis${count}.`,
    choices: [],
    patch: { items: next, step },
  };
}

function applyAdd(command, context) {
  let prefer = command.prefer;
  if (prefer === "either") {
    const groups = pickVoiceMatches(catalogCandidates(context.articles, context.bundles, "group"), command.query);
    if (groups.pick || groups.choices.length) prefer = "group";
  }
  const pool = catalogCandidates(context.articles, context.bundles, prefer);
  const found = pickVoiceMatches(pool, command.query);
  if (!found.pick && !found.choices.length) {
    return { message: `Aucun ${command.prefer === "group" ? "groupe" : "article"} pour « ${command.query} ».`, choices: [] };
  }
  if (!found.pick) {
    return {
      message: "Plusieurs résultats. Choisissez.",
      choices: found.choices.map(item => choiceView(item, { qty: command.qty })),
    };
  }
  return applyCatalogChoice(choiceView(found.pick, { qty: command.qty }), context);
}

export function applyCatalogChoice(choice, context) {
  const qty = Number(choice.qty) || 1;
  if (choice.kind === "bundle") {
    const bundle = (context.bundles || []).find(item => String(item.id) === String(choice.id));
    if (!bundle) return { message: "Ce groupe n’est plus au catalogue.", choices: [] };
    const lines = buildQuoteLinesFromBundle(bundle, context.articles, { tax: context.tax });
    return addLines(context, lines, bundle.name || "Groupe", qty);
  }
  const article = (context.articles || []).find(item => String(item.id || item.code) === String(choice.id));
  if (!article) return { message: "Cet article n’est plus au catalogue.", choices: [] };
  const line = buildQuoteLineFromArticle(article, { qty, tax: context.tax }, { tax: context.tax ?? 10 });
  return addLines(context, [line], article.name || "Article", qty);
}

function radiatorTarget(items, query, radiatorId) {
  const radiators = filledQuoteItems(items).filter(isRadiatorMachineArticle);
  if (radiatorId) {
    return { radiator: radiators.find(line => String(line.id) === String(radiatorId)) || null, choices: [] };
  }
  if (!query) return { radiator: radiators[radiators.length - 1] || null, choices: [] };
  const found = pickVoiceMatches(radiators.map(line => ({
    id: line.id,
    label: line.name,
    haystack: `${line.name || ""} ${line.code || ""}`,
    line,
  })), query);
  if (found.pick) return { radiator: found.pick.line, choices: [] };
  return { radiator: null, choices: found.choices };
}

function applyAccessory(command, context) {
  const located = radiatorTarget(context.items, command.target, command.radiatorId);
  if (!located.radiator) {
    return {
      message: command.target ? "Je ne trouve pas ce radiateur sur le devis." : "Ajoutez d’abord un radiateur.",
      choices: located.choices.map(item => choiceView(item, { kind: "radiator", accessory: command.kind, qty: command.qty })),
    };
  }
  const feet = radiatorFootAndWheelChoices(context.articles).filter(article => {
    const name = normalizeVoiceText(article.name);
    return command.kind === "roulette" ? /\broulettes?\b/.test(` ${name} `) : /\bpieds?\b/.test(` ${name} `);
  });
  if (!feet.length) return { message: command.kind === "roulette" ? "Aucune roulette au catalogue." : "Aucun pied au catalogue.", choices: [] };
  if (feet.length > 1) {
    return {
      message: "Plusieurs modèles. Choisissez.",
      choices: feet.map(article => ({
        kind: "accessory",
        id: article.id || article.code,
        label: article.name,
        detail: located.radiator.name,
        radiatorId: located.radiator.id,
        qty: command.qty,
      })),
    };
  }
  return applyAccessoryChoice({
    id: feet[0].id || feet[0].code,
    radiatorId: located.radiator.id,
    qty: command.qty,
  }, context);
}

export function applyAccessoryChoice(choice, context) {
  const article = radiatorFootAndWheelChoices(context.articles).find(item => String(item.id || item.code) === String(choice.id));
  if (!article) return { message: "Cet accessoire n’est plus au catalogue.", choices: [] };
  let items = withPreparedFreeLine(
    foldRadiatorQuoteLines(context.items, context.articles, { assign: { radiatorId: choice.radiatorId, article } }),
    context.tax,
  );
  if (Number(choice.qty) > 1) {
    items = items.map(line => String(line.radiatorFor) === String(choice.radiatorId) ? { ...line, qty: Number(choice.qty) } : line);
  }
  return {
    message: `${article.name} ajouté sous le radiateur.`,
    choices: [],
    patch: { items },
  };
}

function peopleByNumber(people, who, digits) {
  const number = Number(String(digits || "").replace(/^0+(?=\d)/, ""));
  if (!Number.isInteger(number) || number <= 0) return [];
  return peopleCandidates(people, who).filter(item => {
    const person = item.person;
    if (who !== "prospect" && Number(person.clientNumber) === number) return true;
    if (who !== "client" && Number(person.prospectNumber) === number) return true;
    return false;
  });
}

function applyClient(command, context) {
  const digits = voiceDigits(command.query);
  if (digits) {
    const hits = peopleByNumber(context.people, command.who, digits);
    if (hits.length === 1) return retainPerson(hits[0].person, context);
    if (hits.length > 1) return { message: "Plusieurs fiches pour ce numéro. Choisissez.", choices: hits.map(item => choiceView(item)) };
    return { message: `Aucune fiche au numéro ${digits}.`, choices: [] };
  }
  const pool = peopleCandidates(context.people, command.who).filter(item => matchesPersonListQuery(item.person, command.query));
  const found = pickVoiceMatches(pool, command.query);
  if (!found.pick && !found.choices.length) return { message: `Aucune fiche pour « ${command.query} ».`, choices: [] };
  if (!found.pick) {
    return { message: "Plusieurs fiches. Choisissez.", choices: found.choices.map(item => choiceView(item)) };
  }
  return retainPerson(found.pick.person, context);
}

function applySearch(command, context) {
  const pool = catalogCandidates(context.articles, context.bundles, command.prefer);
  const found = pickVoiceMatches(pool, command.query);
  const rows = found.pick ? [found.pick] : found.choices;
  if (!rows.length) return { message: `Aucun article pour « ${command.query} ».`, choices: [] };
  const choices = rows.map(item => choiceView(item, { qty: command.qty || 1 }));
  if (choices.length === 1) {
    return { message: `${choices[0].label}. Dites « ajoute » pour le mettre sur le devis.`, choices };
  }
  return { message: "Plusieurs résultats. Appuyez sur celui qu’il faut, ou précisez le nom.", choices };
}

function applyPending(context) {
  const choices = context.pendingChoices || [];
  if (choices.length === 1) return voiceChoiceResult(choices[0], context);
  if (choices.length > 1) return { message: "Plusieurs résultats. Appuyez sur celui qu’il faut.", choices };
  return { message: "Dites d’abord : cherche l’article, puis le nom.", choices: [] };
}

function applyStep(command, context) {
  const current = Number(context.step) || 0;
  let next = current;
  if (command.target === "next") next = Math.min(WIZARD_STEPS.length - 1, current + 1);
  else if (command.target === "back") next = Math.max(0, current - 1);
  else next = WIZARD_STEPS.findIndex(step => step.id === command.target);
  if (next < 0) return { message: "Étape inconnue.", choices: [] };
  const label = WIZARD_STEPS[next]?.label || "Étape";
  return {
    message: label,
    choices: [],
    patch: { step: next },
    ready: next > 0 && Boolean(context.clientId || context.prospectId),
  };
}

function applyFinance(command, context) {
  const mode = command.mode;
  return {
    message: mode === "cash"
      ? "Paiement comptant."
      : mode === "installments"
        ? "Paiement en plusieurs fois."
        : mode === "credit"
          ? "Crédit affecté."
          : mode === "to_define"
            ? "Financement à définir."
            : "Aucun financement renseigné.",
    choices: [],
    patch: {
      financeMode: mode,
      financier: mode === "credit" ? "Sofinco" : "Sans financement",
      ...(mode === "credit" && context.totalTTC != null ? { financedAmount: Number(Number(context.totalTTC).toFixed(2)) } : {}),
    },
    patchStep: 3,
  };
}

function applyTax(command, context) {
  const items = (context.items || []).map(item => isPreparedFreeLine(item) ? item : { ...item, tax: command.rate });
  const label = command.rate === 5.5 ? "5,5" : String(command.rate);
  return { message: `TVA ${label} %.`, choices: [], patch: { tax: command.rate, items } };
}

const CLAUSE_MARKERS = [
  "client numero",
  "prospect numero",
  "numero du client",
  "numero du prospect",
  "numero client",
  "numero prospect",
  "devis pour",
  "pour le client",
  "pour le prospect",
  "paiement comptant",
  "paiement en plusieurs fois",
  "paiement plusieurs fois",
  "au comptant",
  "plusieurs fois",
  "credit affecte",
  "financement a definir",
  "aucun financement",
  "sans financement",
  "voir le pdf",
  "montre le pdf",
  "visualiser le pdf",
  "visualise le pdf",
  "previsualiser le pdf",
  "previsualise le pdf",
  "apercu pdf",
  "ajoute",
  "ajouter",
  "paiement",
  "credit",
  "client ",
  "prospect ",
].sort((left, right) => right.length - left.length);

export function splitVoiceClauses(transcript) {
  const text = normalizeVoiceText(transcript);
  if (!text) return [];
  const cuts = [0];
  let cursor = 0;
  while (cursor < text.length) {
    let found = null;
    for (let index = cursor; index < text.length; index += 1) {
      if (index > 0 && text[index - 1] !== " ") continue;
      const marker = CLAUSE_MARKERS.find(item => text.startsWith(item, index));
      if (marker) {
        found = { index, marker };
        break;
      }
    }
    if (!found) break;
    if (found.index > 0) cuts.push(found.index);
    cursor = found.index + found.marker.length;
  }
  return cuts.map((start, index) => text.slice(start, cuts[index + 1]).trim().replace(/^(?:puis|ensuite|et puis|apres|et)\s+/, "")).filter(Boolean);
}

function interpretOne(transcript, context) {
  const command = parseDevisVoice(transcript);
  if (command.intent === "empty") return { message: "Je n’ai rien entendu.", choices: [] };
  if (command.intent === "unknown") {
    return { message: "Commande non reconnue. Exemple : « client numéro 42 ajoute le groupe Panasonic paiement comptant voir le pdf ».", choices: [] };
  }
  if (command.intent === "tax-invalid") return { message: "TVA possible : 0, 5,5, 10 ou 20.", choices: [] };
  if (command.intent === "validate-blocked") return { message: "La validation reste sur le bouton Valider.", choices: [] };
  if (command.intent === "need-client") return { message: "Dites le nom du client ou du prospect.", choices: [] };
  if (command.intent === "need-product") return { message: "Dites le groupe ou l’article à ajouter.", choices: [] };
  if (command.intent === "client") return applyClient(command, context);
  if (command.intent === "search") return applySearch(command, context);
  if (command.intent === "add-pending") return applyPending(context);
  if (command.intent === "add") return applyAdd(command, context);
  if (command.intent === "accessory") return applyAccessory(command, context);
  if (command.intent === "tax") return applyTax(command, context);
  if (command.intent === "finance") {
    const result = applyFinance(command, context);
    return { ...result, patch: { ...result.patch, step: Math.max(Number(context.step) || 0, result.patchStep) } };
  }
  if (command.intent === "preview") return { message: "Aperçu PDF.", choices: [], preview: true };
  if (command.intent === "save") {
    if (!context.clientId && !context.prospectId) return { message: "Choisissez d’abord un client ou un prospect.", choices: [] };
    return { message: "Enregistrement du brouillon.", choices: [], save: true };
  }
  if (command.intent === "step") return applyStep(command, context);
  return { message: "Commande non reconnue.", choices: [] };
}

export function interpretDevisVoice(transcript, context = {}) {
  const clauses = splitVoiceClauses(transcript);
  if (clauses.length <= 1) return interpretOne(clauses[0] || transcript, context);
  let current = { ...context };
  const messages = [];
  let patch = {};
  let recipient = null;
  let preview = false;
  let save = false;
  let ready = false;
  for (const clause of clauses) {
    const result = interpretOne(clause, current);
    if (result.choices?.length && !result.patch && !result.recipient) {
      return { ...result, message: [...messages, result.message].filter(Boolean).join(" ") };
    }
    if ((!result.patch && !result.recipient && !result.preview && !result.save) && result.message && /non reconnue|rien entendu/.test(result.message)) continue;
    if (result.message) messages.push(result.message);
    if (result.recipient) {
      recipient = result.recipient;
      ready = true;
      current = {
        ...current,
        clientId: recipient.directoryKind === "prospect" ? "" : recipient.realId,
        prospectId: recipient.directoryKind === "prospect" ? recipient.realId : "",
      };
    }
    if (result.patch) {
      patch = { ...patch, ...result.patch };
      current = { ...current, ...result.patch, items: result.patch.items || current.items };
    }
    if (result.preview) preview = true;
    if (result.save) save = true;
    if (result.ready) ready = true;
  }
  return {
    message: messages.join(" ") || "Commande non reconnue.",
    choices: [],
    ...(Object.keys(patch).length ? { patch } : {}),
    ...(recipient ? { recipient } : {}),
    preview,
    save,
    ready,
  };
}

export function voiceChoiceResult(choice, context = {}) {
  if (!choice) return { message: "Choix vide.", choices: [] };
  if (choice.kind === "person") return applyClient({ who: "any", query: choice.label }, { ...context, people: (context.people || []).filter(person => String(person.id) === String(choice.id)) });
  if (choice.kind === "bundle" || choice.kind === "article") return applyCatalogChoice(choice, context);
  if (choice.kind === "accessory") return applyAccessoryChoice(choice, context);
  if (choice.kind === "radiator") {
    return applyAccessory({ kind: choice.accessory, qty: choice.qty, target: "", radiatorId: choice.id }, context);
  }
  return { message: "Choix inconnu.", choices: [] };
}
