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

const $ = (id) => document.getElementById(id);
let images = [];
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
  list.forEach((i, idx) => {
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
  countUp(list.length, images.length);
  updateButton();
}

function countUp(shown, total) {
  $("count").textContent = `${shown} of ${total} images`;
}

const label = (i) => `${i.w && i.h ? `${i.w}×${i.h} · ` : ""}${i.type.toUpperCase()}`;

function updateButton() {
  const n = visible().filter((i) => selected.has(i.url)).length;
  $("dlLabel").textContent = `Download (${n})`;
  $("download").disabled = n === 0;
  $("fill").style.width = "0";
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: false },
      func: collectImages,
    });
    images = results[0].result.map((i) => ({ ...i, type: typeOf(i.url) }));
  } catch {
    $("scan").hidden = true;
    $("count").textContent = "Can't scan this page";
    $("empty").textContent = "Chrome doesn't allow extensions on this page (e.g. chrome:// or the Web Store).";
    $("empty").hidden = false;
    return;
  }
  images.sort((a, b) => b.w * b.h - a.w * a.h);
  render();

  let host = "images";
  try { host = new URL(tab.url).hostname.replace(/^www\./, "").replace(/[^\w.-]/g, "_"); } catch {}
  $("download").addEventListener("click", () => {
    const todo = visible().filter((i) => selected.has(i.url));
    let done = 0;
    const tick = () => {
      done++;
      $("fill").style.width = `${(done / todo.length) * 100}%`;
      if (done === todo.length) $("dlLabel").textContent = `Saved ${done} ✓`;
    };
    $("dlLabel").textContent = `Saving ${todo.length}…`;
    todo.forEach((i, idx) => {
      const ext = i.type === "other" ? "jpg" : i.type;
      chrome.downloads.download(
        {
          url: i.url,
          filename: `${host}/image-${String(idx + 1).padStart(3, "0")}.${ext}`,
          conflictAction: "uniquify",
        },
        tick
      );
    });
  });
}

$("all").addEventListener("click", () => { visible().forEach((i) => selected.add(i.url)); render(); });
$("none").addEventListener("click", () => { selected.clear(); render(); });
$("minSize").addEventListener("change", render);
document.querySelectorAll("[data-type]").forEach((c) => c.addEventListener("change", render));
init();
