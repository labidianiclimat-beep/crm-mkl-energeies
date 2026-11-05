"use client";

import { useMemo, useState } from "react";
import {
  Layers3,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { authFetch } from "../lib/supabase-rest";
import { PICKER_ICONS } from "../lib/article-picker";

export default function CatalogTaxonomyAdmin({
  categories = [],
  setCategories,
  subcategories = [],
  setSubcategories,
  articles = [],
  query = "",
  toast,
}) {
  const [localQuery, setLocalQuery] = useState("");
  const [form, setForm] = useState(null);

  const search = `${query || ""} ${localQuery || ""}`.trim().toLowerCase();
  const visibleCategories = useMemo(
    () =>
      categories.filter(category =>
        !search || `${category.name} ${category.description || ""} ${category.status || ""}`.toLowerCase().includes(search)
      ),
    [categories, search]
  );

  function articleCount(category, subcategory) {
    return articles.filter(article => {
      if (subcategory) {
        return (
          (article.subcategoryId && article.subcategoryId === subcategory.id) ||
          (article.subcategory || "") === subcategory.name
        );
      }
      return (
        (article.categoryId && article.categoryId === category.id) ||
        article.category === category.name
      );
    }).length;
  }

  function openCreateCategory() {
    setForm({ kind: "category", name: "", description: "", icon: "Package", sortOrder: 100, status: "Actif" });
  }

  function openEditCategory(category) {
    setForm({
      kind: "category",
      id: category.id,
      name: category.name,
      description: category.description || "",
      icon: category.icon || "Package",
      sortOrder: category.sortOrder ?? 100,
      status: category.status || "Actif",
    });
  }

  function openCreateSubcategory(category) {
    setForm({
      kind: "subcategory",
      categoryId: category.id,
      categoryName: category.name,
      name: "",
      description: "",
      sortOrder: 100,
      status: "Actif",
    });
  }

  function openEditSubcategory(subcategory, category) {
    setForm({
      kind: "subcategory",
      id: subcategory.id,
      categoryId: subcategory.categoryId || category.id,
      categoryName: category.name,
      name: subcategory.name,
      description: subcategory.description || "",
      sortOrder: subcategory.sortOrder ?? 100,
      status: subcategory.status || "Actif",
    });
  }

  async function saveForm(event) {
    event.preventDefault();
    if (!form) return;
    const isCategory = form.kind === "category";
    const payload = isCategory
      ? {
          name: form.name,
          description: form.description,
          icon: form.icon,
          sortOrder: Number(form.sortOrder || 100),
          status: form.status,
        }
      : {
          name: form.name,
          description: form.description,
          categoryId: form.categoryId,
          sortOrder: Number(form.sortOrder || 100),
          status: form.status,
        };
    const base = isCategory ? "/api/article-categories" : "/api/article-subcategories";
    const url = form.id ? `${base}/${form.id}` : base;
    try {
      const response = await authFetch(url, {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Enregistrement impossible");
      if (isCategory) {
        const saved = data.category;
        setCategories(current => {
          const next = form.id
            ? current.map(item => (item.id === saved.id ? saved : item))
            : [saved, ...current.filter(item => item.id !== saved.id)];
          return [...next].sort((a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100) || a.name.localeCompare(b.name, "fr"));
        });
        toast(form.id ? "Catégorie enregistrée" : "Catégorie créée");
      } else {
        const saved = data.subcategory;
        setSubcategories(current => {
          const next = form.id
            ? current.map(item => (item.id === saved.id ? saved : item))
            : [saved, ...current.filter(item => item.id !== saved.id)];
          return [...next].sort((a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100) || a.name.localeCompare(b.name, "fr"));
        });
        toast(form.id ? "Sous-catégorie enregistrée" : "Sous-catégorie créée");
      }
      setForm(null);
    } catch (error) {
      toast(String(error?.message || "Enregistrement impossible"));
    }
  }

  async function toggleActive(kind, item, active) {
    const base = kind === "category" ? "/api/article-categories" : "/api/article-subcategories";
    const label = kind === "category" ? "catégorie" : "sous-catégorie";
    if (!active && !window.confirm(`Désactiver la ${label} « ${item.name} » ?`)) return;
    try {
      const response = await authFetch(`${base}/${item.id}`, {
        method: active ? "PATCH" : "DELETE",
        headers: active ? { "Content-Type": "application/json" } : undefined,
        body: active ? JSON.stringify({ status: "Actif" }) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Mise à jour impossible");
      const saved = kind === "category" ? data.category : data.subcategory;
      if (kind === "category") setCategories(current => current.map(row => (row.id === item.id ? saved || { ...row, status: "Inactif", active: false } : row)));
      else setSubcategories(current => current.map(row => (row.id === item.id ? saved || { ...row, status: "Inactif", active: false } : row)));
      toast(active ? `${label[0].toUpperCase()}${label.slice(1)} réactivée` : `${label[0].toUpperCase()}${label.slice(1)} désactivée`);
    } catch (error) {
      toast(String(error?.message || "Mise à jour impossible"));
    }
  }

  async function hardDelete(kind, item) {
    const base = kind === "category" ? "/api/article-categories" : "/api/article-subcategories";
    const label = kind === "category" ? "catégorie" : "sous-catégorie";
    if (!window.confirm(`Supprimer définitivement « ${item.name} » ?`)) return;
    try {
      const response = await authFetch(`${base}/${item.id}?hard=1`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Suppression impossible");
      if (kind === "category") {
        setCategories(current => current.filter(row => row.id !== item.id));
        setSubcategories(current => current.filter(row => row.categoryId !== item.id));
      } else {
        setSubcategories(current => current.filter(row => row.id !== item.id));
      }
      toast(`${label[0].toUpperCase()}${label.slice(1)} supprimée`);
    } catch (error) {
      toast(String(error?.message || "Suppression impossible"));
    }
  }

  return (
    <div className="module-content taxonomy-admin">
      <div className="module-top">
        <div>
          <p>ORGANISATION DU CATALOGUE</p>
          <h1>Catégories & sous-catégories</h1>
          <span>{categories.length} familles • {subcategories.length} sous-catégories — utilisées dans le parcours devis</span>
        </div>
        <div className="module-actions">
          <button type="button" className="primary" onClick={openCreateCategory}>
            <Plus size={17} />Nouvelle catégorie
          </button>
        </div>
      </div>
      <div className="catalogue-search">
        <Search size={17} />
        <input value={localQuery} onChange={e => setLocalQuery(e.target.value)} placeholder="Rechercher une catégorie…" />
        <span>{visibleCategories.length}</span>
      </div>
      {!categories.length && (
        <div className="quote-empty">
          <Layers3 size={20} />
          <span>Aucune catégorie en base — créez Climatisation, Isolation, Photovoltaïque…</span>
        </div>
      )}
      <div className="category-tree">
        {visibleCategories.map(category => {
          const children = subcategories.filter(item => item.categoryId === category.id);
          return (
            <div className="category-block" key={category.id}>
              <div className="category-main">
                <div className="group-icon"><Layers3 size={20} /></div>
                <div>
                  <span>{category.status || "Actif"}</span>
                  <h3>{category.name}</h3>
                  <p>{category.description || "Famille du parcours devis"}</p>
                </div>
                <b>{articleCount(category)} article(s)</b>
              </div>
              <div className="taxonomy-actions">
                <button type="button" className="wizard-link" onClick={() => openEditCategory(category)}>Modifier</button>
                <button type="button" className="wizard-link" onClick={() => openCreateSubcategory(category)}>Sous-catégorie</button>
                {category.status === "Inactif"
                  ? <button type="button" className="wizard-link" onClick={() => toggleActive("category", category, true)}>Réactiver</button>
                  : <button type="button" className="wizard-link" onClick={() => toggleActive("category", category, false)}>Désactiver</button>}
                <button type="button" className="wizard-link danger" onClick={() => hardDelete("category", category)}>Supprimer</button>
              </div>
              <div className="subcategory-list">
                {children.map(sub => (
                  <div key={sub.id}>
                    <span>{sub.status === "Inactif" ? "OFF" : "OK"}</span>
                    <b>{sub.name}</b>
                    <small>{articleCount(category, sub)} article(s)</small>
                    <div className="document-actions">
                      <button type="button" className="download-doc" onClick={() => openEditSubcategory(sub, category)} title="Modifier"><Pencil size={14} /></button>
                      {sub.status === "Inactif"
                        ? <button type="button" className="validate-quote" onClick={() => toggleActive("subcategory", sub, true)}>Réactiver</button>
                        : <button type="button" className="delete-article" onClick={() => toggleActive("subcategory", sub, false)} title="Désactiver"><Trash2 size={14} /></button>}
                    </div>
                  </div>
                ))}
                {!children.length && <p>Aucune sous-catégorie — ajoutez Mono-split, Isolation intérieure…</p>}
              </div>
            </div>
          );
        })}
      </div>

      {form && (
        <div className="backdrop" onMouseDown={e => e.target === e.currentTarget && setForm(null)}>
          <div className="modal" onMouseDown={e => e.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setForm(null)}><X /></button>
            <div className="modal-icon"><Package /></div>
            <h2>{form.id ? "Modifier" : "Nouvelle"} {form.kind === "category" ? "catégorie" : "sous-catégorie"}</h2>
            <p>
              {form.kind === "category"
                ? "Cette famille apparaîtra en première page du parcours devis."
                : `Rattachée à ${form.categoryName}.`}
            </p>
            <form onSubmit={saveForm}>
              <label>
                Nom
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder={form.kind === "category" ? "Ex. Climatisation" : "Ex. Console basse"} />
              </label>
              <label>
                Description
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Texte affiché sur la carte" />
              </label>
              {form.kind === "category" && (
                <label>
                  Icône
                  <select value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })}>
                    {PICKER_ICONS.map(icon => <option key={icon}>{icon}</option>)}
                  </select>
                </label>
              )}
              <div className="form-row">
                <label>
                  Ordre
                  <input type="number" value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: e.target.value })} />
                </label>
                <label>
                  Statut
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option>Actif</option>
                    <option>Inactif</option>
                  </select>
                </label>
              </div>
              <div className="modal-form-actions">
                <button className="primary submit" type="submit">{form.id ? "Enregistrer" : "Créer"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
