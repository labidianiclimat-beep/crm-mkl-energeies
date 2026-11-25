export function withDecimalComma(value) {
  return String(value ?? "").replace(/[\s\u00a0\u202f]/g, "").replace(/,/g, ".");
}

export function applyCommaInsertion(current, inserted, { selectionStart = null, selectionEnd = null, replaceAll = false } = {}) {
  const chunk = withDecimalComma(inserted);
  const value = String(current ?? "");
  if (!chunk) return value;
  if (replaceAll) return chunk;
  if (selectionStart == null) {
    if (chunk === "." && value.includes(".")) return value;
    return `${value}${chunk}`;
  }
  const start = selectionStart;
  const end = selectionEnd ?? start;
  const next = `${value.slice(0, start)}${chunk}${value.slice(end)}`;
  const dots = next.split(".").length - 1;
  if (chunk === "." && dots > 1) return value;
  return next;
}
