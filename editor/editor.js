// Yume Forge — Theme Studio.
//
// Editing model: `current` is the working copy. Every control writes into it
// and calls render(); nothing persists until Save. Token edits are tracked in
// `current.overrides` so that changing a base colour re-derives the ramp
// *without* silently discarding hand-tuned tokens.
//
// Live preview writes the working copy to storage.local under `yumePreview`,
// which content.js applies on top of whatever theme is actually selected. The
// key is cleared on unload so a closed tab never leaves claude.ai stuck.

const E = globalThis.YumeEngine;

const PREVIEW_KEY = "yumePreview";

const $ = (id) => document.getElementById(id);

const el = {
  rail: $("theme-rail"),
  name: $("f-name"), emoji: $("f-emoji"), subtitle: $("f-subtitle"), author: $("f-author"),
  bg: $("f-bg"), bgHex: $("f-bg-hex"),
  text: $("f-text"), textHex: $("f-text-hex"),
  accent: $("f-accent"), accentHex: $("f-accent-hex"),
  css: $("f-css"),
  tokenGrid: $("token-grid"),
  preview: $("preview"),
  status: $("status"),
  live: $("f-live"),
};

let themes = [];
let current = null;
let dirty = false;

/* ------------------------------------------------------------------ status */

let statusTimer = null;
function status(msg, kind = "") {
  el.status.textContent = msg;
  el.status.className = "status " + kind;
  clearTimeout(statusTimer);
  if (msg) statusTimer = setTimeout(() => { el.status.textContent = ""; }, 3200);
}

/* ------------------------------------------------------------------- rail */

function renderRail() {
  el.rail.innerHTML = "";
  if (!themes.length) {
    const p = document.createElement("div");
    p.className = "rail-empty";
    p.textContent = "No themes yet.";
    el.rail.append(p);
    return;
  }
  for (const t of themes) {
    const b = document.createElement("button");
    b.className = "rail-item" + (current && t.id === current.id ? " active" : "");
    const dot = document.createElement("span");
    dot.className = "rail-dot";
    dot.style.background = t.accent;
    const name = document.createElement("span");
    name.className = "rail-name";
    name.textContent = `${t.emoji || "🎨"} ${t.name}`;
    b.append(dot, name);
    b.addEventListener("click", () => selectTheme(t.id));
    el.rail.append(b);
  }
}

/* -------------------------------------------------------------- form <-> */

function fillForm() {
  el.name.value = current.name;
  el.emoji.value = current.emoji;
  el.subtitle.value = current.subtitle;
  el.author.value = current.author || "";
  el.bg.value = current.bg; el.bgHex.value = current.bg;
  el.text.value = current.text; el.textHex.value = current.text;
  el.accent.value = current.accent; el.accentHex.value = current.accent;
  el.css.value = current.css || "";
  document.querySelector(`input[name="mode"][value="${current.mode}"]`).checked = true;
  renderTokenGrid();
}

function renderTokenGrid() {
  el.tokenGrid.innerHTML = "";
  for (const [k, v] of Object.entries(current.tokens)) {
    const row = document.createElement("div");
    row.className = "token-row";
    const label = document.createElement("label");
    label.textContent = k;
    const input = document.createElement("input");
    input.type = "text";
    input.value = v;
    input.spellcheck = false;
    input.addEventListener("input", () => {
      current.tokens[k] = input.value;
      (current.overrides ||= {})[k] = input.value;
      markDirty();
      render();
    });
    row.append(label, input);
    el.tokenGrid.append(row);
  }
}

/* ----------------------------------------------------------------- render */

function render() {
  // Apply the token map straight onto the preview root; the preview CSS reads
  // the same variable names claude.ai does.
  for (const [k, v] of Object.entries(current.tokens)) {
    el.preview.style.setProperty(k, v);
  }
  renderRail();
  if (el.live.checked) pushPreview();
}

function markDirty() {
  dirty = true;
}

/* --------------------------------------------------------------- mutation */

function rederive({ keepOverrides }) {
  current.tokens = E.deriveTokens(current);
  if (keepOverrides && current.overrides) {
    Object.assign(current.tokens, current.overrides);
  } else {
    current.overrides = {};
  }
  renderTokenGrid();
  markDirty();
  render();
}

function bindColour(picker, hex, key) {
  const set = (value) => {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return;
    current[key] = value.toLowerCase();
    picker.value = current[key];
    hex.value = current[key];
    rederive({ keepOverrides: true });
  };
  picker.addEventListener("input", () => set(picker.value));
  hex.addEventListener("change", () => set(hex.value.trim()));
}

/* ----------------------------------------------------------------- themes */

function selectTheme(id) {
  const found = themes.find((t) => t.id === id);
  if (!found) return;
  current = structuredClone(found);
  dirty = false;
  fillForm();
  render();
}

function newTheme(seed) {
  current = E.makeTheme(seed || {});
  dirty = true;
  fillForm();
  render();
  status("New theme — press Save to keep it.");
}

async function save() {
  current.name = el.name.value.trim() || "Untitled theme";
  current.emoji = el.emoji.value.trim() || "🎨";
  current.subtitle = el.subtitle.value.trim() || (current.mode === "dark" ? "Dark · custom" : "Light · custom");
  current.author = el.author.value.trim();
  current.css = el.css.value;

  themes = await E.upsertTheme(structuredClone(current));
  dirty = false;
  renderRail();
  status(`Saved “${current.name}”.`, "ok");
}

