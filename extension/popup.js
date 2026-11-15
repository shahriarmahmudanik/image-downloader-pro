// Runs inside the page: collects image URLs and sizes.
function collectImages() {
  const found = new Map();
  const add = (url, w, h) => {
    if (!url || url.startsWith("data:image/gif;base64,R0lGODlhAQABA")) return;
    let abs;
    try { abs = new URL(url, document.baseURI).href; } catch { return; }
    if (!/^(https?:|data:image\/|blob:)/.test(abs)) return;
    const prev = found.get(abs);
    if (!prev || (w || 0) * (h || 0) > prev.w * prev.h) found.set(abs, { url: abs, w: w || 0, h: h || 0 });
  };
  const bestSrcset = (s) => {
    let best = null, bestW = -1;
    for (const part of s.split(",")) {
      const [u, d] = part.trim().split(/\s+/);
      const n = parseFloat(d) || 1;
      if (u && n > bestW) { best = u; bestW = n; }
    }
    return best;
  };

  document.querySelectorAll("img").forEach((img) => {
    const w = img.naturalWidth, h = img.naturalHeight;
    add(img.currentSrc || img.src, w, h);
    if (img.srcset) add(bestSrcset(img.srcset), w, h);
    for (const a of ["data-src", "data-original", "data-lazy-src", "data-srcset"]) {
      const v = img.getAttribute(a);
      if (v) add(a.endsWith("srcset") ? bestSrcset(v) : v, w, h);
    }
  });
  document.querySelectorAll("picture source[srcset]").forEach((s) => add(bestSrcset(s.srcset)));
  document.querySelectorAll("image").forEach((el) => add(el.getAttribute("href") || el.getAttribute("xlink:href")));
  document.querySelectorAll("*").forEach((el) => {
    const bg = getComputedStyle(el).backgroundImage;
    if (!bg || bg === "none") return;
    for (const m of bg.matchAll(/url\((['"]?)(.*?)\1\)/g)) add(m[2], el.clientWidth, el.clientHeight);
  });
  document.querySelectorAll('link[rel~="icon"], meta[property="og:image"]').forEach((el) =>
    add(el.href || el.content)
  );
  return [...found.values()];
}


// Runs inside the page: scrolls down until no more content loads, then returns to the top.
async function autoScroll(maxMs) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const start = Date.now();
  const y0 = window.scrollY;
  let last = -1, still = 0;
  while (Date.now() - start < maxMs) {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await sleep(700);
    const h = document.documentElement.scrollHeight;
    if (h === last) { if (++still >= 3) break; } else { still = 0; last = h; }
  }
  window.scrollTo(0, y0);
  return true;
}

const $ = (id) => document.getElementById(id);
const OPT_ORIGINS = { origins: ["https://*/*", "http://*/*"] };
const RASTER = ["jpg", "png", "webp"];
let images = [];
let tabId;
let host = "images";
const selected = new Set();

function typeOf(url) {
  const m = url.match(/^data:image\/(\w+)/) || url.split(/[?#]/)[0].match(/\.(\w{2,5})$/);
  const t = m ? m[1].toLowerCase() : "other";
  if (t === "jpeg" || t === "jpg") return "jpg";
  if (t === "svg" || t === "svg+xml") return "svg";
  return ["png", "webp", "gif"].includes(t) ? t : "other";
}

function visible() {
  const min = +$("minSize").value;
  const types = new Set([...document.querySelectorAll("[data-type]:checked")].map((c) => c.dataset.type));
  return images.filter((i) => types.has(i.type) && (!min || Math.max(i.w, i.h) >= min || (!i.w && !i.h)));
}

function render() {
  const list = visible();
  const grid = $("grid");
  grid.replaceChildren();
  $("scan").hidden = true;
  grid.hidden = list.length === 0;
  list.forEach((i) => {
    const d = document.createElement("div");
    d.className = "item" + (selected.has(i.url) ? " selected" : "");
    const img = document.createElement("img");
    img.src = i.url;
    img.loading = "lazy";
    img.addEventListener("load", () => {
      if (!i.w) { i.w = img.naturalWidth; i.h = img.naturalHeight; meta.textContent = label(i); }
    });
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = label(i);
    d.append(img, meta);
    d.addEventListener("click", () => {
      selected.has(i.url) ? selected.delete(i.url) : selected.add(i.url);
      d.classList.toggle("selected");
      updateButton();
    });
    grid.append(d);
  });
  $("empty").hidden = list.length > 0;
  $("count").textContent = `${list.length} of ${images.length} images`;
  updateButton();
}

const label = (i) => `${i.w && i.h ? `${i.w}×${i.h} · ` : ""}${i.type.toUpperCase()}`;

function updateButton() {
  const n = visible().filter((i) => selected.has(i.url)).length;
  $("dlLabel").textContent = `Download (${n})`;
  $("download").disabled = n === 0;
  $("bg").disabled = n === 0;
  $("fill").style.width = "0";
}

// Finds images on the page and merges them into the list. Returns how many were new.
async function scan() {
  const results = await chrome.scripting.executeScript({ target: { tabId }, func: collectImages });
  const have = new Map(images.map((i) => [i.url, i]));
  let added = 0;
  for (const f of results[0].result) {
    const prev = have.get(f.url);
    if (!prev) { images.push({ ...f, type: typeOf(f.url) }); added++; }
    else if (f.w * f.h > prev.w * prev.h) { prev.w = f.w; prev.h = f.h; }
  }
  images.sort((a, b) => b.w * b.h - a.w * a.h);
  return added;
}

// ---- save options -------------------------------------------------------

function options() {
  return {
    nameMode: $("nameMode").value,
    fmt: $("fmt").value,
    maxW: +$("maxW").value,
    quality: +$("quality").value,
    zip: $("zip").checked,
  };
}

function savePrefs() {
  try { localStorage.setItem("idp-prefs", JSON.stringify(options())); } catch {}
}

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem("idp-prefs") || "{}");
    if (p.nameMode) $("nameMode").value = p.nameMode;
    if (p.fmt) $("fmt").value = p.fmt;
    if (p.maxW !== undefined) $("maxW").value = String(p.maxW);
    if (p.quality) $("quality").value = p.quality;
    $("zip").checked = !!p.zip;
  } catch {}
  $("qval").textContent = $("quality").value;
}

async function ensureAccess() {
  if (await chrome.permissions.contains(OPT_ORIGINS)) return true;
  return chrome.permissions.request(OPT_ORIGINS);
}

// Re-encodes an image to the chosen format, size and quality.
async function reencode(blob, fmt, maxW, quality) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w0 = img.naturalWidth || 1024, h0 = img.naturalHeight || 1024;
    const scale = maxW > 0 ? Math.min(1, maxW / w0) : 1;
    const w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    if (fmt === "jpg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    const mime = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" }[fmt];
    return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), mime, quality / 100));
  } finally { URL.revokeObjectURL(url); }
}

