// Yume Forge — popup.
//
// Bundled theme metadata comes from ../themes/themes.json; custom themes come
// from storage.local and are merged into the same list under the "custom"
// category, so both kinds render through one code path.
//
// Selecting a theme just writes its id to storage.sync — content.js does the
// rest. Custom cards additionally carry edit/delete affordances.

const E = globalThis.YumeEngine;

const chipsEl = document.getElementById("chips");
const listEl = document.getElementById("theme-list");
const resetEl = document.getElementById("reset");
const resetLabelEl = document.getElementById("reset-label");
const badgeEl = document.getElementById("current-badge");
const sitesEl = document.getElementById("sites");

let DATA = { categories: [], themes: [] };
let custom = [];
let optionValues = {};        // { themeId: { optionId: bool } }
let openSettingsFor = null;   // which card has its panel expanded
// One selection PER SITE — picking a ChatGPT theme never touches claude.ai.
let selected = { claude: "default", chatgpt: "default", gemini: "default" };
let activeSite = "claude";    // which tab of themes is on show
let activeFilter = "all";

const SITE_LABELS = {
  claude: { tab: "Claude", reset: "🤎 Claude Default", page: "claude.ai" },
  chatgpt: { tab: "OpenAI", reset: "🌀 ChatGPT Default", page: "chatgpt.com" },
  gemini: { tab: "Gemini", reset: "✨ Gemini Default", page: "gemini.google.com" },
};

/** Present a stored custom theme with the same shape as a bundled one. */
const toCard = (t) => ({
  id: t.id,
  category: "custom",
  site: E.siteOfTheme(t),
  name: t.name,
  emoji: t.emoji || "🎨",
  mode: t.subtitle || "Custom",
  bg: t.bg,
  text: t.text,
  accent: t.accent,
  options: t.options || [],
  features: t.features || [],
  custom: true,
});

const allThemes = () => [...DATA.themes, ...custom.map(toCard)];
const themeById = (id) => allThemes().find((t) => t.id === id);
const siteThemes = () => allThemes().filter((t) => E.siteOfTheme(t) === activeSite);

function updateBadge() {
  const t = themeById(selected[activeSite]);
  badgeEl.textContent = t ? `${t.emoji} ${t.name}` : "Default";
  resetEl.classList.toggle("active", !t);
  resetLabelEl.textContent = SITE_LABELS[activeSite].reset;
}

function renderSites() {
  for (const btn of sitesEl.querySelectorAll(".site-tab")) {
    btn.classList.toggle("active", btn.dataset.site === activeSite);
  }
}

sitesEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".site-tab");
  if (!btn || btn.dataset.site === activeSite) return;
  activeSite = btn.dataset.site;
  activeFilter = "all";
  openSettingsFor = null;
  // Remembered so the popup reopens where you were working.
  chrome.storage.local.set({ yumeActiveSite: activeSite });
  renderSites();
  updateBadge();
  renderChips();
  renderList();
});

function renderChips() {
  chipsEl.innerHTML = "";
  // Only categories that have themes for the site on show (which also hides
  // the "Mine" chip until there's something in it).
  const pool = siteThemes();
  const cats = DATA.categories.filter((c) => pool.some((t) => t.category === c.id));
  for (const c of [{ id: "all", label: "All" }, ...cats]) {
    const chip = document.createElement("button");
    chip.className = "chip" + (c.id === activeFilter ? " active" : "");
    chip.textContent = c.label;
    chip.addEventListener("click", () => {
      activeFilter = c.id;
      renderChips();
      renderList();
    });
    chipsEl.append(chip);
  }
}

