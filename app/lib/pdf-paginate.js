const MAX_PAGES = 30;

function overflows(body) {
  return body.scrollHeight > body.clientHeight + 1;
}

function cutIndex(text, best) {
  if (best >= text.length) return best;
  const windowStart = Math.floor(best * 0.55);
  const newline = text.lastIndexOf("\n", best);
  if (newline >= windowStart) return newline;
  const space = text.lastIndexOf(" ", best);
  if (space >= windowStart) return space;
  return best;
}

function createContinuation(block, leftoverText) {
  const name = block.querySelector(".article-main .name, [data-article-name]")?.textContent?.trim() || "article";
  const article = document.createElement("article");
  article.className = "article-block article-continued";
  article.setAttribute("data-flow-block", "");
  const label = document.createElement("div");
  label.className = "article-continue-label";
  label.textContent = `Suite — ${name}`;
  const detail = document.createElement("div");
  detail.className = "article-detail";
  const desc = document.createElement("div");
  desc.className = "article-desc";
  desc.setAttribute("data-split-text", "");
  desc.textContent = leftoverText;
  detail.append(desc);
  article.append(label, detail);
  return article;
}

function appendFitting(body, block) {
  body.appendChild(block);
  if (!overflows(body)) return null;

  const splitRoot = block.querySelector("[data-split-text]");
  if (!splitRoot) {
    body.removeChild(block);
    return block;
  }

  const full = splitRoot.textContent;
  splitRoot.textContent = "";
  if (overflows(body)) {
    splitRoot.textContent = full;
    body.removeChild(block);
    return block;
  }

  let lo = 0;
  let hi = full.length;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    splitRoot.textContent = full.slice(0, mid);
    if (!overflows(body)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (best < 24) {
    splitRoot.textContent = full;
    body.removeChild(block);
    return block;
  }

  const cut = cutIndex(full, best);
  splitRoot.textContent = full.slice(0, cut).trimEnd();
  const leftoverText = full.slice(cut).trim();
  if (!leftoverText) return null;
  return createContinuation(block, leftoverText);
}

function createPage({ footerHtml, isFirst, firstNodes, continueHead, linesHead, withCols }) {
  const page = document.createElement("main");
  page.className = "sheet sheet-page";
  const body = document.createElement("div");
  body.className = "sheet-body";
  if (isFirst) {
    firstNodes.forEach(node => body.appendChild(node));
  } else if (continueHead) {
    const head = continueHead.cloneNode(true);
    head.removeAttribute("data-page-first");
    const badge = head.querySelector("span");
    if (badge) badge.textContent = "SUITE";
    body.appendChild(head);
  }
  if (withCols && linesHead) body.appendChild(linesHead.cloneNode(true));
  const footer = document.createElement("footer");
  footer.className = "note";
  footer.innerHTML = footerHtml;
  page.append(body, footer);
  return { page, body };
}

function hasPriceRow(node) {
  return Boolean(node?.querySelector?.(".article-main"));
}

function attachColumnHead(body, linesHead, block) {
  if (!linesHead || !block?.parentNode || !hasPriceRow(block) || body.querySelector(".lines-head")) return;
  body.insertBefore(linesHead.cloneNode(true), block);
}

function paginateFlowSheet(sheet) {
  const parent = sheet.parentNode;
  if (!parent) return;

  const continueHead = sheet.querySelector("[data-continue-head]")?.cloneNode(true);
  const linesHead = sheet.querySelector(".lines-head")?.cloneNode(true);
  const footerHtml = sheet.querySelector(".note")?.innerHTML || "<span></span><span></span><span class=\"page-num\"></span>";
  const firstNodes = [...sheet.querySelectorAll(":scope > [data-page-first]")];
  const queue = [...sheet.querySelectorAll(":scope > [data-flow-block]")];
  const pages = [];

  let guard = 0;
  while (queue.length && guard < MAX_PAGES) {
    const { page, body } = createPage({
      footerHtml,
      isFirst: pages.length === 0,
      firstNodes: pages.length === 0 ? firstNodes : [],
      continueHead,
      linesHead,
      withCols: pages.length === 0 && hasPriceRow(queue[0]),
    });
    parent.insertBefore(page, sheet);

    let placed = 0;
    while (queue.length) {
      const block = queue.shift();
      const leftover = appendFitting(body, block);
      if (leftover === block) {
        queue.unshift(block);
        break;
      }
      attachColumnHead(body, linesHead, block);
      placed += 1;
      if (!leftover) continue;
      queue.unshift(leftover);
      break;
    }

    if (placed === 0 && queue.length) {
      const forced = queue.shift();
      const leftover = appendFitting(body, forced);
      if (forced.parentNode) attachColumnHead(body, linesHead, forced);
      if (leftover === forced && !forced.parentNode) body.appendChild(forced);
      else if (leftover && leftover !== forced) queue.unshift(leftover);
    }

    pages.push(page);
    guard += 1;
  }

  const total = Math.max(1, pages.length);
  pages.forEach((page, index) => {
    const label = page.querySelector(".page-num");
    if (label) label.textContent = `Page ${index + 1}/${total}`;
  });

  sheet.remove();
}

export function paginateFlowSheets(host) {
  if (!host?.querySelectorAll) return 0;
  const sheets = [...host.querySelectorAll(".sheet-flow")];
  sheets.forEach(paginateFlowSheet);
  return sheets.length;
}
