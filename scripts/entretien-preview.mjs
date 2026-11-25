#!/usr/bin/env node
import { readFileSync } from "fs";
import { inspectXlsxMapping, previewEntretienImport, rowsFromXlsx, SOURCE_KIND } from "../app/lib/entretien-import.js";

const yildizPath = process.argv[2] || "/Users/khaled/Downloads/contrat entretiens YILDIZ.xlsx";
const rebeccaPath = process.argv[3] || "/Users/khaled/Downloads/CONTRATS ENTRETIENS à compter du 25_10_23.xlsx";
const yildizBuf = readFileSync(yildizPath);
const rebeccaBuf = readFileSync(rebeccaPath);
const yildiz = rowsFromXlsx(yildizBuf, SOURCE_KIND.yildiz);
const rebecca = rowsFromXlsx(rebeccaBuf, SOURCE_KIND.rebecca);
const preview = previewEntretienImport({ yildiz, rebecca, clients: [] });
console.log(JSON.stringify({
  written: false,
  yildiz: yildiz.length,
  rebecca: rebecca.length,
  mappings: {
    yildiz: inspectXlsxMapping(yildizBuf, SOURCE_KIND.yildiz),
    rebecca: inspectXlsxMapping(rebeccaBuf, SOURCE_KIND.rebecca),
  },
  counts: preview.counts,
  sample: preview.items.slice(0, 3).map(item => ({
    name: item.displayName,
    sources: item.sources,
    contractNumber: item.contractNumber,
    signed: item.signed,
    amountHt: item.amountHt,
  })),
}, null, 2));