function card(t) {
  const el = document.createElement("div");
  el.className = "theme-card" + (t.id === selected[activeSite] ? " active" : "");

  const pick = document.createElement("button");
  pick.className = "theme-pick";
  pick.addEventListener("click", () => select(t.id));

  const preview = document.createElement("div");
  preview.className = "preview";
  preview.style.background = t.bg;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.style.background = t.accent;

  const line1 = document.createElement("div");
  line1.className = "line";
  line1.style.background = t.text;

  const line2 = document.createElement("div");
  line2.className = "line short";
  line2.style.background = t.text;

  preview.append(bubble, line1, line2);

  const name = document.createElement("div");
  name.className = "theme-name";
  name.textContent = `${t.emoji} ${t.name}`;

  const mode = document.createElement("div");
  mode.className = "theme-mode";
  mode.textContent = t.mode;

  pick.append(preview, name, mode);
  el.append(pick);

  const tools = document.createElement("div");
  tools.className = "card-tools";

  const share = document.createElement("button");
  share.className = "tool";
  share.title = "Export — save a shareable file";
  share.textContent = "⤓";
  share.addEventListener("click", (e) => {
    e.stopPropagation();
    exportTheme(t);
  });
  tools.append(share);

  // Only themes that declare options get a gear. Right now that is Final
  // Fantasy alone, so the other 24 cards stay uncluttered — a settings icon
  // that opens an empty panel is worse than no icon.
  if ((t.options || []).length) {
    const gear = document.createElement("button");
    gear.className = "tool";
    gear.title = "Theme settings";
    gear.textContent = "\u2699";
    gear.setAttribute("aria-expanded", String(openSettingsFor === t.id));
    gear.addEventListener("click", (e) => {
      e.stopPropagation();
      openSettingsFor = openSettingsFor === t.id ? null : t.id;
      renderList();
    });
    tools.append(gear);
  }

  if (t.custom) {
    const del = document.createElement("button");
    del.className = "tool";
    del.title = "Delete";
    del.textContent = "🗑";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete “${t.name}”?`)) return;
      custom = await E.deleteTheme(t.id);
      if (selected[activeSite] === t.id) select("default");
      else { renderChips(); renderList(); }
    });

    tools.append(del);
  }

  el.append(tools);

  if (openSettingsFor === t.id && (t.options || []).length) {
    el.append(settingsPanel(t));
    el.classList.add("has-settings");
  }
  return el;
}

/** The inline settings panel for one theme. */
function settingsPanel(t) {
  const panel = document.createElement("div");
  panel.className = "theme-settings";

  for (const opt of t.options) {
    const row = document.createElement("label");
    row.className = "opt-row";

    const box = document.createElement("input");
    box.type = "checkbox";
    const saved = optionValues[t.id] || {};
    box.checked = opt.id in saved ? !!saved[opt.id] : !!opt.default;
    box.addEventListener("change", async () => {
      optionValues = {
        ...optionValues,
        [t.id]: { ...(optionValues[t.id] || {}), [opt.id]: box.checked },
      };
      await E.saveOptions(optionValues);
      // No re-render: rebuilding the list would tear this panel down mid-click
      // and the checkbox would appear to snap back. content.js is already
      // listening on storage, so the page updates on its own.
      toast(`${opt.label} ${box.checked ? "on" : "off"}`);
    });

    const text = document.createElement("span");
    text.className = "opt-text";
    const name = document.createElement("span");
    name.className = "opt-label";
    name.textContent = opt.label;
    text.append(name);
    if (opt.hint) {
      const hint = document.createElement("span");
      hint.className = "opt-hint";
      hint.textContent = opt.hint;
      text.append(hint);
    }

    row.append(box, text);
    panel.append(row);
  }

  // Chocobo preview row — Final Fantasy only (bundled or an imported copy,
  // which carries the party feature). Firing the storage trigger from here
  // reaches content.js on the open tab the same way theme selection does; no
  // DevTools context-hopping required. The site rides along so only the tab
  // this card belongs to reacts.
  if (t.id === "final-fantasy" || t.id === "final-fantasy-gpt" || t.id === "final-fantasy-gemini" || (t.features || []).includes("party")) {
    const row = document.createElement("div");
    row.className = "opt-row opt-preview";

    const text = document.createElement("span");
    text.className = "opt-text";
    const name = document.createElement("span");
    name.className = "opt-preview-label";
    name.textContent = "\u{1F424} Chocobo drive-by";
    const hint = document.createElement("span");
    hint.className = "opt-hint";
    hint.textContent = "Send one now, on the open " + SITE_LABELS[E.siteOfTheme(t)].page + " tab";
    text.append(name, hint);

    const btns = document.createElement("span");
    btns.className = "opt-preview-btns";
    for (const [v, label, title] of [
      ["a", "Parkour", "Across the top, tripping the party"],
      ["b", "\u2190", "Behind the box, right to left"],
      ["c", "\u2192", "Behind the box, left to right"],
    ]) {
      const b = document.createElement("button");
      b.className = "opt-preview-btn";
      b.textContent = label;
      b.title = title;
      b.addEventListener("click", () => {
        chrome.storage.local.set({ yumeChocoNow: { v, at: Date.now(), site: E.siteOfTheme(t) } });
        toast("Chocobo released \u2014 watch the page");
      });
      btns.append(b);
    }

    row.append(text, btns);
    panel.append(row);
  }
  return panel;
}

function renderList() {
  listEl.innerHTML = "";
  const cats = activeFilter === "all"
    ? DATA.categories
    : DATA.categories.filter((c) => c.id === activeFilter);

  const pool = siteThemes();

  for (const c of cats) {
    const themes = pool.filter((t) => t.category === c.id);
    if (!themes.length) continue;

    const head = document.createElement("h2");
    head.className = "section-title";
    head.textContent = c.label;
    listEl.append(head);

    const grid = document.createElement("div");
    grid.className = "grid";
    for (const t of themes) grid.append(card(t));
    listEl.append(grid);
  }

  if (!listEl.children.length) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "Nothing here yet.";
    listEl.append(empty);
  }
}

function select(id) {
  // The selection lands in the slot of the SITE whose tab is on show — that
  // is also always the site the picked theme belongs to, since the list only
  // ever offers the active site's themes.
  selected[activeSite] = id;
  chrome.storage.sync.set({ [E.selectedKeyFor(activeSite)]: id });
  updateBadge();
  renderChips();
  renderList();
}

/* ------------------------------------------------------------ export */

const toastEl = document.getElementById("toast");
let toastTimer = null;

function toast(msg, bad = false) {
  toastEl.textContent = msg;
  toastEl.classList.toggle("bad", bad);
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
}

const fetchText = (path) =>
  fetch(chrome.runtime.getURL(path)).then((r) => {
    if (!r.ok) throw new Error(path);
    return r.text();
  });

const fetchBase64 = (path) =>
  fetch(chrome.runtime.getURL(path))
    .then((r) => r.arrayBuffer())
    .then((buf) => {
      // btoa on a 5KB font in one call is fine; chunked anyway so a larger
      // asset can't blow the argument limit on String.fromCharCode.
      const bytes = new Uint8Array(buf);
      let s = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      }
      return btoa(s);
    });

/**
 * Build the shareable object for a card.
 *
 * Custom themes are already a theme object. Bundled ones are just a manifest
 * entry plus a CSS file, so they get flattened first — otherwise "export Final
 * Fantasy" would hand over three colours and none of the theme.
 */
async function packageOf(t) {
  if (t.custom) {
    const stored = custom.find((c) => c.id === t.id);
    if (!stored) throw new Error("That theme is no longer saved.");
    return E.exportable(stored);
  }
  return globalThis.YumePacker.packTheme(t, fetchText, fetchBase64);
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  // The popup can close the instant the click is handled, so don't revoke on a
  // timer — revoke on the next turn, after the download has been handed off.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function exportTheme(t) {
  try {
    toast("Packing " + t.name + "…");
    const pkg = await packageOf(t);
    // Name first for custom themes, id first for bundled ones. A custom id is
    // `custom-n9ulh5ouq2` — random, machine-specific, and identifying nothing.
    // Re-exporting an imported Final Fantasy to pass it on used to save
    // "custom-n9ulh5ouq2.yume.json"; now it saves "final-fantasy.yume.json".
    const slug = (t.custom ? t.name : t.id || t.name)
      .replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "theme";
    download(`${slug}.yume.json`, JSON.stringify(pkg, null, 2), "application/json");

    // Also put the code on the clipboard, so sharing in a chat needs no file.
    let copied = false;
    try {
      await navigator.clipboard.writeText(E.encodeShare(pkg));
      copied = true;
    } catch { /* clipboard perms vary; the file is the real deliverable */ }

    toast(copied ? "Saved · share code copied" : "Saved " + slug + ".yume.json");
  } catch (err) {
    toast(err.message || "Couldn't export that theme.", true);
  }
}

/* ------------------------------------------------------------ import */

async function importFrom(text) {
  let theme;
  try {
    theme = E.decodeShare(text);
  } catch (err) {
    toast(err.message, true);
    return;
  }
  custom = await E.upsertTheme(theme);
  // Land on the tab the import belongs to — selecting a ChatGPT theme while
  // the Claude tab is open must not write it into claude.ai's slot.
  activeSite = E.siteOfTheme(theme);
  chrome.storage.local.set({ yumeActiveSite: activeSite });
  renderSites();
  select(theme.id);          // select() re-renders, so the new card is visible
  toast(`Imported ${theme.emoji} ${theme.name}`);
}

const fileEl = document.getElementById("import-file");

fileEl.addEventListener("change", async () => {
  const f = fileEl.files && fileEl.files[0];
  // Reset first: picking the same file twice in a row fires no change event
  // otherwise, which reads as "import silently did nothing".
  fileEl.value = "";
  if (!f) return;
  try {
    // Sniff the magic bytes rather than trusting the extension — a .zip
    // renamed to .json would otherwise reach the JSON parser as binary and
    // produce a baffling error.
    const bytes = new Uint8Array(await f.arrayBuffer());
    const text = globalThis.YumeZip.looksLikeZip(bytes)
      ? await globalThis.YumeZip.extractTheme(bytes)
      : new TextDecoder("utf-8").decode(bytes);
    importFrom(text);
  } catch (err) {
    toast(err.message || "Couldn't read that file.", true);
  }
});

resetEl.addEventListener("click", () => select("default"));
document.getElementById("import-theme").addEventListener("click", () => fileEl.click());
document.getElementById("paste-theme").addEventListener("click", () => {
  const code = prompt("Paste a YUME1: theme code:");
  if (code && code.trim()) importFrom(code);
});

async function init() {
  const res = await fetch(chrome.runtime.getURL("themes/themes.json"));
  DATA = await res.json();
  custom = await E.loadCustom();
  optionValues = await E.loadOptions();

  const keys = E.SITES.map((s) => E.selectedKeyFor(s));
  chrome.storage.sync.get(keys, (data) => {
    E.SITES.forEach((s, i) => { selected[s] = data[keys[i]] || "default"; });
    chrome.storage.local.get("yumeActiveSite", (d) => {
      if (E.SITES.includes(d.yumeActiveSite)) activeSite = d.yumeActiveSite;
      renderSites();
      updateBadge();
      renderChips();
      renderList();
    });
  });
}

init();
