export const DOCUMENT_CLOSING_CSS = `
.document-closing{margin-top:6mm}
.document-closing-meta{display:grid;grid-template-columns:1fr 1fr;gap:6mm;max-width:120mm}
.document-closing-meta p,.document-closing-meta label{display:flex;flex-direction:column;gap:2px;margin:0}
.document-closing-meta span,.document-closing-signs span{font-size:8px;font-weight:700;color:#52617d;text-transform:uppercase;letter-spacing:.04em}
.document-closing-meta b{min-height:8mm;border:1px solid #bfc9dc;border-radius:1.5mm;padding:2mm 2.5mm;background:#fbfcff;font:700 10px Arial;color:#233252}
.document-closing-signs{display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin-top:4mm;align-items:end}
.document-closing-signs.is-single{grid-template-columns:1fr}
.document-closing-signs img{display:block;width:100%;max-height:32mm;object-fit:contain;border:1px solid #c4cedf;border-radius:2mm;background:#fff}
.document-closing-signs .empty{height:32mm;border:1px dashed #c4cedf;border-radius:2mm}
`;

export function documentClosingHtml({ place = "", date = "", signatures = "", single = false } = {}) {
  return `<div class="document-closing"><div class="document-closing-meta"><p><span>Fait à</span><b>${place || "—"}</b></p><p><span>Le</span><b>${date || "—"}</b></p></div><div class="document-closing-signs${single ? " is-single" : ""}">${signatures}</div></div>`;
}
