import { CATALOGUE_RADIATEURS } from "./data/catalogue-radiateurs.js";

const root = document.getElementById("catalogue-book");
if (!root) {
  /* page sans livre */
} else {
  const pages = Array.isArray(CATALOGUE_RADIATEURS.pages)
    ? CATALOGUE_RADIATEURS.pages.filter((p) => p?.src)
    : [];

  let index = 0;
  let busy = false;
  /** @type {HTMLImageElement[]} */
  const preloadCache = [];

  function clamp(i) {
    return Math.max(0, Math.min(i, pages.length - 1));
  }

  function preload(i) {
    const p = pages[clamp(i)];
    if (!p?.src) return;
    if (preloadCache.some((img) => img.src.endsWith(p.src) || img.getAttribute("data-src") === p.src)) {
      return;
    }
    const img = new Image();
    img.setAttribute("data-src", p.src);
    img.src = p.src;
    preloadCache.push(img);
  }

  function renderShell() {
    if (pages.length === 0) {
      root.innerHTML = `
        <div class="book book--empty">
          <p class="book__empty-title">Catalogue en cours d’ajout</p>
          <p class="book__empty-text">Les pages du catalogue seront affichées ici.</p>
        </div>`;
      return;
    }

    root.innerHTML = `
      <div class="book book--turn" role="region" aria-label="${CATALOGUE_RADIATEURS.title || "Catalogue"}">
        <div class="book__viewport">
          <div class="book__leaf is-under" data-role="under" aria-hidden="true">
            <img src="${pages[Math.min(1, pages.length - 1)].src}" alt="" draggable="false" />
          </div>
          <div class="book__leaf is-front" data-role="front">
            <img src="${pages[0].src}" alt="${pages[0].alt || "Page 1"}" draggable="false" />
          </div>
        </div>
        <div class="book__bar">
          <button type="button" class="book__nav book__nav--prev" data-book-prev aria-label="Page précédente">‹</button>
          <span class="book__count" data-book-count>Page 1 / ${pages.length}</span>
          <button type="button" class="book__nav book__nav--next" data-book-next aria-label="Page suivante">›</button>
        </div>
        <p class="book__hint">Une page à la fois — flèches, clic, ou glisser.</p>
      </div>`;

    bind();
    syncUi();
    preload(1);
    preload(2);
  }

  function syncUi() {
    const count = root.querySelector("[data-book-count]");
    const prev = root.querySelector("[data-book-prev]");
    const next = root.querySelector("[data-book-next]");
    if (count) count.textContent = `Page ${index + 1} / ${pages.length}`;
    if (prev) prev.disabled = index <= 0 || busy;
    if (next) next.disabled = index >= pages.length - 1 || busy;
  }

  function frontLeaf() {
    return root.querySelector('[data-role="front"]');
  }

  function underLeaf() {
    return root.querySelector('[data-role="under"]');
  }

  function setImg(leaf, pageIndex, visibleAlt) {
    const img = leaf?.querySelector("img");
    const page = pages[pageIndex];
    if (!img || !page) return;
    if (img.getAttribute("src") !== page.src) img.src = page.src;
    img.alt = visibleAlt ? page.alt || `Page ${pageIndex + 1}` : "";
  }

  /**
   * Fin de tour sans clignotement :
   * la feuille du dessous (déjà visible) devient le front,
   * l’ancienne front est remise à plat hors écran puis repassée en under.
   */
  function settle(dir, target) {
    const viewport = root.querySelector(".book__viewport");
    const front = frontLeaf();
    const under = underLeaf();
    if (!viewport || !front || !under) return;

    index = target;

    // 1) Couper toute transition avant de toucher aux transforms
    front.classList.add("is-instant");
    under.classList.add("is-instant");

    // 2) Retirer l’état d’anim — front est encore à ±178°, on la cache
    viewport.classList.remove("is-turning-next", "is-turning-prev");
    front.classList.add("is-hidden");
    front.style.transform = "";
    front.style.transformOrigin = "";

    // 3) La page sous les yeux devient le front (aucun mouvement visible)
    under.classList.remove("is-under");
    under.classList.add("is-front");
    under.dataset.role = "front";
    under.removeAttribute("aria-hidden");
    setImg(under, index, true);

    front.classList.remove("is-front");
    front.classList.add("is-under");
    front.dataset.role = "under";
    front.setAttribute("aria-hidden", "true");
    setImg(front, clamp(index + 1), false);

    void front.offsetWidth;
    front.classList.remove("is-hidden", "is-instant");
    under.classList.remove("is-instant");

    preload(index + 1);
    preload(index + 2);
    preload(index - 1);

    busy = false;
    syncUi();
  }

  function go(dir) {
    if (busy) return;
    const target = clamp(index + dir);
    if (target === index) return;

    const viewport = root.querySelector(".book__viewport");
    const front = frontLeaf();
    const under = underLeaf();
    if (!viewport || !front || !under) return;

    busy = true;
    syncUi();

    // Préparer la page cible en dessous
    setImg(under, target, false);
    setImg(front, index, true);

    // Origine du flip selon le sens
    front.style.transformOrigin = dir > 0 ? "left center" : "right center";

    viewport.classList.remove("is-turning-next", "is-turning-prev");
    void viewport.offsetWidth;
    viewport.classList.add(dir > 0 ? "is-turning-next" : "is-turning-prev");

    let done = false;
    const complete = () => {
      if (done) return;
      done = true;
      front.removeEventListener("transitionend", onEnd);
      settle(dir, target);
    };

    const onEnd = (e) => {
      if (e.target !== front) return;
      if (e.propertyName && e.propertyName !== "transform") return;
      complete();
    };
    front.addEventListener("transitionend", onEnd);
    window.setTimeout(complete, 780);
  }

  function bind() {
    root.querySelector("[data-book-prev]")?.addEventListener("click", () => go(-1));
    root.querySelector("[data-book-next]")?.addEventListener("click", () => go(1));

    const viewport = root.querySelector(".book__viewport");
    let startX = 0;
    let tracking = false;

    viewport?.addEventListener("pointerdown", (e) => {
      if (busy) return;
      tracking = true;
      startX = e.clientX;
      viewport.setPointerCapture?.(e.pointerId);
    });
    viewport?.addEventListener("pointerup", (e) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.clientX - startX;
      if (Math.abs(dx) < 40) {
        const rect = viewport.getBoundingClientRect();
        const mid = rect.left + rect.width / 2;
        go(e.clientX >= mid ? 1 : -1);
        return;
      }
      go(dx < 0 ? 1 : -1);
    });

    document.addEventListener("keydown", (e) => {
      if (!root.offsetParent) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    });
  }

  renderShell();
}
