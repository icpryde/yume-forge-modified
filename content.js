// Yume Forge — content script.
//
// Bundled themes are plain CSS files listed in the manifest; all this does for
// them is stamp data-cct-theme on <html> so the right rule set wins.
//
// Custom themes can't live in the manifest, so they're compiled from their
// stored token map at runtime and injected as a single <style>. The editor can
// also push a live-preview theme that overrides the saved selection, which is
// what makes "edit in the studio, watch claude.ai update" work.
(() => {
  "use strict";

  const E = globalThis.YumeEngine;
  const ATTR = "data-cct-theme";
  const STYLE_ID = "yume-custom-style";
  const FEAT_ATTR = "data-yume-feat";
  const OPT_ATTR = "data-yume-opt";

  // Which site this copy of the script woke up on. Everything DOM-shaped
  // (composer, reply detection, banner hunt) branches on this once, up front;
  // the sound pipeline, party mechanics and scheduling are site-agnostic.
  // The harness override exists because a file:// fixture cannot fake its
  // hostname — smoke sets it before loading this script to drive the
  // chatgpt- and gemini-shaped fixtures down their site paths.
  const SITE = globalThis.__YUME_TEST_SITE ||
    (/(^|\.)chatgpt\.com$/.test(location.hostname) ? "chatgpt" :
     /(^|\.)gemini\.google\.com$/.test(location.hostname) ? "gemini" : "claude");

  // Each site has its own selected-theme slot; see theme-engine.
  const SEL_KEY = E.selectedKeyFor(SITE);

  // Kept in step with lib/packer.js FEATURES — that is what an exported copy
  // carries, this is what the bundled original uses.
  // No "banner" for the ChatGPT and Gemini themes: the banner hunt is a
  // claude.ai-Home notion (usage notices dropped into the composer strip);
  // neither of the other sites has an equivalent band to police.
  const BUNDLED_FEATURES = {
    "final-fantasy": ["party", "stars", "banner", "composer-glow", "replies"],
    "final-fantasy-gpt": ["party", "stars", "composer-glow", "replies"],
    "final-fantasy-gemini": ["party", "stars", "composer-glow", "replies"],
  };
  const PREVIEW_KEY = "yumePreview";

  let selectedId = null;   // what the popup saved
  let previewTheme = null; // what the editor is currently previewing
  let customList = [];
  let optionValues = {};   // { themeId: { optionId: bool } } from the popup
  let bundledMeta = {};    // { themeId: themesJsonEntry } — option declarations
  let currentOpts = [];    // refreshed by applyAttr; read hot by the sound hooks

  // Sound pipeline state. Declared HERE, not down in the sound module: the
  // startup storage read calls applyAttr, which resets this pipeline on theme
  // change — and under the dev shim that callback is SYNCHRONOUS, so these
  // must initialize before it, or the whole script dies on a TDZ error while
  // the real extension (async callbacks) hides the bug entirely.
  let audioCtx = null;
  let soundGain = null;
  let soundBuffers = null;   // { name: AudioBuffer } once decoded
  let soundBytes = null;     // collected wav bytes, waiting for a context
  let soundState = "idle";   // idle -> priming -> ready | failed
  let soundThemeKey = null;  // which theme primed the current byte set

  const activeTheme = () =>
    previewTheme ||
    (E.isCustomId(selectedId) ? customList.find((t) => t.id === selectedId) : null);

  const activeId = () => (previewTheme ? previewTheme.id : selectedId);

  /* ------------------------------------------------------------ attribute */

  function applyAttr() {
    const root = document.documentElement;
    const id = activeId();
    if (id && id !== "default") {
      if (root.getAttribute(ATTR) !== id) root.setAttribute(ATTR, id);
    } else if (root.hasAttribute(ATTR)) {
      root.removeAttribute(ATTR);
    }

    // Per-theme option toggles, published the same way as features so CSS can
    // gate optional pieces of a theme on them (see [data-yume-opt~="..."]).
    currentOpts = activeOptions();
    const opts = currentOpts.join(" ");
    if (opts) {
      if (root.getAttribute(OPT_ATTR) !== opts) root.setAttribute(OPT_ATTR, opts);
    } else if (root.hasAttribute(OPT_ATTR)) {
      root.removeAttribute(OPT_ATTR);
    }

    // Different themes carry different audio; crossing themes resets the
    // sound pipeline so the next prime pulls the right set. The AudioContext
    // itself survives — it is page-level, not theme-level.
    const themeKey = activeId() || "";
    if (themeKey !== soundThemeKey) {
      soundThemeKey = themeKey;
      soundBytes = null;
      soundBuffers = null;
      if (soundState !== "idle") soundState = "idle";
    }

    // Runtime extras (party sprites, shooting stars, banner styling) used to be
    // gated on the literal id "final-fantasy". An exported copy imports under a
    // fresh custom- id, so that gate would silently drop every one of them and
    // the theme would arrive as colours only. Publish what the ACTIVE theme
    // asks for instead, and let CSS and JS both read it from one place.
    const feats = themeFeatures().join(" ");
    if (feats) {
      if (root.getAttribute(FEAT_ATTR) !== feats) root.setAttribute(FEAT_ATTR, feats);
    } else if (root.hasAttribute(FEAT_ATTR)) {
      root.removeAttribute(FEAT_ATTR);
    }
  }

  /** Option ids currently switched ON for the active theme. */
  function activeOptions() {
    const id = activeId();
    if (!id || id === "default") return [];
    // A custom theme carries its own declarations; a bundled one's live in
    // themes.json. Either way the VALUES come from storage.
    const theme = activeTheme() || bundledMeta[id];
    if (!theme) return [];
    return E.enabledOptions({ id, options: theme.options || [] }, optionValues);
  }

  /** Features the active theme wants from this script. */
  function themeFeatures() {
    const t = activeTheme();
    if (t) return Array.isArray(t.features) ? t.features : [];
    // Bundled themes have no stored object to carry a list, so theirs is here.
    return BUNDLED_FEATURES[activeId()] || [];
  }

  const hasFeature = (name) => themeFeatures().includes(name);

  /* ---------------------------------------------------------------- style */

  function applyStyle() {
    const theme = activeTheme();
    let el = document.getElementById(STYLE_ID);

    if (!theme) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      // documentElement at document_start; head may not exist yet.
      (document.head || document.documentElement).append(el);
    }
    const css = E.compileCss(theme);
    if (el.textContent !== css) el.textContent = css;
  }

  const apply = () => { applyAttr(); applyStyle(); };

  /* -------------------------------------------------------------- startup */

  chrome.storage.sync.get([SEL_KEY, E.OPTIONS_KEY], (d) => {
    selectedId = d[SEL_KEY] || null;
    const v = d[E.OPTIONS_KEY];
    optionValues = v && typeof v === "object" ? v : {};
    apply();
  });

  // Option DECLARATIONS for bundled themes. Fetched rather than duplicated here
  // so themes.json stays the single place a theme's settings are described.
  fetch(chrome.runtime.getURL("themes/themes.json"))
    .then((r) => r.json())
    .then((d) => {
      for (const t of d.themes || []) if (t.options) bundledMeta[t.id] = t;
      if (Object.keys(bundledMeta).length) apply();
    })
    .catch(() => { /* themes.json unreadable: options simply stay off */ });

  chrome.storage.local.get([E.STORE_KEY, PREVIEW_KEY], (d) => {
    customList = Array.isArray(d[E.STORE_KEY]) ? d[E.STORE_KEY] : [];
    previewTheme = d[PREVIEW_KEY] || null;
    apply();
  });

  /* ----------------------------------------------------------------- live */

  chrome.storage.onChanged.addListener((changes, area) => {
    let dirty = false;

    if (area === "sync" && changes[SEL_KEY]) {
      selectedId = changes[SEL_KEY].newValue || null;
      dirty = true;
    }
    if (area === "local" && changes[E.STORE_KEY]) {
      customList = Array.isArray(changes[E.STORE_KEY].newValue)
        ? changes[E.STORE_KEY].newValue
        : [];
      dirty = true;
    }
    if (area === "sync" && changes[E.OPTIONS_KEY]) {
      const v = changes[E.OPTIONS_KEY].newValue;
      optionValues = v && typeof v === "object" ? v : {};
      dirty = true;
    }
    if (area === "local" && changes.yumeChocoNow && changes.yumeChocoNow.newValue) {
      // Test/preview hook: {v: "a"|"b"|"c", dur?: ms, site?} or a bare variant
      // string. The popup stamps the site it was aimed at, so releasing a
      // chocobo onto the OpenAI tab doesn't also send one sprinting across
      // every open claude.ai tab.
      const v = changes.yumeChocoNow.newValue;
      if (typeof v !== "object" || !v.site || v.site === SITE) {
        runChoco(typeof v === "object" ? v.v : String(v),
                 typeof v === "object" ? v.dur : undefined);
      }
    }
    if (area === "local" && changes[PREVIEW_KEY]) {
      previewTheme = changes[PREVIEW_KEY].newValue || null;
      dirty = true;
    }
    if (dirty) apply();
  });

  // claude.ai rewrites <html> attributes during hydration; put ours back.
  /* ------------------------------------------------------------- chocobo */

  // Drive-by easter egg: every 5-10 minutes (first one 60-120s after load so
  // it can actually be seen the day it ships), one of three runs:
  //   a — across the top of the composer, knocking the party over one by one
  //   b — behind the composer text, right to left, revealed edge-first
  //   c — same as b, left to right
  // CSS owns all movement; this module only spawns elements, schedules the
  // party falls to the moment the bird reaches each member, and cleans up.
  const CHOCO_FIRST = [60e3, 120e3];
  const CHOCO_GAP = [300e3, 600e3];
  let chocoTimer = null;
  let chocoActive = false;
  let chocoAbort = null;   // tears down a run mid-flight (theme switch, orphan)

  function scheduleChoco(first) {
    clearTimeout(chocoTimer);
    const [lo, hi] = first ? CHOCO_FIRST : CHOCO_GAP;
    chocoTimer = setTimeout(() => {
      // Re-checked at fire time rather than cancelling on theme switch: the
      // timer is cheap, and this way switching back never needs replumbing.
      if (isFinalFantasy() && !document.hidden &&
          !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        runChoco("abc"[Math.floor(Math.random() * 3)]);
      }
      scheduleChoco(false);
    }, lo + Math.random() * (hi - lo));
  }

  function runChoco(variant, dur) {
    if (!isFinalFantasy() || chocoActive) return;
    const host = composer();
    if (!host) return;
    chocoActive = true;
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));

    // Run audio. Same option gate as the UI blips; the autoplay rules still
    // apply, so a run before the page's first click is simply silent.
    let stepTimer = null;
    if (soundsOn()) {
      primeSounds();
      ensureSounds();
      playSound("chirp", false);
    }
    const startSteps = (quietWindows) => {
      if (!soundsOn()) return;
      let n = 0, elapsed = 0;
      // 220ms = one gait cycle. Alternating playback rate gives two feet
      // without a second file; the quiet windows silence the taps mid-leap,
      // where feet touch nothing.
      stepTimer = setInterval(() => {
        elapsed += 220; n++;
        if (quietWindows && quietWindows.some(([a, b]) => elapsed >= a && elapsed <= b)) return;
        playSound("step", false, n % 2 ? 1 : 1.14);
      }, 220);
    };
    const stopSteps = () => { clearInterval(stepTimer); stepTimer = null; };

    if (variant === "a") {
      // The parkour route: in along the screen bottom, leap onto the
      // composer, cross it tripping the party, leap off the right edge, out
      // along the bottom. All geometry is measured NOW, in VIEWPORT
      // coordinates, so any window and composer size produce a correct path.
      //
      // Two birds play the one chocobo. claude.ai wraps the app in
      // overflow-hidden containers that clip a composer-child the moment it
      // leaves the content column, so the ground and leap segments belong to
      // a position:fixed "sky" bird on <body> (immune to ancestor clipping),
      // while the crossing segment belongs to a composer-child bird at z 39
      // so it still passes BEHIND the party (z 40). They swap at the leap
      // landings, where both stand on the same pixel.
      const C = host.getBoundingClientRect();
      const cs = getComputedStyle(document.documentElement);
      const w2 = (parseFloat(cs.getPropertyValue("--yume-ff-choco-w")) || 16) * 2;
      const h2 = (parseFloat(cs.getPropertyValue("--yume-ff-choco-h")) || 16) * 2;

      const ground = innerHeight - h2 - 10;               // viewport y, feet near the bottom
      const boxTop = C.top - h2;                          // viewport y, feet on the composer
      const JUMP_DX = 92;

      // Waypoint x's (viewport space), clamped strictly increasing — slim
      // margins can fold the ideal takeoff past the entry point, and WAAPI
      // rejects non-monotonic offsets outright.
      const xs = [
        -w2 - 8,                                          // off screen left
        C.left + 6 - JUMP_DX,                             // takeoff
        C.left + 6,                                       // on the box, left edge
        C.right - w2 - 6,                                 // far edge
        C.right + 74,                                     // touchdown
        innerWidth + w2 + 8,                              // off screen right
      ];
      for (let i = 1; i < xs.length; i++) xs[i] = Math.max(xs[i], xs[i - 1] + 12);
      const ys = [ground, ground, boxTop, boxTop, ground, ground];

      const L = xs[5] - xs[0];
      const speed = dur ? L / dur : 0.185;                // px per ms
      const total = L / speed;
      const T = xs.map((x) => (x - xs[0]) / speed);       // waypoint times

      const leap = (i, peak, frames) => {
        for (let k = 1; k <= 4; k++) {
          const f = k / 4;
          frames.push({
            transform: `translate(${xs[i] + (xs[i + 1] - xs[i]) * f}px, ` +
                       `${ys[i] + (ys[i + 1] - ys[i]) * f - peak * 4 * f * (1 - f)}px)`,
            offset: Math.min((T[i] + (T[i + 1] - T[i]) * f) / total, 1),
          });
        }
      };

      // Sky bird: the full route (its crossing stretch is spent hidden).
      const frames = [{ transform: `translate(${xs[0]}px, ${ys[0]}px)`, offset: 0 }];
      frames.push({ transform: `translate(${xs[1]}px, ${ys[1]}px)`, offset: T[1] / total });
      leap(1, 34, frames);                                // up onto the box
      frames.push({ transform: `translate(${xs[3]}px, ${ys[3]}px)`, offset: T[3] / total });
      leap(3, 26, frames);                                // off the far edge
      frames.push({ transform: `translate(${xs[5]}px, ${ys[5]}px)`, offset: 1 });

      const mkBird = (cls) => {
        const b = document.createElement("div");
        b.className = cls;
        b.setAttribute("aria-hidden", "true");
        const sprite = document.createElement("div");
        sprite.className = "yume-choco";
        b.append(sprite);
        return b;
      };

      const sky = mkBird("yume-choco-sky");
      document.body.append(sky);
      const skyAnim = sky.animate(frames, { duration: total, easing: "linear", fill: "forwards" });

      // Box bird: exists only for the crossing, in composer-local coords.
      const el = mkBird("yume-choco-a");
      el.style.visibility = "hidden";
      host.append(el);
      let boxAnim = null;
      later(() => {
        sky.style.visibility = "hidden";
        el.style.visibility = "";
        boxAnim = el.animate([
          { transform: `translate(${xs[2] - C.left}px, ${-h2}px)` },
          { transform: `translate(${xs[3] - C.left}px, ${-h2}px)` },
        ], { duration: T[3] - T[2], easing: "linear", fill: "forwards" });
      }, T[2]);
      later(() => {
        el.style.visibility = "hidden";
        sky.style.visibility = "";
      }, T[3]);

      startSteps([[T[1], T[2]], [T[3], T[4]]]);
      if (soundsOn()) {
        later(() => playSound("jump", false), T[1]);
        later(() => playSound("jump", false, 0.94), T[3]);   // heavier second leap
      }

      const members = [...host.querySelectorAll(".yume-party-member")];
      // Fall voices in party order: A4, A5, A6, then A4 again for the fourth.
      const FALL_SOUNDS = ["fall-1", "fall-2", "fall-3", "fall-1"];
      members.forEach((m, mi) => {
        const r = m.getBoundingClientRect();
        const x = r.left + r.width / 2 - w2;              // bird's head reaches them
        if (x <= xs[2] || x >= xs[3]) return;
        later(() => {
          if (m.dataset.pose === "idle") {
            m.dataset.pose = "fall";
            m.style.setProperty("--pose", String(FALL_POSE));
            playSound(FALL_SOUNDS[mi % FALL_SOUNDS.length], false);
          }
        }, T[2] + (x - xs[2]) / speed);
      });

      const standUp = () => members.forEach((m, i) => later(() => {
        if (m.dataset.pose === "fall") {
          m.style.removeProperty("--pose");
          m.dataset.pose = "idle";
        }
      }, i * 150));
      later(standUp, T[4] + 120);

      later(() => {
        sky.remove();
        el.remove();
        stopSteps();
        later(() => { chocoActive = false; chocoAbort = null; }, 240 + members.length * 150);
      }, total + 60);

      chocoAbort = () => {
        timers.forEach(clearTimeout);
        stopSteps();
        skyAnim.cancel();
        if (boxAnim) boxAnim.cancel();
        sky.remove();
        el.remove();
        for (const m of members) {
          if (m.dataset.pose === "fall") {
            m.style.removeProperty("--pose");
            m.dataset.pose = "idle";
          }
        }
        chocoActive = false; chocoAbort = null;
      };
    } else {
      dur = dur || 4200;
      const clip = document.createElement("div");
      clip.className = "yume-choco-clip";
      clip.setAttribute("aria-hidden", "true");
      const el = document.createElement("div");
      el.className = "yume-choco " + (variant === "c" ? "yume-choco-c" : "yume-choco-b");
      clip.append(el);
      // The reveal trick needs the element whose background the bird hides
      // behind. On claude that IS the composer host; on chatgpt the paint
      // lives on the [data-composer-surface] child of the form, so the clip
      // mounts there (the theme grants it a stacking context for the z:-1).
      const clipHost = SITE === "chatgpt"
        ? host.querySelector("[data-composer-surface]") || host
        : host;
      clipHost.append(clip);
      // Measured after append — clientWidth is 0 before layout knows it.
      el.style.setProperty("--choco-dist", clip.clientWidth + "px");
      el.style.setProperty("--choco-dur", dur + "ms");

      startSteps(null);
      later(() => { clip.remove(); stopSteps(); chocoActive = false; chocoAbort = null; }, dur + 120);
      chocoAbort = () => {
        timers.forEach(clearTimeout);
        stopSteps();
        clip.remove();
        chocoActive = false; chocoAbort = null;
      };
    }
  }

  scheduleChoco(true);

  /* ------------------------------------------------------- icon glyphs */

  // claude.ai draws many small icons as Private Use Area characters from its
  // Anthropicons font (the Cowork tray taught us this). CSS cannot select by
  // text, so this marks the glyph's host span with data-yume-icon and lets
  // the theme swap in a sprite. One map entry per adopted icon.
  const ICON_GLYPHS = {
    "\uE098": "bolt",        // Routines
    "\uE05E": "hourglass",   // Dispatch
    "\uE0D6": "star",        // Customize sidebar (menu row)
    "\uE017": "artifacts",   // Artifacts (sidebar dialog)
    "\uE100": "case",        // Customize (sidebar dialog)
  };

  function markIconGlyphs(root) {
    // Anthropicons live on claude.ai only; chatgpt draws its icons as SVG
    // sprite refs, which CSS reaches directly — no marking needed there.
    if (SITE !== "claude" || !isFinalFantasy()) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const v = t.nodeValue.trim();
      if (v.length !== 1 || !ICON_GLYPHS[v]) continue;
      const el = t.parentElement;
      if (el && el.dataset.yumeIcon !== ICON_GLYPHS[v]) el.dataset.yumeIcon = ICON_GLYPHS[v];
    }
  }

  // Menus and dialogs are portaled in on demand; a light childList observer
  // catches them the moment they mount.
  new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1) markIconGlyphs(n);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  /* ---------------------------------------------------------- menu sounds */

  // The FF menu cursor blip on hover (and keyboard focus — the d-pad case),
  // and the confirm chime on click. Gated on the per-theme "menu-sounds"
  // option, so nothing below runs for other themes or when toggled off.
  //
  // Web Audio rather than <audio>: hover can fire in quick bursts, and
  // buffer-source playback is the only way overlapping blips stay clean.
  const SOUND_OPT = "menu-sounds";
  const SOUND_FILES = {
    hover: "sounds/hover.wav",
    select: "sounds/select.wav",
    "fall-1": "sounds/fall-1.wav",     // user's A4 — 1st and 4th party fall
    "fall-2": "sounds/fall-2.wav",     // A5 — 2nd
    "fall-3": "sounds/fall-3.wav",     // A6 — 3rd
    chirp: "sounds/chirp.wav",         // chocobo announcing itself
    step: "sounds/step.wav",           // synthesized tap  (tools/gen-chip-sfx.py)
    jump: "sounds/jump.wav",           // synthesized boing (tools/gen-chip-sfx.py)
  };

  // Relative loudness. Every file is normalized to the same −6 dB peak, so
  // "subtle" is decided HERE, in one tweakable place, not baked into audio
  // files that would need regenerating: the gag sounds sit well under the UI
  // blips by design.
  const SOUND_VOLUMES = {
    // The UI blips fire far more often than anything else, so they sit well
    // below full scale — tuned down twice by ear (master cut, then this).
    hover: 0.35, select: 0.35,
    "fall-1": 0.4, "fall-2": 0.4, "fall-3": 0.4,
    chirp: 0.45,
    step: 0.22,
    jump: 0.3,
  };

  let lastBlipEl = null;     // dedupe: one blip per entered control
  let lastBlipAt = 0;

  const soundsOn = () => alive() && currentOpts.includes(SOUND_OPT);

  // Controls that should blip. Deliberately close to what a JRPG menu would
  // call a "row": links, buttons and menu-ish roles. Text inputs excluded —
  // brushing past the composer is not a menu move.
  const SOUND_TARGETS = 'a[href], button, [role="button"], [role="menuitem"],' +
    ' [role="option"], [role="tab"], [role="radio"], [role="checkbox"], [role="link"], summary';

  /**
   * Stage 1: collect the wav bytes. Needs no gesture, so it runs on the first
   * hover — but NO AudioContext is constructed here. Chrome's autoplay policy
   * logs "The AudioContext was not allowed to start" the moment one is
   * created before the page has seen a user gesture, and that line lands in
   * the extension's error panel looking exactly like a bug.
   *
   * Source order per sound: the ACTIVE THEME's embedded data URI first, then
   * this build's bundled file. An imported theme carries its own audio
   * precisely because the receiving extension may predate these files — the
   * sprites travel inside the stylesheet, and sounds travel here.
   */
  function primeSounds() {
    if (soundState !== "idle") return;
    soundState = "priming";
    const themeSounds = (activeTheme() || {}).sounds || {};
    const fromDataUri = (uri) => {
      const bin = atob(uri.slice(uri.indexOf(",") + 1));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return Promise.resolve(bytes.buffer);
    };
    const grab = (name) =>
      typeof themeSounds[name] === "string" && themeSounds[name].startsWith("data:")
        ? fromDataUri(themeSounds[name])
        : fetch(chrome.runtime.getURL(SOUND_FILES[name]))
            .then((r) => { if (!r.ok) throw new Error(name); return r.arrayBuffer(); });
    const names = Object.keys(SOUND_FILES);
    // allSettled, not all: a theme missing one sound (or an old build missing
    // a file) should not silence every other sound with it.
    Promise.allSettled(names.map((n) => grab(n)))
      .then((results) => {
        soundBytes = {};
        let any = false;
        results.forEach((r, i) => {
          if (r.status === "fulfilled") { soundBytes[names[i]] = r.value; any = true; }
        });
        if (!any) { soundState = "failed"; return; }
        maybeDecode();
      });
    // Decode at the first real gesture — pointerdown leads click by enough
    // that even the very first select chime has its buffer ready.
    const onGesture = () => ensureSounds();
    document.addEventListener("pointerdown", onGesture, { capture: true, once: true });
    document.addEventListener("keydown", onGesture, { capture: true, once: true });
  }

  /**
   * Stage 2: construct the context — only once the page holds sticky
   * activation, which is precisely Chrome's own "allowed to start" test.
   * Before that this is a silent no-op and hover blips simply don't play,
   * which is the same behaviour as before minus the scary panel entry.
   */
  function ensureSounds() {
    if (audioCtx || soundState === "failed") return;
    if (!navigator.userActivation || !navigator.userActivation.hasBeenActive) return;
    try {
      audioCtx = new AudioContext();
      soundGain = audioCtx.createGain();
      // 0.6 originally; dropped 20% on request — one number scales every
      // sound uniformly, per-sound balance stays in SOUND_VOLUMES.
      soundGain.gain.value = 0.48;
      soundGain.connect(audioCtx.destination);
    } catch {
      soundState = "failed";   // no Web Audio here; stay silent forever
      return;
    }
    maybeDecode();
  }

  /** Bytes and context arrive in either order; decode when both exist. */
  function maybeDecode() {
    if (!audioCtx || !soundBytes || soundBuffers || soundState === "failed") return;
    const names = Object.keys(soundBytes);
    Promise.allSettled(names.map((n) => audioCtx.decodeAudioData(soundBytes[n].slice(0))))
      .then((results) => {
        soundBuffers = {};
        let any = false;
        results.forEach((r, i) => {
          if (r.status === "fulfilled") { soundBuffers[names[i]] = r.value; any = true; }
        });
        soundState = any ? "ready" : "failed";
      });
  }

  function playSound(name, isGesture, rate) {
    if (soundState !== "ready") return;
    const go = () => {
      // The context can wind down between plays; re-check rather than throw.
      if (!soundBuffers || !soundBuffers[name] || audioCtx.state !== "running") return;
      const src = audioCtx.createBufferSource();
      src.buffer = soundBuffers[name];
      if (rate) src.playbackRate.value = rate;
      // Per-sound trim on its own gain node, so one map entry adjusts a
      // sound without touching the files or the master level.
      const g = audioCtx.createGain();
      g.gain.value = SOUND_VOLUMES[name] != null ? SOUND_VOLUMES[name] : 1;
      src.connect(g);
      g.connect(soundGain);
      src.start();
    };
    if (audioCtx.state === "suspended") {
      // Autoplay policy: the context stays suspended until a user gesture.
      // A click IS one, so resuming inside it works and the select chime
      // plays from the very first click. Hover is NOT a gesture — those
      // blips are skipped until the first click unlocks the context.
      if (isGesture) audioCtx.resume().then(go).catch(() => {});
      else audioCtx.resume().catch(() => {});
      return;
    }
    go();
  }

  function blipTarget(e) {
    const t = e.target;
    if (!(t instanceof Element)) return null;
    const el = t.closest(SOUND_TARGETS);
    if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") return null;
    return el;
  }

  // Capture phase throughout: the app stops propagation on plenty of its
  // controls, and a sound hook should observe, never depend on bubbling.
  document.addEventListener("mouseover", (e) => {
    if (!soundsOn()) return;
    const el = blipTarget(e);
    if (!el || el === lastBlipEl) return;   // crossing child boundaries re-fires
    lastBlipEl = el;
    const now = performance.now();
    if (now - lastBlipAt < 35) return;      // sweeping a menu still blips per row
    lastBlipAt = now;
    primeSounds();
    ensureSounds();
    playSound("hover", false);
  }, true);

  document.addEventListener("mouseout", (e) => {
    if (!lastBlipEl) return;
    const to = e.relatedTarget;
    // Only clear when truly leaving the control, so wandering across its own
    // children doesn't re-blip.
    if (!(to instanceof Element) || !lastBlipEl.contains(to)) lastBlipEl = null;
  }, true);

  // Keyboard navigation is the authentic case — the original sound IS a
  // cursor-move sound. Shares lastBlipEl with hover so the focus a click
  // causes doesn't double-blip.
  document.addEventListener("focusin", (e) => {
    if (!soundsOn()) return;
    const el = blipTarget(e);
    if (!el || el === lastBlipEl) return;
    lastBlipEl = el;
    primeSounds();
    ensureSounds();
    playSound("hover", false);
  }, true);

  document.addEventListener("click", (e) => {
    if (!soundsOn()) return;
    if (!blipTarget(e)) return;
    primeSounds();
    ensureSounds();
    playSound("select", true);
  }, true);

  new MutationObserver(applyAttr).observe(document.documentElement, {
    attributes: true,
    attributeFilter: [ATTR],
  });

  // The app can also blow away head children on first paint — re-assert once.
  window.addEventListener("load", apply);

  /* ------------------------------------------------------ party injection */

  // The Final Fantasy theme draws its party as a single ::before on the
  // composer, which is enough to animate but can never be clicked — a
  // pseudo-element has no box in the hit-test tree. To make each member
  // react individually they have to be real elements, so the theme injects
  // four of them here and CSS suppresses the pseudo-element fallback via
  // [data-yume-party="dom"] on <html>.
  const PARTY_ATTR = "data-yume-party";
  const PARTY_CLASS = "yume-party";
  const MEMBERS = 4;
  const POSES = 6;        // frames per strip: 2 idle + 3 click poses + 1 fall
  const IDLE_POSES = 2;
  const CLICK_POSES = 3;  // random pool for taps — excludes the fall frame
  const FALL_POSE = 5;    // knocked flat; reserved for the chocobo drive-by

  // Chrome orphans content scripts in open tabs when the extension reloads or
  // auto-updates: the manifest CSS is torn down but this script keeps running,
  // leaving injected nodes and timers behind with no styles to match.
  const alive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };

  // Named for the theme it was written for, but the test is now "does the
  // active theme want the party/scenery extras", so an imported copy gets them.
  const isFinalFantasy = () => alive() && hasFeature("party");

  const composer = () => {
    if (SITE === "gemini") {
      // The visual pill every Gemini surface shares (Chat and Spark alike) is
      // .input-area-container — a <fieldset> inside <input-container> wrapping
      // input-area-v2. The party stands on it and the chocobo stages off it.
      // Fallback: the input-area div inside input-area-v2 for builds that
      // drop the fieldset.
      return document.querySelector("input-container .input-area-container") ||
        document.querySelector("input-area-v2 .input-area") ||
        null;
    }
    if (SITE === "chatgpt") {
      // The unified composer <form> wraps the visual box ([data-composer-
      // surface]) and nothing else of consequence, and it survives the
      // Chat/Work tabs alike. The fallback walks up from the surface for any
      // future variant that renames the form's data-type.
      return document.querySelector('form[data-type="unified-composer"]') ||
        document.querySelector("[data-composer-surface]")?.closest("form") ||
        null;
    }
    // Home tab first, then the code tab's epitaxy prompt — the party, the
    // chocobo routes and the banner logic all stage off whichever exists.
    return document.querySelector('div[class*="cursor-text"]:has([data-testid="chat-input"])') ||
      document.querySelector('.epitaxy-prompt:not([class*="prompt-compact-bg"])');
  };

  function buildParty(host) {
    const row = document.createElement("div");
    row.className = PARTY_CLASS;
    // Purely decorative: unlabelled clickable divs would otherwise land in the
    // accessibility tree. aria-hidden does not affect pointer hit-testing.
    row.setAttribute("aria-hidden", "true");
    // Injected rather than styled from the sheet so the markup stays inert:
    // no links, no focusable controls, nothing the app's own key handling
    // could trip over.
    for (let i = 0; i < MEMBERS; i++) {
      const m = document.createElement("div");
      m.className = PARTY_CLASS + "-member";
      m.dataset.member = String(i);
      m.dataset.pose = "idle";
      // The members sit inside claude.ai's click-to-focus surface, so a bare
      // click listener would blur the composer and drop the caret mid-sentence.
      m.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
      m.addEventListener("click", (e) => { e.stopPropagation(); playPose(m); });
      row.append(m);
    }
    host.append(row);
    return row;
  }

  /** One-shot reaction: hold a random action frame, then fall back to idle. */
  function playPose(member) {
    // "fall" guards the chocobo gag: a click mid-fall would stand the member
    // up early and desync the row.
    if (member.dataset.pose === "busy" || member.dataset.pose === "fall") return;
    const pose = IDLE_POSES + Math.floor(Math.random() * CLICK_POSES);
    member.dataset.pose = "busy";
    member.style.setProperty("--pose", String(pose));
    clearTimeout(member._poseTimer);
    member._poseTimer = setTimeout(() => {
      member.style.removeProperty("--pose");
      member.dataset.pose = "idle";
    }, 460);
  }

  /**
   * Keep transient banners clear of the party.
   *
   * These come and go ("You've used 75% of your weekly limit", notification
   * prompts) and their markup is generated, so there is no stable class to
   * target from CSS — every selector guess so far has missed. Measuring at
   * runtime sidesteps that entirely: find whatever box sits directly above the
   * composer and overlaps the sprites horizontally, and pad its right edge so
   * its text AND its close button end before they do.
   */
  const PADDED = "yumePartyPad";
  const WRAP = "yumeBannerWrap";
  let styledBanner = null;

  function padBannersForParty(host) {
    // The banner hunt is a HOME-tab notion: usage warnings mount in the
    // sticky strip around that composer. On the code tab the element its
    // geometry likes best is the repo/branch chip row above the prompt —
    // which promptly got dressed as a menu window. No epitaxy surface needs
    // this treatment; clear and stand down. chatgpt.com and gemini have no
    // banner band at all (and their "banner" feature is never granted), so
    // they stand down the same way rather than dressing whatever sits above
    // the composer.
    if (SITE !== "claude") { clearBannerPadding(); return; }
    if (host.classList.contains("epitaxy-prompt")) { clearBannerPadding(); return; }
    // Every bail-out path clears first. Returning early used to leave the cap
    // and frame frozen on whatever was styled — so shrinking the window below
    // the party breakpoint, or navigating while the composer was unmounted,
    // stranded a narrowed banner permanently.
    const row = host.querySelector(":scope > ." + PARTY_CLASS);
    if (!row) { clearBannerPadding(); return; }
    const rowBox = row.getBoundingClientRect();
    const hostBox = host.getBoundingClientRect();
    if (!rowBox.width || !hostBox.width) { clearBannerPadding(); return; }

    // Resolve the strip by identity, not by counting hops. A fixed 5-hop walk
    // silently lands somewhere else the moment claude.ai adds or removes a
    // wrapper — potentially on the conversation scroller, turning this into a
    // whole-document crawl on every pass.
    const strip = host.closest('div[class*="sticky"][class*="bottom-0"]') || host.parentElement;
    if (!strip) { clearBannerPadding(); return; }

    // Exactly ONE element is ever styled, chosen here and painted with inline
    // styles. This used to tag a set and let a CSS attribute rule paint them,
    // which meant any second element that slipped through the filter — a
    // wrapper sharing the banner's geometry and text — got its own frame too.
    // Picking a single winner makes a doubled border structurally impossible.
    const cap = Math.max(0, Math.round(rowBox.left - hostBox.left - 12));

    let best = null;
    let bestScore = Infinity;
    for (const el of strip.querySelectorAll("div,section,aside")) {
      if (el === host || el.contains(host) || host.contains(el)) continue;
      // Never anything belonging to the conversation itself.
      if (el.closest('[role="article"]') || el.querySelector('[role="article"]')) continue;
      if (el.closest("[data-is-streaming]") || el.querySelector("[data-is-streaming]")) continue;

      const already = el === styledBanner;
      const b = el.getBoundingClientRect();

      // Retention tests — cheap, and NOT perturbed by anything the styling
      // does. Everything below this line only gates INITIAL selection.
      if (!(b.bottom <= hostBox.top + 6 && b.bottom > hostBox.top - 70)) continue;
      if ((el.textContent || "").trim().length <= 3) continue;

      // The height gate used to live outside this guard, and that was the same
      // oscillation as the width one: capping the box rewraps its text and the
      // frame adds 2px, so the element grows past 72px, fails, gets unstyled,
      // shrinks back, and re-qualifies — a strobe at the debounce rate. Both
      // axes the styling can move are now initial-selection only.
      if (!already) {
        if (!(b.height >= 16 && b.height <= 72)) continue;
        const natural = Math.max(b.width, el.scrollWidth);
        if (!(b.left + natural > rowBox.left && natural > 240)) continue;
      }

      // Prefer the incumbent, then the row closest to the composer (siblings
      // stacked in the band are both plausible), then the smallest box.
      const area = b.width * b.height;
      const score = already ? -Infinity : -b.bottom * 1e6 + area;
      if (score < bestScore) { best = el; bestScore = score; }
    }

    if (styledBanner && styledBanner !== best) unstyleBanner(styledBanner);
    if (!best) { styledBanner = null; return; }

    styledBanner = best;

    // Claude wraps the banner in an "alert band": div.w-full ... bg-surface-1
    // rounded-t-[20px] with an inset shadow, ~629x59 around a 397x22 banner.
    // It is opaque dark grey and untouched by the theme, so it reads as a
    // second box around the themed one — which is what looked like a doubled
    // border. Neutralise it rather than trying to style it: it is pure
    // scaffolding, and its own rounding/shadow fight the frame underneath.
    let wrap = best.parentElement;
    for (let i = 0; i < 3 && wrap; i++, wrap = wrap.parentElement) {
      if (wrap === host || wrap.contains(host)) break;
      // Never neutralise the banner itself. If `best` ever moves deeper, the
      // previously-styled element becomes an ancestor on the next pass and
      // would be handed background:transparent — clearing its blue fill and
      // letting Claude's dark bg-surface-1 show through the white frame.
      if (wrap === best || wrap === styledBanner) continue;
      const wcs = getComputedStyle(wrap);
      const opaque = wcs.backgroundColor !== "rgba(0, 0, 0, 0)" || wcs.boxShadow !== "none";
      if (!opaque) continue;
      wrap.dataset[WRAP] = "1";
      wrap.style.setProperty("background", "transparent", "important");
      wrap.style.setProperty("box-shadow", "none", "important");
      wrap.style.setProperty("border-color", "transparent", "important");
    }

    const st = best.style;
    const capPx = cap + "px";
    // !important: the theme also carries a blanket max-width rule for this
    // strip, and a plain inline value loses to it — the banner would be capped
    // by the wrong number and never framed.
    if (st.maxWidth !== capPx) st.setProperty("max-width", capPx, "important");
    // Re-asserted every pass, not just on first tag: setting it once meant any
    // later clear (a re-tag, an unstyle mid-flight) left the frame behind with
    // no fill.
    if (!best.dataset[PADDED] || !st.backgroundImage) {
      best.dataset[PADDED] = "1";
      st.setProperty("background", "linear-gradient(180deg,#1a2568 0%,#0e1442 60%,#070b2a 100%)", "important");
      st.setProperty("border", "2px solid #ffffff", "important");
      st.setProperty("border-bottom", "0", "important");
      st.setProperty("border-radius", "7px 7px 0 0", "important");
      st.setProperty("color", "#ffffff", "important");
      // The element is a bare flex row — its horizontal padding lived on the
      // wrapper we just neutralised, so without this the text sits flush
      // against the new border. box-sizing is border-box app-wide, so this
      // costs no extra width against the cap.
      st.setProperty("padding", "4px 12px", "important");
      st.setProperty("box-sizing", "border-box", "important");
    }
  }

  function unstyleBanner(el) {
    if (!el) return;
    for (const w of document.querySelectorAll("[data-yume-banner-wrap]")) {
      w.style.removeProperty("background");
      w.style.removeProperty("box-shadow");
      w.style.removeProperty("border-color");
      delete w.dataset[WRAP];
    }
    for (const prop of ["max-width", "background", "border", "border-bottom",
                        "border-radius", "color", "padding", "padding-right",
                        "box-sizing"]) {
      el.style.removeProperty(prop);
    }
    delete el.dataset[PADDED];
  }

  function clearBannerPadding() {
    document.querySelectorAll("[data-yume-party-pad]").forEach(unstyleBanner);
    styledBanner = null;
  }

  /**
   * Mark the newest reply so it can breathe.
   *
   * CSS can't pick "the last assistant message" here: the wrappers aren't
   * siblings (each sits inside its own article/index container), so there is no
   * :last-of-type that lands on the right one. Stamping an attribute is both
   * simpler and correct.
   */
  /**
   * Frame only the replies that actually contain something.
   *
   * :has(.font-claude-response) isn't enough on its own: the placeholder Claude
   * keeps mounted for the next turn contains an EMPTY .font-claude-response, so
   * it still matched and drew a stray window above the composer. Text content is
   * the only reliable signal, and CSS can't test for it.
   */
  const REPLY_ATTR = "yumeReply";

  // gpt working-stamp hysteresis (see markReplyWindows): the moment the busy
  // signals last held, plus the pending re-evaluation timer for the quiet
  // period after the final signal unmounts.
  let gptWorkHold = 0;
  let gptWorkTimer = null;

  /**
   * Does this reply body hold any RESPONSE text?
   *
   * textContent alone is the wrong test: while Claude is thinking, the
   * streamed reasoning already sits inside .font-claude-response — collapsed,
   * and marked with [data-find-omitted] so the browser's find-in-page skips
   * it. Counting it stamped the window frame mid-thinking, which yanked the
   * status-row moogle (its rule is gated on :not([data-yume-reply] *)),
   * released the strip-logo suppression so a SECOND moogle popped in below,
   * and drew an empty framed window with a crystal — the flicker seen on
   * video. Once the answer streams, its text lands OUTSIDE the marker (and
   * the settled DOM drops the marker nodes entirely), so skipping
   * [data-find-omitted] subtrees makes the stamp fire exactly when the real
   * reply begins: one clean moogle -> crystal handoff.
   */
  /**
   * Gemini variant of hasReplyText: the marker that must not count is the
   * thoughts subtree rather than claude's [data-find-omitted].
   */
  function hasGeminiReplyText(body) {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.nodeValue.trim()) continue;
      const el = t.parentElement;
      // thinking-overlay is the settled build's leftover shell; the class
      // has-thoughts is deliberately NOT here — it sits on the wrapper that
      // holds the real answer too, and excluding it would blind this walk.
      if (el && el.closest("model-thoughts, .thoughts-container, thinking-overlay, .thinking-banner")) continue;
      return true;
    }
    return false;
  }

  function hasReplyText(body) {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.nodeValue.trim()) continue;
      const el = t.parentElement;
      if (el && el.closest("[data-find-omitted]")) continue;
      return true;
    }
    return false;
  }

  function markReplyWindows() {
    if (SITE === "gemini") {
      // Gemini's turns are .conversation-container (a user-query + a
      // model-response per turn); the reply body is message-content's
      // .markdown. While the model is only thinking, the markdown holds no
      // text yet (the streamed reasoning lives in .thoughts-container /
      // model-thoughts, which also carries "Show thinking" chrome) — so
      // thoughts subtrees are excluded from the text walk and the frame
      // lands exactly when the first real answer token does.
      const replies = document.querySelectorAll("model-response");
      for (const el of replies) {
        const body = el.querySelector("message-content .markdown") ||
          el.querySelector(".markdown");
        const filled = !!body &&
          !body.closest("model-thoughts, .thoughts-container, thinking-overlay") &&
          hasGeminiReplyText(body);
        if (filled) {
          if (!el.dataset[REPLY_ATTR]) el.dataset[REPLY_ATTR] = "1";
        } else if (el.dataset[REPLY_ATTR]) {
          delete el.dataset[REPLY_ATTR];
        }
      }

      // "Working" = the newest model-response while the run is in flight.
      // Union of signals, same shape as the chatgpt detector: the stop
      // affordance replaces the send arrow for the whole run, the
      // generation-time loaders (skeleton/shimmer/thinking banner — probed
      // off the live build's stylesheets; none exist at rest) cover the
      // silent reasoning stretch, and the actions row under the reply
      // mounts at completion. The spinner check stays SCOPED to the last
      // reply: a hidden mat-progress-spinner idles inside the history
      // scroller at rest (pagination), so a document-wide spinner test
      // would read as busy forever. Hysteresis below smooths hand-offs.
      const last = replies[replies.length - 1] || null;
      const busy = !!(
        document.querySelector('button[aria-label*="stop" i], .stop-icon, [class*="stop-generating"]') ||
        document.querySelector(".thinking-banner, .skeleton-loader-container, .gem-shimmer-active") ||
        (last && (
          !last.querySelector("message-actions") ||
          last.querySelector('[class*="streaming"], [class*="generating"], [class*="pending"], .loading-indicator, blinking-cursor') ||
          last.querySelector("mat-progress-spinner, mat-spinner")
        ))
      );

      const now = performance.now();
      if (busy) {
        gptWorkHold = now + 1500;
        if (gptWorkTimer) { clearTimeout(gptWorkTimer); gptWorkTimer = null; }
      }
      const active = busy || now < gptWorkHold;
      const working = active ? last : null;
      if (!busy && active && !gptWorkTimer) {
        gptWorkTimer = setTimeout(() => {
          gptWorkTimer = null;
          markReplyWindows();
          markLatestReply();
        }, gptWorkHold - now + 80);
      }
      for (const el of document.querySelectorAll("[data-yume-working]")) {
        if (el !== working) el.removeAttribute("data-yume-working");
      }
      if (working && !working.hasAttribute("data-yume-working")) {
        working.setAttribute("data-yume-working", "");
      }
      return;
    }
    if (SITE === "chatgpt") {
      // chatgpt's turns are far more declarative than claude's: every turn is
      // a section[data-turn], and the assistant body is .markdown. While the
      // model is still "thinking" the same .markdown carries .result-thinking
      // with an empty <p> inside — text-walking that would stamp the frame on
      // an empty window, so thinking is excluded outright and the stamp lands
      // exactly when the first real token does.
      const turns = document.querySelectorAll('section[data-turn="assistant"]');
      for (const el of turns) {
        const body = el.querySelector(".markdown");
        const filled = !!body && !body.classList.contains("result-thinking") && hasReplyText(body);
        if (filled) {
          if (!el.dataset[REPLY_ATTR]) el.dataset[REPLY_ATTR] = "1";
        } else if (el.dataset[REPLY_ATTR]) {
          delete el.dataset[REPLY_ATTR];
        }
      }
      // chatgpt has no persistent status row under the reply the way claude
      // does, but Mog still needs a perch while the model works. The turn
      // sections aren't siblings (each sits in its own container), so
      // :last-of-type can't find the live one from CSS — stamp it here: the
      // newest assistant turn wears data-yume-working for the whole run.
      //
      // "Working" = the newest assistant turn, judged by run-END first with
      // in-flight signals as backstops — because neither side alone covers
      // every build. Measured on the logged-out build, the response-action
      // row (copy/share) mounts exactly at completion, so its absence spans
      // thinking/searching/reasoning/streaming in one test. But the Pro
      // build PRE-mounts that row with the turn shell (mask-hidden), which
      // made the absence test never fire — so the union adds the phase
      // classes and the stop button back on top. A turn is settled only
      // when the row exists AND no in-flight signal remains.
      // The in-flight classes, measured on a live web-search run: the
      // activity label ("Searching the web…") sits INSIDE the turn with a
      // loading-shimmer-* class and unmounts completely at settle — that
      // family is what carries the search/reasoning stretch, where the
      // thinking body is long gone and (on Pro) the stop button is too.
      const last = turns[turns.length - 1] || null;
      const busy = !!(last && (
        !last.querySelector('[data-testid="copy-turn-action-button"]') ||
        last.querySelector('.result-thinking, .streaming-animation, [class*="loading-shimmer"]') ||
        document.querySelector('[data-testid="stop-button"]')));

      // HYSTERESIS. The Pro build hands off between phase widgets with brief
      // moments where NO signal is mounted, and tracking the union instantly
      // made Mog pop in and out at each hand-off. Once busy, the stamp holds
      // for a grace window that every busy pass refreshes; it only clears
      // after the signals have been gone for the whole window. Run-end costs
      // Mog ~1.5s of overstay; mid-run gaps cost nothing. The timer exists
      // because passes are mutation-driven — a silent DOM after the last
      // signal would otherwise never re-evaluate and never clear.
      const now = performance.now();
      if (busy) {
        gptWorkHold = now + 1500;
        if (gptWorkTimer) { clearTimeout(gptWorkTimer); gptWorkTimer = null; }
      }
      const active = busy || now < gptWorkHold;
      const working = active ? last : null;
      if (!busy && active && !gptWorkTimer) {
        gptWorkTimer = setTimeout(() => {
          gptWorkTimer = null;
          markReplyWindows();
          markLatestReply();
        }, gptWorkHold - now + 80);
      }
      for (const el of document.querySelectorAll("[data-yume-working]")) {
        if (el !== working) el.removeAttribute("data-yume-working");
      }
      if (working && !working.hasAttribute("data-yume-working")) {
        working.setAttribute("data-yume-working", "");
      }
      return;
    }
    for (const el of document.querySelectorAll("div[data-is-streaming]")) {
      const body = el.querySelector(".font-claude-response");
      const filled = !!body && hasReplyText(body);
      if (filled) {
        if (!el.dataset[REPLY_ATTR]) el.dataset[REPLY_ATTR] = "1";
      } else if (el.dataset[REPLY_ATTR]) {
        delete el.dataset[REPLY_ATTR];
      }
    }
  }

  function clearReplyWindows() {
    document.querySelectorAll("[data-yume-reply]")
      .forEach((el) => delete el.dataset[REPLY_ATTR]);
    document.querySelectorAll("[data-yume-working]")
      .forEach((el) => el.removeAttribute("data-yume-working"));
    if (gptWorkTimer) { clearTimeout(gptWorkTimer); gptWorkTimer = null; }
    gptWorkHold = 0;
  }

  const LATEST_ATTR = "data-yume-latest";

  function markLatestReply() {
    // Must select from the SAME set markReplyWindows frames. Selecting from all
    // wrappers put the tag on the empty next-turn placeholder, which is mounted
    // most of the time — so the breathe glow was landing on an element with no
    // frame and the real newest reply never glowed.
    const replies = document.querySelectorAll(
      SITE === "gemini" ? "model-response[data-yume-reply]"
      : SITE === "chatgpt" ? 'section[data-turn="assistant"][data-yume-reply]'
      : "div[data-is-streaming][data-yume-reply]");
    const last = replies[replies.length - 1] || null;
    for (const el of document.querySelectorAll("[" + LATEST_ATTR + "]")) {
      if (el !== last) el.removeAttribute(LATEST_ATTR);
    }
    if (last && !last.hasAttribute(LATEST_ATTR)) last.setAttribute(LATEST_ATTR, "");
  }

  function clearLatestReply() {
    document.querySelectorAll("[" + LATEST_ATTR + "]")
      .forEach((el) => el.removeAttribute(LATEST_ATTR));
  }

  /**
   * gemini only: input-container ships an opaque #0f0f0f of its own that
   * reads as a black band across the viewport bottom. Its utility classes
   * shift between builds (input-gradient / ui-improvements-phase-1 / …), and
   * at least one build beat every stylesheet-level override live — inline
   * importance is the one paint-proof lever, so the stamp happens here.
   * Cleared when the theme goes off, like every other injected change.
   */
  function syncGeminiShell(on) {
    if (SITE !== "gemini") return;
    const ic = document.querySelector("input-container");
    if (!ic) return;
    if (on) {
      if (ic.style.getPropertyValue("background") !== "transparent") {
        ic.style.setProperty("background", "transparent", "important");
      }
    } else if (ic.style.getPropertyValue("background")) {
      ic.style.removeProperty("background");
    }
  }

  function syncParty() {
    if (!alive()) {
      // Orphaned — tear our own additions out rather than leaving them stranded.
      document.querySelectorAll("." + PARTY_CLASS).forEach((n) => n.remove());
      document.querySelectorAll("." + STAR_CLASS).forEach((n) => n.remove());
      clearBannerPadding(); clearReplyWindows(); clearLatestReply();
      if (chocoAbort) chocoAbort();
      clearTimeout(chocoTimer);
      clearTimeout(starTimer); starTimer = null;
      return;
    }
    const on = isFinalFantasy();
    const host = on ? composer() : null;
    syncGeminiShell(on);

    // The attribute tracks "this script is managing the party", not "the party
    // is mounted right now". Clearing it while the composer is briefly
    // unmounted during navigation would un-suppress the ::before fallback and
    // flash a second, static party.
    if (!on) {
      document.querySelectorAll("." + PARTY_CLASS).forEach((n) => n.remove());
      clearBannerPadding();
      clearLatestReply();
      clearReplyWindows();
      // A chocobo mid-run belongs to this theme too; don't leave it sprinting
      // over dracula. The schedule timer stays — it re-checks the theme when
      // it fires, so switching back needs no replumbing.
      if (chocoAbort) chocoAbort();
      document.documentElement.removeAttribute(PARTY_ATTR);
      return;
    }
    document.documentElement.setAttribute(PARTY_ATTR, "dom");
    markReplyWindows();
    markLatestReply();
    if (!host) return;
    // Re-parent rather than rebuild when the composer is replaced on navigation,
    // so a click mid-animation isn't lost.
    const existing = host.querySelector(":scope > ." + PARTY_CLASS);
    if (!existing) {
      document.querySelectorAll("." + PARTY_CLASS).forEach((n) => n.remove());
      buildParty(host);
    }
    // Runs every pass, not just on build: banners appear and disappear
    // independently of the party.
    watchHost();
    padBannersForParty(host);
  }

  // The composer is torn down and rebuilt on navigation, so watch for it
  // rather than injecting once. Debounced — this fires a lot during streaming.
  // Trailing-edge debounce with a max-wait deadline. A pure trailing debounce
  // never fires during streaming: mutations arrive faster than the delay, so
  // the timer is re-armed forever and the party stays missing for the whole
  // reply — exactly when it is supposed to be animating.
  const PARTY_WAIT = 120;
  const PARTY_MAX = 400;
  let partyTimer = null;
  let partyDeadline = 0;
  const scheduleParty = () => {
    const now = performance.now();
    if (!partyTimer) partyDeadline = now + PARTY_MAX;
    clearTimeout(partyTimer);
    partyTimer = setTimeout(
      () => { partyTimer = null; syncParty(); },
      Math.max(0, Math.min(PARTY_WAIT, partyDeadline - now))
    );
  };

  /* ------------------------------------------------------ moogle tooltip */

  // Claude's hover card for the working glyph introduces itself by name. With
  // a moogle standing in, the name should match. Deliberately narrow: it only
  // rewrites that one phrase, and only inside a live tooltip — no blanket
  // find-and-replace over the app's text.
  const MOOGLE_NAME = "Mog";

  function renameInTooltip(node) {
    // "I'm Claude" appears nowhere on chatgpt.com; skip the walk entirely.
    if (SITE !== "claude" || !isFinalFantasy() || !node || node.nodeType !== 1) return;
    const tips = node.matches?.('[role="tooltip"]') ? [node] : node.querySelectorAll?.('[role="tooltip"]');
    for (const tip of tips || []) {
      const walker = document.createTreeWalker(tip, NodeFilter.SHOW_TEXT);
      let t;
      while ((t = walker.nextNode())) {
        if (/\bI'm Claude\b/.test(t.nodeValue)) {
          t.nodeValue = t.nodeValue.replace(/\bI'm Claude\b/g, "I'm " + MOOGLE_NAME);
        }
      }
    }
  }

  new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) renameInTooltip(n);
  }).observe(document.documentElement, { childList: true, subtree: true });

  /* ------------------------------------------------------- shooting stars */

  // CSS can stagger but it can't randomise: a pure-CSS version would replay the
  // same handful of paths on a fixed cycle, which reads as a loop rather than
  // as weather. Spawning from JS gives a genuinely different angle, position,
  // length and speed each time.
  const STAR_CLASS = "yume-shooting-star";
  const STAR_MIN_GAP = 9000;
  const STAR_MAX_GAP = 27000;

  let starTimer = null;

  const rand = (lo, hi) => lo + Math.random() * (hi - lo);

  function spawnShootingStar() {
    if (!isFinalFantasy()) return;
    if (document.hidden) return; // don't pile up while the tab is backgrounded
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const star = document.createElement("div");
    star.className = STAR_CLASS;

    // Two families of path so they don't all fall the same way. Each starts
    // off the edge it travels away from, so the entry isn't a pop-in.
    const goRight = Math.random() < 0.5;
    const angle = goRight ? rand(18, 42) : rand(138, 162);
    const startX = goRight ? rand(-15, 55) : rand(45, 115);
    const startY = rand(-8, 28);

    star.style.setProperty("--ang", angle.toFixed(2) + "deg");
    star.style.setProperty("--len", Math.round(rand(90, 220)) + "px");
    star.style.setProperty("--travel", Math.round(rand(70, 130)) + "vw");
    star.style.setProperty("--dur", rand(0.9, 2.1).toFixed(2) + "s");
    star.style.left = startX.toFixed(2) + "vw";
    star.style.top = startY.toFixed(2) + "vh";

    star.addEventListener("animationend", () => star.remove(), { once: true });
    document.body.append(star);
    // Belt and braces: if the animation never fires (tab switch mid-flight),
    // don't leak the node.
    setTimeout(() => star.remove(), 6000);
  }

  function scheduleShootingStar() {
    clearTimeout(starTimer);
    starTimer = setTimeout(() => {
      spawnShootingStar();
      // Occasionally a pair, the way real ones cluster.
      if (Math.random() < 0.18) setTimeout(spawnShootingStar, rand(400, 1400));
      scheduleShootingStar();
    }, rand(STAR_MIN_GAP, STAR_MAX_GAP));
  }

  function syncShootingStars() {
    if (isFinalFantasy()) {
      if (!starTimer) scheduleShootingStar();
    } else {
      clearTimeout(starTimer);
      starTimer = null;
      document.querySelectorAll("." + STAR_CLASS).forEach((n) => n.remove());
    }
  }

  // A document-wide childList/subtree observer is expensive on a page that
  // mutates as much as this one, so it only runs while the theme that needs it
  // is active. The attribute observer is cheap and always on, since it is what
  // notices the theme being switched on.
  const partyMO = new MutationObserver(scheduleParty);
  let partyObserving = false;

  function syncPartyObserver() {
    const want = isFinalFantasy();
    if (want === partyObserving) return;
    if (want) partyMO.observe(document.documentElement, { childList: true, subtree: true });
    else partyMO.disconnect();
    partyObserving = want;
  }

  new MutationObserver(() => { syncPartyObserver(); syncShootingStars(); scheduleParty(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: [ATTR] });

  // Scrolling moves rows through the band the banner test looks at, but it
  // fires no DOM mutation — so without this the tags would only be re-evaluated
  // the next time something else happened to change.
  let scrollTick = 0;
  addEventListener("scroll", () => {
    if (!isFinalFantasy()) return;
    const now = performance.now();
    if (now - scrollTick < 200) return;
    scrollTick = now;
    scheduleParty();
  }, { passive: true, capture: true });

  // Resize fires neither a mutation nor a scroll, yet `cap` and every band
  // test are viewport-derived — without this a narrowed window kept the old,
  // wider cap and the banner ran back under the sprites. ResizeObserver on the
  // composer also catches sidebar collapse, which changes host width with no
  // viewport change at all.
  addEventListener("resize", () => { if (isFinalFantasy()) scheduleParty(); }, { passive: true });
  const hostRO = new ResizeObserver(() => { if (isFinalFantasy()) scheduleParty(); });
  let observedHost = null;
  function watchHost() {
    const h = composer();
    if (h === observedHost) return;
    if (observedHost) hostRO.unobserve(observedHost);
    if (h) hostRO.observe(h);
    observedHost = h;
  }

  syncPartyObserver();
  syncShootingStars();
  scheduleParty();
})();
