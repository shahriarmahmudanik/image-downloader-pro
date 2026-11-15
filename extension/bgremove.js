const $ = (id) => document.getElementById(id);
let job = null;
const items = [];

function readJob() {
  try { return JSON.parse(localStorage.getItem("idp-bgjob") || "null"); } catch { return null; }
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  setTimeout(() => URL.revokeObjectURL(url), 120000);
  return new Promise((res) =>
    chrome.downloads.download({ url, filename, conflictAction: "uniquify" }, () => res(!chrome.runtime.lastError))
  );
}

function buildCard(it) {
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="pair">
      <figure><div class="pic"><img alt=""></div><figcaption>Original</figcaption></figure>
      <figure><div class="pic after"><img alt="" hidden></div><figcaption>Background removed</figcaption></figure>
    </div>
    <div class="row"><span class="name"></span><span class="state">Waiting…</span><button type="button" disabled>Download PNG</button></div>`;
  const [before, after] = card.querySelectorAll("img");
  before.src = it.url;
  card.querySelector(".name").textContent = `${it.name}-no-bg.png`;
  it.els = { after, state: card.querySelector(".state"), btn: card.querySelector("button") };
  it.els.btn.addEventListener("click", () => it.blob && saveBlob(it.blob, `${job.host}/${it.name}-no-bg.png`));
  return card;
}

function refreshFooter() {
  const done = items.filter((i) => i.blob).length;
  $("zip").disabled = $("files").disabled = done === 0;
}

async function run() {
  job = readJob();
  if (!job || !job.urls || !job.urls.length) {
    $("status").textContent = "Nothing to process";
    $("list").innerHTML = '<p class="empty">Open the extension on a page, select some images and click “Remove background”.</p>';
    return;
  }
  job.urls.forEach((url, idx) => {
    const it = { url, name: job.names[idx] || `image-${idx + 1}`, blob: null };
    items.push(it);
    $("list").append(buildCard(it));
  });

  $("status").textContent = "Loading the background-removal model…";
  try { await loadBgModel(); } catch (e) {
    $("status").textContent = "Couldn't load the model";
    items.forEach((i) => { i.els.state.textContent = "Model failed to load"; i.els.state.classList.add("err"); });
    return;
  }

  let done = 0, failed = 0;
  for (const it of items) {
    $("status").textContent = `Processing ${done + failed + 1} of ${items.length}…`;
    it.els.state.textContent = "Processing…";
    try {
      const res = await fetch(it.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      it.blob = await removeBackground(await res.blob());
      it.els.after.src = URL.createObjectURL(it.blob);
      it.els.after.hidden = false;
      it.els.state.textContent = "Done";
      it.els.btn.disabled = false;
      done++;
    } catch (e) {
      it.els.state.textContent = "Couldn't process this image";
      it.els.state.classList.add("err");
      failed++;
    }
    refreshFooter();
  }
  $("status").textContent = failed ? `${done} done, ${failed} failed` : `${done} done ✓`;
}

$("zip").addEventListener("click", async () => {
  const files = [];
  for (const it of items) if (it.blob) files.push({ name: `${it.name}-no-bg.png`, data: new Uint8Array(await it.blob.arrayBuffer()) });
  if (files.length) await saveBlob(makeZip(files), `${job.host}-no-background.zip`);
});
$("files").addEventListener("click", async () => {
  for (const it of items) if (it.blob) await saveBlob(it.blob, `${job.host}/${it.name}-no-bg.png`);
});

run();
