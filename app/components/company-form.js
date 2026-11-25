"use client";

import { useEffect, useState } from "react";
import { Building2, FilePlus2, Save, X } from "lucide-react";
import DocumentParties from "./document-parties";
import { authFetch } from "../lib/supabase-rest";
import { companyHasCgv, DEFAULT_COMPANY, formatSiret, sanitizeCompany, validateCompanyPayload } from "../lib/company";
import { COMMERCIAL_DOC_MAX_BYTES } from "../lib/article-commercial-doc";

export default function CompanyView({ toast }) {
  const [draft, setDraft] = useState(DEFAULT_COMPANY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await authFetch("/api/company");
        const data = await response.json().catch(() => ({}));
        if (!cancelled && response.ok && data.company) setDraft(sanitizeCompany(data.company));
      } catch {
        // défaut MKL
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function patch(changes) {
    setDraft(current => ({ ...current, ...changes }));
  }

  async function save(event) {
    event.preventDefault();
    const company = sanitizeCompany(draft);
    const errors = validateCompanyPayload(company);
    if (errors.length) {
      toast?.(errors[0]);
      return;
    }
    setSaving(true);
    try {
      const response = await authFetch("/api/company", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Enregistrement impossible");
      setDraft(sanitizeCompany(data.company || company));
      toast?.("Fiche entreprise enregistrée — elle figure désormais à gauche du client sur les formulaires et PDF.");
    } catch (error) {
      toast?.(String(error?.message || "Enregistrement impossible"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="module-content">
      <div className="module-top">
        <div>
          <p>ADMIN VIP</p>
          <h1>Entreprise</h1>
          <span>Nom, SIRET, TVA, capital et adresse affichés à gauche du client sur les documents.</span>
        </div>
      </div>
      <form className="company-form" onSubmit={save}>
        <section className="company-form-card">
          <header>
            <Building2 size={18} />
            <div>
              <b>Mentions documents</b>
              <span>Nom, SIRET, TVA, capital et adresse</span>
            </div>
          </header>
          <div className="company-form-grid">
            <label>Nom de l’entreprise<input value={draft.legalName} onChange={e => patch({ legalName: e.target.value, tradeName: e.target.value })} required disabled={!loaded}/></label>
            <label>SIRET<input value={formatSiret(draft.siret)} onChange={e => patch({ siret: e.target.value })} inputMode="numeric" placeholder="14 chiffres" disabled={!loaded}/></label>
            <label>N° TVA<input value={draft.vatNumber} onChange={e => patch({ vatNumber: e.target.value })} placeholder="FR…" disabled={!loaded}/></label>
            <label>Capital<input value={draft.capital} onChange={e => patch({ capital: e.target.value })} placeholder="10 000 €" disabled={!loaded}/></label>
            <label className="wide">Adresse<input value={draft.address} onChange={e => patch({ address: e.target.value })} placeholder="30 Rue des Tuileries" disabled={!loaded}/></label>
            <label>Code postal<input value={draft.postalCode} onChange={e => patch({ postalCode: e.target.value })} inputMode="numeric" placeholder="67460" disabled={!loaded}/></label>
            <label>Ville<input value={draft.city} onChange={e => patch({ city: e.target.value })} placeholder="Souffelweyersheim" disabled={!loaded}/></label>
          </div>
        </section>
        <section className="company-form-card">
          <header>
            <FilePlus2 size={18} />
            <div>
              <b>Conditions générales</b>
              <span>Si un PDF est déposé ici, il est imprimé automatiquement avec chaque devis, sans case à cocher.</span>
            </div>
          </header>
          <div className="article-pdf-attach">
            <input
              type="file"
              accept="application/pdf,image/*"
              hidden
              id="company-cgv-file"
              onChange={async event => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                if (file.size > COMMERCIAL_DOC_MAX_BYTES) {
                  toast?.("PDF trop lourd (1,8 Mo max).");
                  return;
                }
                const data = await new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(String(reader.result || ""));
                  reader.onerror = () => reject(new Error("Lecture impossible"));
                  reader.readAsDataURL(file);
                }).catch(() => "");
                if (data) patch({ cgvName: file.name, cgvData: data });
              }}
            />
            <div className="article-pdf-attach-actions">
              <button type="button" className="primary" onClick={() => document.getElementById("company-cgv-file")?.click()} disabled={!loaded}>
                <FilePlus2 size={16} />{draft.cgvName ? "Remplacer le PDF" : "Ajouter le PDF"}
              </button>
              {companyHasCgv(draft) ? (
                <button type="button" className="secondary" onClick={() => patch({ cgvName: "", cgvData: "" })}>
                  <X size={16} /> Retirer
                </button>
              ) : null}
            </div>
            <em>{draft.cgvName ? `Document lié : ${draft.cgvName}` : "Aucun PDF pour le moment."}</em>
          </div>
        </section>
        <section className="company-form-card">
          <header>
            <Building2 size={18} />
            <div>
              <b>Aperçu documents</b>
              <span>Entreprise à gauche, client à droite — couleurs MKL</span>
            </div>
          </header>
          <DocumentParties
            company={draft}
            clientName="Client exemple"
            clientContact="Jean Dupont"
            clientAddress="12 rue des Énergies · 67000 Strasbourg"
            clientPhone="06 00 00 00 00"
            clientEmail="client@exemple.fr"
          />
        </section>
        <button className="primary" type="submit" disabled={!loaded || saving}>
          <Save size={17} />{saving ? "Enregistrement…" : "Enregistrer l’entreprise"}
        </button>
      </form>
    </div>
  );
}
