// Yume Forge — theme packer.
//
// A theme like Final Fantasy is not three colours. It is ~1000 lines of CSS,
// nine generated sprite sheets, two webfonts and a handful of behaviours in
// content.js. The share format only ever carried a token map, so exporting one
// produced a file that looked right in the list and rendered nothing.
//
// This flattens a bundled theme into ONE self-contained object:
//
//   * every --yume-* custom property it actually references, resolved
//     transitively and inlined (the sprites are already data URIs)
//   * the @font-face rules for the families it uses, with the woff2 inlined
//   * its own stylesheet, with `html[data-cct-theme="<id>"]` rewritten to the
//     portable marker __YUME_ROOT__
//   * the feature names it needs from content.js
//
// The result imports on any copy of the extension under a fresh custom id and
// renders identically. Nothing is fetched at runtime.
//
// Deliberately shared, not duplicated: tools/pack-theme.mjs feeds it the disk,
// popup.js feeds it chrome.runtime.getURL. One implementation means a theme
// exported from the CLI is byte-identical to one exported from the popup.
(() => {
  "use strict";

  const SPRITE_SHEETS = [
    "sprites/party.css",
    "sprites/party-strips.css",
    "sprites/chocobo.css",
    "sprites/crystal.css",
    "sprites/menu-crystal.css",
    "sprites/cursor.css",
    "sprites/moogle.css",
    "sprites/items.css",
    "sprites/nav-icons.css",
    "sprites/shop-icons.css",
    "sprites/silhouette.css",
    "sprites/ambience.css",
  ];

  // The audio a theme's behaviours play. Mirrors content.js's SOUND_FILES;
  // embedded as data URIs so a shared theme arrives with its own voice — the
  // receiving extension may predate these files entirely.
  const SOUND_FILES = {
    hover: "sounds/hover.wav",
    select: "sounds/select.wav",
    "fall-1": "sounds/fall-1.wav",
    "fall-2": "sounds/fall-2.wav",
    "fall-3": "sounds/fall-3.wav",
    chirp: "sounds/chirp.wav",
    step: "sounds/step.wav",
    jump: "sounds/jump.wav",
  };

  // Features a packaged theme can ask content.js for. Kept as data so the
  // importing copy can ignore any it doesn't recognise instead of breaking.
  const FEATURES = {
    "final-fantasy": ["party", "stars", "banner", "composer-glow", "replies"],
    // No "banner": the banner hunt is a claude.ai-only behaviour.
    "final-fantasy-gpt": ["party", "stars", "composer-glow", "replies"],
    "final-fantasy-gemini": ["party", "stars", "composer-glow", "replies"],
  };

  /**
   * Split a declaration block on top-level semicolons.
   *
   * A naive `.split(";")` is wrong here and fails in the worst possible way:
   * every sprite value is `url("data:image/png;base64,...")`, and that MIME
   * type contains a semicolon. Splitting on it truncates every sprite to
   * `url("data:image/png` — still valid CSS, so nothing errors; the icons just
   * silently don't draw.
   */
  function splitDecls(body) {
    const out = [];
    let buf = "", depth = 0, quote = null;
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (quote) {
        if (c === quote && body[i - 1] !== "\\") quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === ";" && depth === 0) { out.push(buf); buf = ""; continue; }
      buf += c;
    }
    out.push(buf);
    return out.map((s) => s.trim()).filter(Boolean);
  }

  /**
   * Strip CSS block comments, respecting quoted strings.
   *
   * Not cosmetic. The generated sprite sheets label each variable with a
   * trailing comment on the same line as its semicolon. Splitting the block on
   * `;` therefore leaves that comment glued to the FRONT of the next
   * declaration, so its name parses as "<comment> --yume-nav-1", fails the
   * "starts with --" test, and is dropped. Every variable after the first in a
   * commented sheet vanished — which showed up as five nav/recents icons
   * computing to `background-image: none` in an imported theme while the
   * bundled one was fine. tools/pack-test.mjs is what caught it.
   */
  function stripComments(css) {
    let out = "", quote = null;
    for (let i = 0; i < css.length; i++) {
      const c = css[i];
      if (quote) {
        out += c;
        if (c === quote && css[i - 1] !== "\\") quote = null;
        continue;
      }
      if (c === '"' || c === "'") { quote = c; out += c; continue; }
      if (c === "/" && css[i + 1] === "*") {
        const end = css.indexOf("*/", i + 2);
        if (end < 0) break;
        // Replaced with a space, not nothing: `a/**/b` is two tokens, not one.
        out += " ";
        i = end + 1;
        continue;
      }
      out += c;
    }
    return out;
  }

  /** Collect `--name: value` pairs out of every :root block in a stylesheet. */
  function rootVars(cssRaw) {
    const css = stripComments(cssRaw);
    const vars = new Map();
    // Match `:root {` ... `}` — the sprite sheets are generated and contain no
    // nested braces inside :root, so a lazy match to the first `}` is exact.
    const re = /:root\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(css))) {
      for (const decl of splitDecls(m[1])) {
        const i = decl.indexOf(":");
        if (i < 0) continue;
        const name = decl.slice(0, i).trim();
        if (name.startsWith("--")) vars.set(name, decl.slice(i + 1).trim());
      }
    }
    return vars;
  }

  const referenced = (css) => {
    const out = new Set();
    const re = /var\(\s*(--[A-Za-z0-9_-]+)/g;
    let m;
    while ((m = re.exec(css))) out.add(m[1]);
    return out;
  };

  /**
   * Resolve every custom property the theme needs, following var() chains.
   * `--yume-party-poses` is a number used by `--yume-party-frame-w`'s calc(),
   * so stopping at direct references would ship a sprite sheet with a broken
   * frame width.
   */
  function resolveVars(themeCss, pool) {
    const want = referenced(stripComments(themeCss));
    const got = new Map();
    const queue = [...want];
    while (queue.length) {
      const name = queue.shift();
      if (got.has(name) || !pool.has(name)) continue;
      const value = pool.get(name);
      got.set(name, value);
      for (const dep of referenced(value)) if (!got.has(dep)) queue.push(dep);
    }
    return got;
  }

  /** Pull the @font-face blocks whose family the theme actually names. */
  function fontFaces(fontCss, themeCss) {
    const out = [];
    const re = /@font-face\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(fontCss))) {
      const body = m[1];
      const fam = /font-family\s*:\s*["']([^"']+)["']/.exec(body);
      if (!fam) continue;
      // Quoted match only: an unquoted substring search would match a family
      // whose name is a prefix of another.
      if (!themeCss.includes(`"${fam[1]}"`) && !themeCss.includes(`'${fam[1]}'`)) continue;
      out.push({ family: fam[1], body });
    }
    return out;
  }

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  /**
   * @param {object} meta      the themes.json entry (id, name, emoji, bg, …)
   * @param {(path: string) => Promise<string>} readText
   * @param {(path: string) => Promise<string>} readBase64  for woff2 files
   * @returns {Promise<object>} an exportable theme carrying rawCss
   */
  async function packTheme(meta, readText, readBase64) {
    const id = meta.id;
    const themeCss = await readText(`themes/${id}.css`);

    // Sprite sheets are optional: a theme that uses none still packs cleanly.
    const pool = new Map();
    for (const path of SPRITE_SHEETS) {
      let css;
      try { css = await readText(path); } catch { continue; }
      for (const [k, v] of rootVars(css)) pool.set(k, v);
    }
    const vars = resolveVars(themeCss, pool);

    // Sounds, inlined. Unlike the sprites (which live in the stylesheet as
    // data URIs already), audio is loaded by content.js at runtime — from the
    // EXTENSION's files. A theme shared to an older or different build would
    // find nothing there, so the package carries its own copies and the
    // player prefers them. Missing files are skipped: a theme with no audio
    // simply packs none.
    const sounds = {};
    for (const [name, path] of Object.entries(SOUND_FILES)) {
      try {
        sounds[name] = "data:audio/wav;base64," + (await readBase64(path));
      } catch { /* not present in this build — skip */ }
    }

    // Fonts, inlined. They are ~8KB together, and a font referenced by URL
    // would 404 the moment the theme left this extension.
    let fontCss = "";
    try {
      const src = await readText("fonts/fonts.css");
      for (const face of fontFaces(src, themeCss)) {
        let body = face.body;
        const url = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(body);
        if (url && !url[1].startsWith("data:")) {
          // The face URL may be extension-absolute (chrome-extension://…/
          // fonts/X.woff2) — only the basename names the file on disk.
          const base = url[1].split("/").pop();
          const b64 = await readBase64(`fonts/${base}`);
          body = body.replace(url[0], `url("data:font/woff2;base64,${b64}") format("woff2")`)
                     .replace(/\s*format\(["']woff2["']\)\s*format\(["']woff2["']\)/, ' format("woff2")');
        }
        fontCss += `@font-face {${body}}\n`;
      }
    } catch { /* no bundled fonts — fine */ }

    // Rewrite the theme's own selector to the portable marker. Both the
    // `html[...]` and bare `[...]` forms appear in hand-written themes.
    const scoped = themeCss
      .replace(new RegExp(`html\\[data-cct-theme=["']${esc(id)}["']\\]`, "g"), "__YUME_ROOT__")
      .replace(new RegExp(`\\[data-cct-theme=["']${esc(id)}["']\\]`, "g"), "__YUME_ROOT__");

    const varBlock = vars.size
      ? `__YUME_ROOT__ {\n${[...vars].map(([k, v]) => `  ${k}: ${v};`).join("\n")}\n}\n`
      : "";

    const rawCss =
      `/* ${meta.name} — packaged by Yume Forge Modified.\n` +
      `   Self-contained: ${vars.size} inlined asset variable(s), ` +
      `${fontCss ? fontCss.match(/@font-face/g).length : 0} inlined font(s). */\n\n` +
      fontCss + (fontCss ? "\n" : "") + varBlock + (varBlock ? "\n" : "") + scoped;

    return {
      schema: 1,
      name: meta.name,
      emoji: meta.emoji || "🎨",
      author: meta.author || "",
      // themes.json `mode` is a display string ("Dark · party + crystal"); the
      // engine wants the light/dark axis. Keep both.
      mode: /^light/i.test(meta.mode || "") ? "light" : "dark",
      subtitle: meta.mode || "",
      bg: meta.bg, text: meta.text, accent: meta.accent,
      // The site travels with the package, so an imported copy files itself
      // under the right tab and the right content script applies it.
      ...(meta.site && meta.site !== "claude" ? { site: meta.site } : {}),
      tokens: {},
      css: "",
      rawCss,
      features: FEATURES[id] || [],
      // Option DECLARATIONS travel with the theme, so an imported copy still
      // gets its settings gear in the popup. Without this the packaged theme
      // arrives with its optional pieces permanently stuck at their defaults
      // and no way to reach them — the CSS for them is right there in rawCss,
      // gated on an attribute nothing would ever stamp.
      //
      // Only the declarations, not the current VALUES: settings are per-person,
      // and shipping your toggles would silently reconfigure someone else's
      // copy on import.
      options: Array.isArray(meta.options) ? meta.options.map((o) => ({ ...o })) : [],
      ...(Object.keys(sounds).length ? { sounds } : {}),
    };
  }

  globalThis.YumePacker = { packTheme, splitDecls, stripComments, rootVars, resolveVars, fontFaces, SPRITE_SHEETS, FEATURES };
})();