async function remove() {
  if (!themes.some((t) => t.id === current.id)) {
    status("That theme was never saved.", "err");
    return;
  }
  if (!confirm(`Delete “${current.name}”? This can't be undone.`)) return;

  themes = await E.deleteTheme(current.id);

  // If the deleted theme was the active pick on ANY site, fall back to that
  // site's default so no site is left pointing at a theme that no longer
  // exists. Checking only claude's slot was fine when claude was the only
  // site; an imported ChatGPT or Gemini theme deleted while selected used to
  // leave its slot aimed at a dead id, and that site rendered unthemed until
  // something was picked again.
  const keys = E.SITES.map((s) => E.selectedKeyFor(s));
  chrome.storage.sync.get(keys, (d) => {
    const clear = {};
    for (const k of keys) if (d[k] === current.id) clear[k] = "default";
    if (Object.keys(clear).length) chrome.storage.sync.set(clear);
    if (themes.length) selectTheme(themes[0].id);
    else newTheme();
    status("Deleted.", "ok");
  });
}

async function duplicate() {
  const copy = E.makeTheme({ ...E.exportable(current), name: current.name + " copy" });
  themes = await E.upsertTheme(copy);
  selectTheme(copy.id);
  status("Duplicated.", "ok");
}

/* ------------------------------------------------------------ share / io */

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportFile() {
  const slug = current.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "theme";
  download(`${slug}.yume.json`, JSON.stringify(E.exportable(current), null, 2));
  status("Exported.", "ok");
}

async function copyShare() {
  try {
    await navigator.clipboard.writeText(E.encodeShare(current));
    status("Share code copied to clipboard.", "ok");
  } catch {
    status("Couldn't reach the clipboard.", "err");
  }
}

async function importTheme(raw) {
  const theme = E.decodeShare(raw); // throws with a readable message
  themes = await E.upsertTheme(theme);
  selectTheme(theme.id);
  status(`Imported “${theme.name}”.`, "ok");
}

/* ---------------------------------------------------------- live preview */

function pushPreview() {
  chrome.storage.local.set({ [PREVIEW_KEY]: structuredClone(current) });
}
function clearPreview() {
  chrome.storage.local.remove(PREVIEW_KEY);
}

/* -------------------------------------------------------------- surprise */

function surprise() {
  const dark = current.mode !== "light";
  const h = Math.floor(Math.random() * 360);
  const accentH = (h + 140 + Math.floor(Math.random() * 80)) % 360;
  const bg = E.hslToHex({ h, s: 18 + Math.random() * 22, l: dark ? 6 + Math.random() * 8 : 93 + Math.random() * 5 });
  const text = E.hslToHex({ h, s: 12, l: dark ? 92 : 16 });
  const accent = E.hslToHex({ h: accentH, s: 62 + Math.random() * 28, l: dark ? 58 + Math.random() * 12 : 44 });
  current.bg = bg; current.text = text; current.accent = accent;
  el.bg.value = bg; el.bgHex.value = bg;
  el.text.value = text; el.textHex.value = text;
  el.accent.value = accent; el.accentHex.value = accent;
  rederive({ keepOverrides: false });
}

/* ----------------------------------------------------------------- wiring */

bindColour(el.bg, el.bgHex, "bg");
bindColour(el.text, el.textHex, "text");
bindColour(el.accent, el.accentHex, "accent");

for (const f of ["name", "emoji", "subtitle", "author", "css"]) {
  el[f].addEventListener("input", markDirty);
}

for (const radio of document.querySelectorAll('input[name="mode"]')) {
  radio.addEventListener("change", () => {
    current.mode = radio.value;
    current.subtitle = radio.value === "dark" ? "Dark · custom" : "Light · custom";
    el.subtitle.value = current.subtitle;
    rederive({ keepOverrides: false });
  });
}

for (const h of document.querySelectorAll(".collapsible")) {
  h.addEventListener("click", () => {
    h.classList.toggle("open");
    $(h.dataset.target).classList.toggle("collapsed");
  });
}

$("btn-save").addEventListener("click", save);
$("btn-new").addEventListener("click", () => newTheme());
$("btn-delete").addEventListener("click", remove);
$("btn-duplicate").addEventListener("click", duplicate);
$("btn-export").addEventListener("click", exportFile);
$("btn-share").addEventListener("click", copyShare);
$("btn-rederive").addEventListener("click", () => {
  rederive({ keepOverrides: false });
  status("Tokens re-derived from the three base colours.");
});
$("btn-random").addEventListener("click", surprise);

el.live.addEventListener("change", () => {
  if (el.live.checked) { pushPreview(); status("Previewing on any open claude.ai, chatgpt.com or gemini.google.com tab."); }
  else { clearPreview(); status("Live preview off."); }
});

// Never strand a themed tab showing an unsaved preview.
window.addEventListener("beforeunload", clearPreview);

/* ------------------------------------------------------------------ import */

const dialog = $("import-dialog");
$("btn-import").addEventListener("click", () => {
  $("import-text").value = "";
  $("import-file").value = "";
  $("import-error").textContent = "";
  dialog.showModal();
});

$("import-file").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (file) $("import-text").value = await file.text();
});

dialog.addEventListener("close", async () => {
  if (dialog.returnValue !== "import") return;
  const raw = $("import-text").value.trim();
  if (!raw) return;
  try {
    await importTheme(raw);
  } catch (err) {
    status(err.message, "err");
  }
});

/* -------------------------------------------------------------------- boot */

(async function init() {
  themes = await E.loadCustom();

  // ?id=… lets the popup deep-link straight into editing a specific theme.
  const wanted = new URLSearchParams(location.search).get("id");
  if (wanted && themes.some((t) => t.id === wanted)) selectTheme(wanted);
  else if (themes.length) selectTheme(themes[0].id);
  else newTheme({ name: "My first theme" });
})();
