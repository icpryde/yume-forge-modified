// Yume Forge — theme engine.
// Shared by content.js, the popup and the editor. Plain script (no modules)
// so it can be listed in content_scripts and <script>-tagged alike.
//
// Responsibilities:
//   1. colour maths (hex <-> hsl)
//   2. deriving Claude's full design-token set from a handful of colours
//   3. compiling a theme object into injectable CSS
//   4. encoding/decoding themes as shareable text codes
(() => {
  "use strict";

  // Dev affordance: opening editor/editor.html straight off disk (no extension
  // context) has no chrome.storage. Back it with localStorage so the studio can
  // be designed and screenshotted without a reload-the-extension cycle. Inside
  // a real extension this branch never runs.
  if (typeof chrome === "undefined" || !chrome.storage) {
    // Real change events, not a stub: content.js reacts to storage writes via
    // onChanged, and a shim that swallows them means any harness built on it
    // silently skips every "user flipped a setting / picked a theme" path.
    const changeListeners = [];
    const mem = (area) => ({
      get(keys, cb) {
        const want = keys == null ? null : (Array.isArray(keys) ? keys : [keys]);
        const out = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k.startsWith(area + ":")) continue;
          const name = k.slice(area.length + 1);
          if (want && !want.includes(name)) continue;
          try { out[name] = JSON.parse(localStorage.getItem(k)); } catch {}
        }
        cb && cb(out);
      },
      set(obj, cb) {
        const changes = {};
        for (const [k, v] of Object.entries(obj)) {
          let old;
          try { old = JSON.parse(localStorage.getItem(`${area}:${k}`)); } catch {}
          changes[k] = { oldValue: old, newValue: v };
          localStorage.setItem(`${area}:${k}`, JSON.stringify(v));
        }
        for (const fn of changeListeners) {
          // Rethrow async rather than swallow: real Chrome surfaces listener
          // exceptions on the console, and a harness watching window.onerror
          // must see them too or it green-lights a broken handler.
          try { fn(changes, area); } catch (e) { setTimeout(() => { throw e; }, 0); }
        }
        cb && cb();
      },
      remove(key, cb) { localStorage.removeItem(`${area}:${key}`); cb && cb(); },
    });
    // Resolve extension-relative paths against this file's own location, so
    // popup/ and editor/ can both fetch themes/themes.json off disk.
    const here = (typeof document !== "undefined" && document.currentScript?.src) || "";
    const root = here.replace(/lib\/theme-engine\.js.*$/, "");

    globalThis.chrome = {
      ...(globalThis.chrome || {}),
      storage: { local: mem("local"), sync: mem("sync"), onChanged: { addListener(fn) { changeListeners.push(fn); } } },
      // The id matters: content.js's alive() reads chrome.runtime?.id to tell
      // a live extension from an orphaned content script. A shim without one
      // made every harness built on it run with alive() === false — which
      // silently skipped the party, banner and sound paths while still
      // reporting "clean".
      runtime: { id: "yume-dev-shim", getURL: (p) => root + p },
      tabs: { create({ url }) { window.open(url, "_blank"); } },
    };
  }

  const SCHEMA = 1;
  const CUSTOM_PREFIX = "custom-";

  /* ----------------------------------------------------------------- sites */

  // The extension themes more than one site now. Each site keeps its OWN
  // selected-theme slot so picking Final Fantasy for ChatGPT never silently
  // restyles claude.ai (and vice versa) — the selections are independent,
  // exactly like the popup presents them.
  const SITES = ["claude", "chatgpt", "gemini"];
  const SITE_KEYS = { claude: "cctTheme", chatgpt: "cctThemeGpt", gemini: "cctThemeGemini" };
  const selectedKeyFor = (site) => SITE_KEYS[site] || "cctTheme";
  const siteOfTheme = (t) => (t && SITES.includes(t.site) ? t.site : "claude");

  /* ---------------------------------------------------------------- colour */

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const round = (n, p = 1) => Math.round(n * 10 ** p) / 10 ** p;

  function hexToRgb(hex) {
    let h = String(hex || "").trim().replace(/^#/, "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }

  function rgbToHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: round(h), s: round(s * 100), l: round(l * 100) };
  }

  function hslToHex({ h, s, l }) {
    h = ((h % 360) + 360) % 360; s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const seg = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6];
    const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
    return "#" + to(seg[0]) + to(seg[1]) + to(seg[2]);
  }

  const hexToHsl = (hex) => { const rgb = hexToRgb(hex); return rgb ? rgbToHsl(rgb) : null; };

  /** Claude stores tokens as bare "H S% L%" triplets (consumed via hsl(var(--x))). */
  const triplet = ({ h, s, l }) =>
    `${round(((h % 360) + 360) % 360)} ${round(clamp(s, 0, 100))}% ${round(clamp(l, 0, 100))}%`;

  const shift = (hsl, dL, dS = 0, dH = 0) => ({
    h: hsl.h + dH,
    s: clamp(hsl.s + dS, 0, 100),
    l: clamp(hsl.l + dL, 0, 100),
  });

  /** Relative luminance — decides whether text on a fill should be black or white. */
  function isLight(hex) {
    const c = hexToRgb(hex);
    if (!c) return false;
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b) > 0.45;
  }

  /* ------------------------------------------------------- token derivation */

  // Deltas measured off the shipped themes (dracula / amoled / matcha), which
  // all anchor their surface ramp at --bg-100 and their text ramp at --text-100.
  const BG_DELTAS   = { "000": 4, "100": 0, "200": -3.2, "300": -6.2, "400": -9.8, "500": -9.8 };
  const TEXT_DELTAS = { "000": 2, "100": 0, "200": 17, "300": 17, "400": 36, "500": 36 };

  /**
   * Build the full token map from three colours + a mode.
   * Everything is overridable afterwards via theme.tokens.
   */
  function deriveTokens({ bg, text, accent, mode }) {
    const dark = mode !== "light";
    const bgH = hexToHsl(bg) || { h: 0, s: 0, l: dark ? 8 : 96 };
    const txH = hexToHsl(text) || { h: 0, s: 0, l: dark ? 96 : 14 };
    const acH = hexToHsl(accent) || { h: 210, s: 80, l: 60 };
    const sign = dark ? -1 : 1; // muted text moves away from the text colour

    const t = {};

    for (const [k, d] of Object.entries(BG_DELTAS)) {
      t[`--bg-${k}`] = triplet(shift(bgH, dark ? d : d * 1.07));
    }
    for (const [k, d] of Object.entries(TEXT_DELTAS)) {
      // --text-000 is a touch brighter than 100 on dark, a touch deeper on light
      const dl = k === "000" ? (dark ? d : -1) : d * sign;
      t[`--text-${k}`] = triplet(shift(txH, dl));
    }

    t["--accent-brand"] = triplet(acH);
    t["--accent-000"] = triplet(shift(acH, dark ? 10 : -10, dark ? 5 : 8));
    t["--accent-100"] = triplet(shift(acH, -3));
    t["--accent-200"] = triplet(shift(acH, -3));
    t["--accent-900"] = triplet(shift(acH, dark ? -30 : 30, -25));

    t["--brand-000"] = triplet(shift(acH, -4, -5));
    t["--brand-100"] = triplet(acH);
    t["--brand-200"] = triplet(acH);
    t["--brand-900"] = triplet({ h: acH.h, s: clamp(acH.s * 0.45, 0, 100), l: dark ? 9 : 10 });

    const border = triplet({ h: acH.h, s: Math.min(acH.s, 40), l: dark ? 86 : 22 });
    for (const k of ["100", "200", "300", "400"]) t[`--border-${k}`] = border;

    const bg000 = shift(bgH, dark ? BG_DELTAS["000"] : BG_DELTAS["000"] * 1.07);
    t["--pictogram-100"] = triplet(shift(bg000, dark ? 13 : -13.5));
    t["--pictogram-200"] = triplet(shift(bg000, dark ? 6 : -19));
    t["--pictogram-300"] = triplet(bg000);
    t["--pictogram-400"] = triplet(shift(bgH, 0));

    return t;
  }

  /* ----------------------------------------------------------- theme object */

  const newId = () =>
    CUSTOM_PREFIX + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

  function makeTheme(partial = {}) {
    const mode = partial.mode === "light" ? "light" : "dark";
    const bg = partial.bg || (mode === "dark" ? "#12141c" : "#f6f5f1");
    const text = partial.text || (mode === "dark" ? "#e8e6e1" : "#22242c");
    const accent = partial.accent || "#7aa2f7";
    const theme = {
      schema: SCHEMA,
      id: partial.id || newId(),
      name: partial.name || "Untitled theme",
      emoji: partial.emoji || "🎨",
      author: partial.author || "",
      mode,
      // Which site's DOM this theme is written against. Imported copies keep
      // it, so a packaged ChatGPT theme lands under the OpenAI tab and is
      // applied by the chatgpt.com content script, not claude.ai's.
      site: SITES.includes(partial.site) ? partial.site : "claude",
      subtitle: partial.subtitle || (mode === "dark" ? "Dark · custom" : "Light · custom"),
      bg, text, accent,
      tokens: partial.tokens && Object.keys(partial.tokens).length
        ? { ...partial.tokens }
        : deriveTokens({ bg, text, accent, mode }),
      rawCss: partial.rawCss || "",
      features: Array.isArray(partial.features) ? [...partial.features] : [],
      options: Array.isArray(partial.options) ? partial.options.map((o) => ({ ...o })) : [],
      // { name: "data:audio/wav;base64,..." } — a packaged theme's own audio.
      sounds: partial.sounds && typeof partial.sounds === "object" ? { ...partial.sounds } : {},
      css: partial.css || "",
      createdAt: partial.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    return theme;
  }

  /** Re-derive the token ramp from the three base colours, keeping manual edits. */
  function resyncTokens(theme, { keepOverrides = true } = {}) {
    const fresh = deriveTokens(theme);
    theme.tokens = keepOverrides ? { ...fresh, ...(theme.overrides || {}) } : fresh;
    return theme;
  }

  /* ------------------------------------------------------------- compiling */

  const isCustomId = (id) => typeof id === "string" && id.startsWith(CUSTOM_PREFIX);

  /** Escape a theme id for safe use inside an attribute selector. */
  const safeId = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, "");

  /**
   * Compile a custom theme into a CSS string.
   * Mirrors the shape of the bundled theme files so _base.css applies for free.
   *
   * `root` overrides the selector so the editor can render the same theme
   * scoped to a preview element instead of the whole document.
   */
  function compileCss(theme, { root } = {}) {
    const sel = root || `html[data-cct-theme="${safeId(theme.id)}"]`;

    // A packaged theme (Final Fantasy and anything else hand-written) ships a
    // complete stylesheet rather than a token map — it uses generated sprites,
    // keyframes and structural selectors that three colours cannot express.
    // __YUME_ROOT__ is the portable stand-in for whatever selector the theme
    // lands under once imported.
    if (theme.rawCss && theme.rawCss.trim()) {
      return `/* ${theme.name} — packaged theme */\n` +
        theme.rawCss.split("__YUME_ROOT__").join(sel) + "\n";
    }
    const decls = Object.entries(theme.tokens || {})
      .map(([k, v]) => `  ${k}: ${v} !important;`)
      .join("\n");

    let css = `/* ${theme.name} — generated by Yume Forge Modified */\n${sel},\n${sel} * {\n${decls}\n}\n`;

    // Scenery layer, so custom themes get the same soft corner wash as bundled ones.
    const acc = hexToHsl(theme.accent);
    if (acc) {
      css += `\n${sel}::before {\n  background:\n` +
        `    radial-gradient(760px 520px at -5% -5%, hsl(${round(acc.h)} ${round(acc.s)}% ${round(acc.l)}% / 0.16), transparent 70%),\n` +
        `    radial-gradient(760px 520px at 105% 108%, hsl(${round((acc.h + 40) % 360)} ${round(acc.s)}% ${round(acc.l)}% / 0.13), transparent 70%);\n}\n`;
    }

    if (theme.css && theme.css.trim()) {
      // Author CSS is scoped by convention: `&` expands to the theme selector.
      css += `\n/* --- author CSS --- */\n` + theme.css.replace(/&/g, sel) + "\n";
    }
    return css;
  }

  /* ----------------------------------------------------------- share codes */

  // A share code is base64url(JSON) with a short human-readable prefix, so it
  // survives being pasted into chat apps that mangle whitespace.
  const CODE_PREFIX = "YUME1:";

  const toB64Url = (str) => {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  const fromB64Url = (code) => {
    let b = code.replace(/-/g, "+").replace(/_/g, "/");
    while (b.length % 4) b += "=";
    const bin = atob(b);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  };

  /** Only the fields worth transmitting — drops timestamps and derived noise. */
  function exportable(theme) {
    return {
      schema: SCHEMA,
      name: theme.name,
      emoji: theme.emoji,
      author: theme.author || "",
      mode: theme.mode,
      subtitle: theme.subtitle,
      bg: theme.bg, text: theme.text, accent: theme.accent,
      tokens: theme.tokens,
      css: theme.css || "",
      // Claude is the historical default, so only a non-default site is
      // written out — older builds ignore the field entirely.
      ...(theme.site && theme.site !== "claude" ? { site: theme.site } : {}),
      // Present only on packaged themes; carries the whole stylesheet with its
      // assets already inlined as data URIs.
      ...(theme.rawCss ? { rawCss: theme.rawCss } : {}),
      // Features the theme needs from content.js (party sprites, shooting
      // stars, banner styling). Without these the JS side has no way to know an
      // imported theme wants them, since it can no longer key off the id.
      ...(theme.features && theme.features.length ? { features: theme.features } : {}),
      // Declared toggles, so an exported theme keeps its settings panel.
      ...(theme.options && theme.options.length ? { options: theme.options } : {}),
      // Embedded audio, so behaviours stay voiced on a build without the files.
      ...(theme.sounds && Object.keys(theme.sounds).length ? { sounds: theme.sounds } : {}),
    };
  }

  const encodeShare = (theme) => CODE_PREFIX + toB64Url(JSON.stringify(exportable(theme)));

  function decodeShare(code) {
    const trimmed = String(code || "").trim();

    // Two input shapes, and they need OPPOSITE handling.
    //
    // A share code is base64url that has probably been through a chat app, so
    // whitespace has to be squeezed out before it will decode. A .yume.json
    // file is JSON, where whitespace inside string values is DATA — squeezing
    // it turns "Final Fantasy" into "FinalFantasy" and, far worse, collapses
    // the packaged stylesheet: `1px solid white` becomes `1pxsolidwhite` and
    // every descendant selector `.a .b` becomes `.a.b`. It still parses, so
    // the import reports success and the theme quietly renders wrong.
    //
    // So pick the branch first, and only squeeze the base64 one.
    const isJson = trimmed.startsWith("{");
    const raw = isJson ? trimmed : trimmed.replace(/\s+/g, "");
    const body = raw.startsWith(CODE_PREFIX) ? raw.slice(CODE_PREFIX.length) : raw;

    let obj;
    try {
      obj = JSON.parse(isJson ? body : fromB64Url(body));
    } catch {
      throw new Error("That doesn't look like a Yume theme code.");
    }
    if (!obj || typeof obj !== "object" || (!obj.tokens && !obj.rawCss)) {
      throw new Error("Theme code is missing its palette.");
    }
    // Always mint a fresh id so importing never clobbers an existing theme.
    return makeTheme({ ...obj, id: newId() });
  }

  /* ------------------------------------------------------------- storage */

  const STORE_KEY = "yumeCustomThemes";
  const SELECTED_KEY = "cctTheme";
  // Per-theme option toggles: { "<theme-id>": { "<option-id>": true } }.
  // In sync storage alongside the selected theme, so a theme and the way you
  // have it configured travel together across machines.
  const OPTIONS_KEY = "yumeThemeOptions";

  const loadCustom = () =>
    new Promise((res) =>
      chrome.storage.local.get(STORE_KEY, (d) => res(Array.isArray(d[STORE_KEY]) ? d[STORE_KEY] : []))
    );

  const saveCustom = (list) =>
    new Promise((res) => chrome.storage.local.set({ [STORE_KEY]: list }, res));

  const loadOptions = () =>
    new Promise((res) => chrome.storage.sync.get(OPTIONS_KEY, (d) => {
      const v = d[OPTIONS_KEY];
      res(v && typeof v === "object" ? v : {});
    }));

  const saveOptions = (all) =>
    new Promise((res) => chrome.storage.sync.set({ [OPTIONS_KEY]: all }, res));

  /**
   * The option ids that are ON for a theme, given the stored settings.
   *
   * Declared options carry a default; stored values override it. Returns ids
   * only, because that is what gets stamped on <html> for CSS to gate on.
   */
  function enabledOptions(theme, stored) {
    const decl = (theme && theme.options) || [];
    const saved = (stored && stored[theme && theme.id]) || {};
    return decl
      .filter((o) => (o.id in saved ? !!saved[o.id] : !!o.default))
      .map((o) => o.id);
  }

  async function upsertTheme(theme) {
    const list = await loadCustom();
    const i = list.findIndex((t) => t.id === theme.id);
    theme.updatedAt = Date.now();
    if (i >= 0) list[i] = theme; else list.push(theme);
    await saveCustom(list);
    return list;
  }

  async function deleteTheme(id) {
    const list = (await loadCustom()).filter((t) => t.id !== id);
    await saveCustom(list);
    return list;
  }

  /* --------------------------------------------------------------- export */

  const api = {
    SCHEMA, CUSTOM_PREFIX, STORE_KEY, SELECTED_KEY, CODE_PREFIX,
    SITES, selectedKeyFor, siteOfTheme,
    hexToRgb, rgbToHsl, hslToHex, hexToHsl, triplet, isLight, shift, round,
    deriveTokens, makeTheme, resyncTokens, newId,
    isCustomId, safeId, compileCss, exportable,
    encodeShare, decodeShare,
    loadCustom, saveCustom, upsertTheme, deleteTheme,
    OPTIONS_KEY, loadOptions, saveOptions, enabledOptions,
  };

  if (typeof globalThis !== "undefined") globalThis.YumeEngine = api;
})();
