// Pure helpers used by popup.js (kept separate so they can be tested on their own).

const MIME_EXT = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/gif": "gif", "image/svg+xml": "svg", "image/avif": "avif", "image/bmp": "bmp",
  "image/x-icon": "ico", "image/vnd.microsoft.icon": "ico",
};

function extFromMime(mime) {
  return MIME_EXT[(mime || "").split(";")[0].trim().toLowerCase()] || "";
}

function extFromUrl(url) {
  if (url.startsWith("data:")) return extFromMime(url.slice(5, url.indexOf(";") > 0 ? url.indexOf(";") : url.indexOf(",")));
  try {
    const m = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i);
    const e = m ? m[1].toLowerCase() : "";
    return e === "jpeg" ? "jpg" : e;
  } catch { return ""; }
}

// File name without extension, taken from the image's own URL.
function baseName(url) {
  if (url.startsWith("data:")) return "image";
  try {
    let n = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
    n = n.replace(/\.[a-z0-9]{2,5}$/i, "");
    n = n.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").replace(/\s+/g, "-").replace(/^[.\-_]+|[.\-_]+$/g, "").slice(0, 80);
    return n || "image";
  } catch { return "image"; }
}

// One unique base name per image: original names, or numbered (image-001, ...).
function uniqueNames(urls, mode) {
  const used = new Set();
  return urls.map((url, idx) => {
    const base = mode === "numbered" ? `image-${String(idx + 1).padStart(3, "0")}` : baseName(url);
    let name = base, n = 1;
    while (used.has(name.toLowerCase())) name = `${base}-${++n}`;
    used.add(name.toLowerCase());
    return name;
  });
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Minimal ZIP writer (no compression: images are already compressed).
// files: [{ name: string, data: Uint8Array }]
function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
    lh.setUint16(26, name.length, true);
    parts.push(lh.buffer, name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
    ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(ch.buffer, name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((a, b) => a + b.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: "application/zip" });
}

if (typeof module !== "undefined") module.exports = { extFromMime, extFromUrl, baseName, uniqueNames, crc32, makeZip };
