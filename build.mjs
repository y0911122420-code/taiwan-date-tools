// build.mjs — 由單一原始檔 index.html 產生 /en/ /id/ /vi/ 各自獨立網址的靜態 HTML。
// 每個子頁把該語言的 title/description/OG/內文都預先翻好寫進 HTML，讓 Google 索引得到，
// 並用 hreflang 互相標註。執行：node build.mjs
//
// 作法：讀 index.html → 取出內嵌的 I18N 字典 → 對 data-i18n / data-i18n-ph 元素做替換，
// 覆寫 <html lang>、title、description、og:*、twitter:*、canonical，注入 window.__PAGE_LANG__。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, 'index.html');
const BASE = 'https://y0911122420-code.github.io/taiwan-date-tools/';

// 各語言的 <html lang>、og:locale，以及聚焦在台移工關鍵字（民國↔西元、居留證 ARC、農曆、護照效期）的 title/description
const META = {
  en: {
    htmlLang: 'en', ogLocale: 'en_US',
    title: 'Taiwan Date Tools｜ROC↔Gregorian Year Converter, Lunar Calendar, Working Days, Passport Validity',
    desc: 'Free Taiwan date tools: convert ROC (Minguo) ↔ Gregorian years for ARC / residence documents, Lunar birthday to Gregorian, working-day & national-holiday calculator, 2026 leave planner, and passport validity checker. Works on mobile, instant results.',
    ogTitle: 'Taiwan Date Tools｜ROC↔Gregorian, Lunar Calendar, Working Days, Passport Validity',
    ogDesc: 'Free tools for life in Taiwan: ROC↔Gregorian year conversion (ARC docs), Lunar-to-Gregorian birthday, working days with national holidays, 2026 leave planner, passport validity. Mobile-friendly, instant.',
  },
  id: {
    htmlLang: 'id', ogLocale: 'id_ID',
    title: 'Alat Tanggal Taiwan｜Konversi Tahun ROC↔Masehi, Kalender Imlek, Hari Kerja, Masa Berlaku Paspor',
    desc: 'Alat tanggal Taiwan gratis: konversi tahun ROC (Minguo) ↔ Masehi untuk ARC / dokumen izin tinggal, ulang tahun Imlek ke Masehi, kalkulator hari kerja & hari libur nasional, rencana cuti 2026, dan cek masa berlaku paspor. Bisa di HP, hasil instan.',
    ogTitle: 'Alat Tanggal Taiwan｜ROC↔Masehi, Imlek, Hari Kerja, Masa Berlaku Paspor',
    ogDesc: 'Alat gratis untuk hidup di Taiwan: konversi tahun ROC↔Masehi (dokumen ARC), ulang tahun Imlek ke Masehi, hari kerja dengan libur nasional, rencana cuti 2026, cek paspor. Cocok di HP, instan.',
  },
  vi: {
    htmlLang: 'vi', ogLocale: 'vi_VN',
    title: 'Công cụ Ngày tháng Đài Loan｜Đổi năm Dân Quốc↔Dương lịch, Âm lịch, Ngày làm việc, Hạn hộ chiếu',
    desc: 'Công cụ ngày tháng Đài Loan miễn phí: đổi năm Dân Quốc (ROC) ↔ Dương lịch cho thẻ cư trú ARC / giấy tờ, đổi sinh nhật Âm lịch sang Dương lịch, tính ngày làm việc & ngày lễ quốc gia, kế hoạch nghỉ 2026, kiểm tra hạn hộ chiếu. Dùng tốt trên điện thoại, kết quả tức thì.',
    ogTitle: 'Công cụ Ngày tháng Đài Loan｜Dân Quốc↔Dương lịch, Âm lịch, Ngày làm việc, Hạn hộ chiếu',
    ogDesc: 'Công cụ miễn phí cho cuộc sống ở Đài Loan: đổi năm Dân Quốc↔Dương lịch (giấy tờ ARC), sinh nhật Âm lịch sang Dương lịch, ngày làm việc kèm ngày lễ, kế hoạch nghỉ 2026, kiểm tra hộ chiếu. Hợp điện thoại, tức thì.',
  },
};

