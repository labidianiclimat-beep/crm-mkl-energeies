"use client";

import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { commercialDocPreview } from "../lib/article-commercial-doc";
import { applyAnnexChoices, devisAnnexChoices } from "../lib/devis-annex-choices";
import { openDevisPrintWindow } from "../lib/devis-print";
import { useCompany } from "../lib/use-company";

export default function DevisAnnexPicker({
  doc,
  articles = [],
  clients = [],
  filename,
  toast,
  onClose,
}) {
  const { company, loaded } = useCompany();
  const [choices, setChoices] = useState([]);
  const [thumbs, setThumbs] = useState({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const source = useRef({ doc, articles, company });
  source.current = { doc, articles, company };

  useEffect(() => {
    if (!loaded) return undefined;
    let cancelled = false;
    const current = source.current;
    const next = devisAnnexChoices(current.doc, current.articles, current.company);
    setChoices(next);
    (async () => {
      const previews = {};
      for (const choice of next) {
        if (choice.thumb && !choice.dataUrl) {
          previews[choice.id] = choice.thumb;
          continue;
        }
        if (!choice.dataUrl) continue;
        try {
          previews[choice.id] = await commercialDocPreview(choice.dataUrl);
        } catch {
          previews[choice.id] = "";
        }
      }
      if (!cancelled) setThumbs(previews);
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  function toggle(id) {
    setChoices(current => current.map(item => (
      item.id === id ? { ...item, checked: !item.checked } : item
    )));
  }

  async function print() {
    setBusy(true);
    setNotice("");
    try {
      await openDevisPrintWindow(applyAnnexChoices(doc, choices), {
        clients,
        articles,
        company,
        toast,
        filename,
      });
    } catch (error) {
      setNotice(String(error?.message || "Impression impossible"));
    } finally {
      setBusy(false);
    }
  }

  const checkedCount = choices.filter(item => item.checked).length;

  return (
    <div className="devis-annex-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section className="devis-annex-dialog" role="dialog" aria-modal="true" aria-label="Documents à imprimer avec le devis" onMouseDown={event => event.stopPropagation()}>
        <header>
          <div>
            <p>AVANT IMPRESSION</p>
            <h2>Documents du devis</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </header>
        <p className="devis-annex-lead">Le devis est toujours imprimé. Cochez les documents à ajouter derrière.</p>
        {!loaded && <p className="devis-annex-empty">Préparation des documents…</p>}
        {loaded && choices.length === 0 && (
          <p className="devis-annex-empty">Aucun document annexe pour ce devis. Vous pouvez imprimer le devis seul.</p>
        )}
        {choices.length > 0 && (
          <ul className="devis-annex-grid">
            {choices.map(choice => (
              <li key={choice.id}>
                <div className={choice.checked ? "is-on" : ""} onClick={() => toggle(choice.id)}>
                  <span className="devis-annex-thumb">
                    {thumbs[choice.id]
                      ? <img src={thumbs[choice.id]} alt="" />
                      : <em>Aperçu</em>}
                  </span>
                  <strong>{choice.title}</strong>
                  <small>{choice.detail}</small>
                  <label onClick={event => event.stopPropagation()}>
                    <input type="checkbox" checked={choice.checked} onChange={() => toggle(choice.id)} />
                    Joindre à l’impression
                  </label>
                </div>
              </li>
            ))}
          </ul>
        )}
        {notice && <p className="devis-annex-notice">{notice}</p>}
        <footer>
          <button type="button" onClick={onClose}>Fermer</button>
          <button type="button" className="primary" disabled={busy || !loaded} onClick={print}>
            <Download size={16} />{busy ? "Préparation…" : checkedCount ? `Imprimer le devis + ${checkedCount} document${checkedCount > 1 ? "s" : ""}` : "Imprimer le devis"}
          </button>
        </footer>
      </section>
    </div>
  );
}