function needsProcessing(ext, o) {
  if (o.fmt !== "original" && ext !== o.fmt) return true;
  const target = o.fmt !== "original" ? o.fmt : ext;
  const lossy = target === "jpg" || target === "webp";
  return RASTER.includes(ext) && (o.maxW > 0 || (lossy && o.quality < 100));
}

async function fetchImage(url, o) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let blob = await res.blob();
  let ext = extFromMime(blob.type) || extFromUrl(url) || "jpg";
  if (needsProcessing(ext, o)) {
    const target = o.fmt !== "original" ? o.fmt : ext;
    blob = await reencode(blob, target, o.maxW, o.quality);
    ext = target;
  }
  return { blob, ext };
}

const fmtBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  setTimeout(() => URL.revokeObjectURL(url), 120000);
  return new Promise((res) => chrome.downloads.download({ url, filename, conflictAction: "uniquify" }, () => res(!chrome.runtime.lastError)));
}

async function download() {
  const todo = visible().filter((i) => selected.has(i.url));
  if (!todo.length) return;
  const o = options();
  const names = uniqueNames(todo.map((i) => i.url), o.nameMode);
  const anyProcessing = o.fmt !== "original" || o.maxW > 0 || o.quality < 100;
  const needBytes = o.zip || anyProcessing;
  const btn = $("download"), lab = $("dlLabel"), fill = $("fill");
  btn.disabled = true;
  lab.textContent = `Saving ${todo.length}…`;
  fill.style.width = "0";
  const finish = (text) => { lab.textContent = text; btn.disabled = false; };

  if (needBytes && !(await ensureAccess())) {
    finish("Permission needed for this option");
    return;
  }
  let ok = 0, failed = 0, bytes = 0;
  const step = () => { fill.style.width = `${((ok + failed) / todo.length) * 100}%`; };

  if (!needBytes) {
    await Promise.all(todo.map((i, idx) => new Promise((res) => {
      const ext = extFromUrl(i.url) || (i.type === "other" ? "jpg" : i.type);
      chrome.downloads.download(
        { url: i.url, filename: `${host}/${names[idx]}.${ext}`, conflictAction: "uniquify" },
        (id) => { (chrome.runtime.lastError || id === undefined ? failed++ : ok++); step(); res(); }
      );
    })));
    finish(failed ? `Saved ${ok}, ${failed} failed` : `Saved ${ok} ✓`);
    return;
  }

  const files = [];
  for (let idx = 0; idx < todo.length; idx++) {
    try {
      const { blob, ext } = await fetchImage(todo[idx].url, o);
      bytes += blob.size;
      if (o.zip) files.push({ name: `${names[idx]}.${ext}`, data: new Uint8Array(await blob.arrayBuffer()) });
      else if (!(await saveBlob(blob, `${host}/${names[idx]}.${ext}`))) throw new Error("save");
      ok++;
    } catch { failed++; }
    step();
  }
  if (o.zip && files.length) await saveBlob(makeZip(files), `${host}-images.zip`);
  finish(`${failed ? `Saved ${ok}, ${failed} failed` : `Saved ${ok} ✓`} · ${fmtBytes(bytes)}`);
}

