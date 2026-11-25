/**
 * Bannière cookies MKL Énergies — Google Consent Mode v2
 * Ne charge aucun tag lui-même : met à jour gtag('consent') après choix utilisateur.
 * Textes FR/DE/EN via window.MKL_I18N quand disponible.
 */
(function () {
  const STORAGE_KEY = "mkl_consent_v1";

  function gtag() {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(arguments);
  }

  function tr(key, fallback) {
    try {
      if (window.MKL_I18N && typeof window.MKL_I18N.t === "function") {
        return window.MKL_I18N.t(key);
      }
    } catch {
      /* ignore */
    }
    return fallback;
  }

  function readChoice() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (typeof data.analytics !== "boolean" || typeof data.ads !== "boolean") return null;
      return data;
    } catch {
      return null;
    }
  }

  function persist(choice) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        analytics: !!choice.analytics,
        ads: !!choice.ads,
        updatedAt: new Date().toISOString(),
      })
    );
  }

  function applyConsent(choice) {
    const granted = "granted";
    const denied = "denied";
    gtag("consent", "update", {
      analytics_storage: choice.analytics ? granted : denied,
      ad_storage: choice.ads ? granted : denied,
      ad_user_data: choice.ads ? granted : denied,
      ad_personalization: choice.ads ? granted : denied,
    });
    window.dataLayer.push({
      event: "mkl_consent_update",
      mkl_analytics_consent: choice.analytics ? "granted" : "denied",
      mkl_ads_consent: choice.ads ? "granted" : "denied",
    });
  }

  function hideBanner(root) {
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
  }

  function showBanner(root) {
    applyBannerCopy(root);
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
  }

  function applyBannerCopy(root) {
    const title = root.querySelector("#cookie-banner-title");
    const text = root.querySelector(".cookie-banner__text");
    const deny = root.querySelector('[data-consent="deny"]');
    const accept = root.querySelector('[data-consent="accept"]');
    if (title) title.textContent = tr("cookies.title", "Cookies & mesure d’audience");
    if (text) {
      text.textContent = tr(
        "cookies.text",
        "Nous utilisons Google Tag Manager pour mesurer l’audience et, le cas échéant, la publicité. Par défaut, les cookies analytiques et publicitaires sont refusés. Vous pouvez accepter ou refuser."
      );
    }
    if (deny) deny.textContent = tr("cookies.deny", "Refuser");
    if (accept) accept.textContent = tr("cookies.accept", "Tout accepter");
  }

  function buildBanner() {
    const root = document.createElement("div");
    root.id = "cookie-banner";
    root.className = "cookie-banner";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "false");
    root.setAttribute("aria-labelledby", "cookie-banner-title");
    root.hidden = true;
    root.innerHTML = `
      <div class="cookie-banner__inner">
        <div class="cookie-banner__copy">
          <p id="cookie-banner-title" class="cookie-banner__title"></p>
          <p class="cookie-banner__text"></p>
        </div>
        <div class="cookie-banner__actions">
          <button type="button" class="cookie-banner__btn cookie-banner__btn--ghost" data-consent="deny"></button>
          <button type="button" class="cookie-banner__btn cookie-banner__btn--primary" data-consent="accept"></button>
        </div>
      </div>`;
    applyBannerCopy(root);
    document.body.appendChild(root);
    return root;
  }

  function onChoice(root, choice) {
    persist(choice);
    applyConsent(choice);
    hideBanner(root);
  }

  function init() {
    const root = buildBanner();
    root.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-consent]");
      if (!btn) return;
      if (btn.getAttribute("data-consent") === "accept") {
        onChoice(root, { analytics: true, ads: true });
      } else {
        onChoice(root, { analytics: false, ads: false });
      }
    });

    document.querySelectorAll("[data-open-cookies]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        showBanner(root);
      });
    });

    if (window.MKL_I18N && typeof window.MKL_I18N.onLangChange === "function") {
      window.MKL_I18N.onLangChange(() => applyBannerCopy(root));
    }

    const existing = readChoice();
    if (!existing) {
      showBanner(root);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