const src = readFileSync(SRC, 'utf8');

// ---- 1) 取出內嵌的 I18N 字典（用大括號配對，不靠 eval 全檔）----
function extractI18N(html) {
  const marker = 'const I18N = {';
  const start = html.indexOf(marker);
  if (start < 0) throw new Error('找不到 I18N 字典');
  let i = start + marker.length - 1; // 指向第一個 '{'
  let depth = 0, inStr = false, quote = '', esc = false;
  for (; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) { esc = false; }
      else if (c === '\\') { esc = true; }
      else if (c === quote) { inStr = false; }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = true; quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  const objText = html.slice(start + 'const I18N = '.length, i); // 從 '{' 到對應 '}'
  // 以函式包裝求值，避免污染全域
  return (new Function('return (' + objText + ');'))();
}

const I18N = extractI18N(src);

const escAttr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const escText = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function buildLang(lang) {
  const dict = I18N[lang] || {};
  const zh = I18N.zh || {};
  const meta = META[lang];
  const pageUrl = BASE + lang + '/';
  // 取翻譯值：優先該語言，缺則回退 zh；再缺回退 null（保留原內容）
  const pick = key => (dict[key] != null ? dict[key] : (zh[key] != null ? zh[key] : null));

  let html = src;

  // 1) <html lang>
  html = html.replace(/<html lang="zh-Hant">/, `<html lang="${meta.htmlLang}">`);

  // 2) <title>
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escText(meta.title)}</title>`);

  // 3) meta description
  html = html.replace(/(<meta name="description" content=")[\s\S]*?(">)/, `$1${escAttr(meta.desc)}$2`);

  // 4) Open Graph
  html = html.replace(/(<meta property="og:locale" content=")[^"]*(">)/, `$1${meta.ogLocale}$2`);
  html = html.replace(/(<meta property="og:title" content=")[\s\S]*?(">)/, `$1${escAttr(meta.ogTitle)}$2`);
  html = html.replace(/(<meta property="og:description" content=")[\s\S]*?(">)/, `$1${escAttr(meta.ogDesc)}$2`);
  html = html.replace(/(<meta property="og:url" content=")[^"]*(">)/, `$1${pageUrl}$2`);

  // 5) Twitter
  html = html.replace(/(<meta name="twitter:title" content=")[\s\S]*?(">)/, `$1${escAttr(meta.ogTitle)}$2`);
  html = html.replace(/(<meta name="twitter:description" content=")[\s\S]*?(">)/, `$1${escAttr(meta.ogDesc)}$2`);

  // 6) canonical 改為子頁自身
  html = html.replace(/(<link rel="canonical" href=")[^"]*(">)/, `$1${pageUrl}$2`);

  // 7) 注入 window.__PAGE_LANG__（在 </head> 前，早於主 script 執行）
  html = html.replace(/<\/head>/, `<script>window.__PAGE_LANG__='${lang}';</script>\n</head>`);

  // 8) data-i18n 元素：替換內文（同名標籤不巢狀，用反向參照配對關閉標籤）
  html = html.replace(
    /<([a-zA-Z0-9]+)([^>]*\sdata-i18n="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/g,
    (m, tag, attrs, key, inner) => {
      const v = pick(key);
      return v == null ? m : `<${tag}${attrs}>${v}</${tag}>`;
    }
  );

  // 9) data-i18n-ph 元素：替換 placeholder（或補上）
  html = html.replace(
    /<[a-zA-Z0-9]+[^>]*\sdata-i18n-ph="([^"]+)"[^>]*>/g,
    (tag, key) => {
      const v = pick(key);
      if (v == null) return tag;
      if (/\splaceholder="/.test(tag)) {
        return tag.replace(/(\splaceholder=")[^"]*(")/, `$1${escAttr(v)}$2`);
      }
      return tag.replace(/>\s*$/, ` placeholder="${escAttr(v)}">`);
    }
  );

  // 輸出到 <lang>/index.html
  const outDir = join(__dirname, lang);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.html'), html, 'utf8');
  return html;
}

for (const lang of Object.keys(META)) {
  buildLang(lang);
  console.log(`✓ 產出 /${lang}/index.html`);
}
console.log('完成。');
