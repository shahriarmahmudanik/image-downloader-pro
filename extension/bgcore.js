// On-device background removal: U^2-Net-small (ONNX) running on ONNX Runtime Web (WASM).
// Everything is bundled with the extension; no network access is needed.
// Pre/post-processing follows the approach used by the rembg project (MIT).

const BG_MODEL_SIZE = 320;
const BG_MAX_SIDE = 2048;
let bgSession;

async function loadBgModel() {
  if (bgSession) return bgSession;
  ort.env.wasm.wasmPaths = new URL("vendor/", document.baseURI).href;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  const res = await fetch(new URL("models/u2netp.onnx", document.baseURI));
  if (!res.ok) throw new Error("model missing");
  bgSession = await ort.InferenceSession.create(await res.arrayBuffer(), { executionProviders: ["wasm"] });
  return bgSession;
}

function bgCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

// Returns a PNG Blob with the background made transparent.
async function removeBackground(blob) {
  const session = await loadBgModel();

  const url = URL.createObjectURL(blob);
  let img;
  try {
    img = new Image();
    img.src = url;
    await img.decode();
  } finally { URL.revokeObjectURL(url); }

  let w = img.naturalWidth || 1024, h = img.naturalHeight || 1024;
  const k = Math.min(1, BG_MAX_SIDE / Math.max(w, h));
  w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));

  const full = bgCanvas(w, h), fctx = full.getContext("2d", { willReadFrequently: true });
  fctx.drawImage(img, 0, 0, w, h);
  const orig = fctx.getImageData(0, 0, w, h);

  // Model input: 320x320, scaled by the max value, then ImageNet mean/std.
  const S = BG_MODEL_SIZE;
  const small = bgCanvas(S, S), sctx = small.getContext("2d", { willReadFrequently: true });
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(full, 0, 0, S, S);
  const px = sctx.getImageData(0, 0, S, S).data;
  let mx = 1;
  for (let i = 0; i < px.length; i += 4) mx = Math.max(mx, px[i], px[i + 1], px[i + 2]);
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  const input = new Float32Array(3 * S * S);
  for (let i = 0; i < S * S; i++) {
    for (let c = 0; c < 3; c++) input[c * S * S + i] = (px[i * 4 + c] / mx - mean[c]) / std[c];
  }

  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, S, S]) });
  const m = out[session.outputNames[0]].data;

  // Normalise the mask to 0..255, scale it up to the image size, use it as alpha.
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < S * S; i++) { if (m[i] < lo) lo = m[i]; if (m[i] > hi) hi = m[i]; }
  const range = hi - lo || 1;
  const maskSmall = bgCanvas(S, S), mctx = maskSmall.getContext("2d");
  const md = mctx.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = ((m[i] - lo) / range) * 255;
    md.data[i * 4] = md.data[i * 4 + 1] = md.data[i * 4 + 2] = v;
    md.data[i * 4 + 3] = 255;
  }
  mctx.putImageData(md, 0, 0);
  const maskBig = bgCanvas(w, h), bctx = maskBig.getContext("2d", { willReadFrequently: true });
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(maskSmall, 0, 0, w, h);
  const mask = bctx.getImageData(0, 0, w, h).data;
  for (let i = 0; i < w * h; i++) orig.data[i * 4 + 3] = Math.round((orig.data[i * 4 + 3] * mask[i * 4]) / 255);
  fctx.putImageData(orig, 0, 0);

  return await new Promise((res, rej) => full.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/png"));
}
