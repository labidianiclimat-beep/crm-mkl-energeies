"use client";

import { useEffect } from "react";
import { applyCommaInsertion } from "../lib/decimal-comma";

function isNumberInput(el) {
  return el instanceof HTMLInputElement && el.type === "number" && !el.readOnly && !el.disabled;
}

function writeNumber(el, next) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(el, next);
  else el.value = next;
  el.step = "any";
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function claim(el) {
  if (el.dataset.mklComma === "1") return false;
  el.dataset.mklComma = "1";
  queueMicrotask(() => { delete el.dataset.mklComma; });
  return true;
}

function loosen(form) {
  form?.querySelectorAll?.('input[type="number"]')?.forEach(el => {
    if (!el.readOnly && !el.disabled) el.step = "any";
  });
}

export default function DecimalComma() {
  useEffect(() => {
    function onKeyDown(event) {
      const el = event.target;
      if (!isNumberInput(el)) return;
      if (event.key === "Enter") {
        loosen(el.form);
        return;
      }
      if (event.key !== "," && event.key !== "Decimal") return;
      if (!claim(el)) return;
      event.preventDefault();
      writeNumber(el, applyCommaInsertion(el.value, ",", {
        selectionStart: el.selectionStart,
        selectionEnd: el.selectionEnd,
      }));
    }

    function onBeforeInput(event) {
      const el = event.target;
      if (!isNumberInput(el)) return;
      const data = event.data || "";
      if (!data.includes(",")) return;
      event.preventDefault();
      if (!claim(el)) return;
      writeNumber(el, applyCommaInsertion(el.value, data, {
        selectionStart: el.selectionStart,
        selectionEnd: el.selectionEnd,
        replaceAll: data.length > 1 && el.selectionStart == null,
      }));
    }

    function onPaste(event) {
      const el = event.target;
      if (!isNumberInput(el)) return;
      const text = event.clipboardData?.getData("text") || "";
      if (!text.includes(",")) return;
      event.preventDefault();
      if (!claim(el)) return;
      writeNumber(el, applyCommaInsertion("", text, { replaceAll: true }));
    }

    function onFocusIn(event) {
      if (isNumberInput(event.target)) event.target.step = "any";
    }

    function onClick(event) {
      const button = event.target?.closest?.("button, input[type=submit]");
      if (!button) return;
      loosen(button.form || button.closest?.("form"));
    }

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("beforeinput", onBeforeInput, true);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("beforeinput", onBeforeInput, true);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("click", onClick, true);
    };
  }, []);
  return null;
}