// Hands the selected images to the background-removal page (a full tab, so it keeps
// running if the popup closes).
async function openBgRemover() {
  const todo = visible().filter((i) => selected.has(i.url));
  if (!todo.length) return;
  if (!(await ensureAccess())) { $("dlLabel").textContent = "Permission needed for this option"; return; }
  const names = uniqueNames(todo.map((i) => i.url), options().nameMode);
  try {
    localStorage.setItem("idp-bgjob", JSON.stringify({ host, urls: todo.map((i) => i.url), names }));
  } catch {
    $("dlLabel").textContent = "Too much data to pass on. Select fewer images";
    return;
  }
  chrome.tabs.create({ url: chrome.runtime.getURL("bgremove.html") });
}

async function loadAll() {
  const b = $("scroll");
  b.disabled = true;
  b.textContent = "Scrolling…";
  try {
    await chrome.scripting.executeScript({ target: { tabId }, func: autoScroll, args: [20000] });
    const n = await scan();
    render();
    b.textContent = n ? `+${n} new` : "No more";
  } catch { b.textContent = "Can't scroll"; }
  setTimeout(() => { b.disabled = false; b.textContent = "Load all images"; }, 2000);
}

async function init() {
  loadPrefs();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab.id;
  try { host = new URL(tab.url).hostname.replace(/^www\./, "").replace(/[^\w.-]/g, "_"); } catch {}
  try {
    await scan();
  } catch {
    $("scan").hidden = true;
    $("count").textContent = "Can't scan this page";
    $("empty").textContent = "Chrome doesn't allow extensions on this page (e.g. chrome:// or the Web Store).";
    $("empty").hidden = false;
    return;
  }
  render();
}

$("all").addEventListener("click", () => { visible().forEach((i) => selected.add(i.url)); render(); });
$("none").addEventListener("click", () => { selected.clear(); render(); });
$("scroll").addEventListener("click", loadAll);
$("bg").addEventListener("click", openBgRemover);
$("download").addEventListener("click", download);
$("minSize").addEventListener("change", render);
["input", "change"].forEach((ev) => $("quality").addEventListener(ev, () => { $("qval").textContent = $("quality").value; }));
document.querySelectorAll(".opts select, .opts input").forEach((el) => el.addEventListener("change", savePrefs));
document.querySelectorAll("[data-type]").forEach((c) => c.addEventListener("change", render));
init();
