// Yume Forge — packaged-theme round-trip test.
//
//   node tools/pack-test.mjs
//
// The whole promise of export/import is that a theme arrives on someone else's
// machine looking the way it did on yours. That is easy to get wrong quietly:
// a sprite variable left behind renders as no icon, a font left behind renders
// as the system face, a selector left un-rewritten renders as nothing at all —
// and every one of those still produces a theme card that looks fine in the
// popup and a page that just isn't the theme.
//
// So this asserts on the actual rendering. It builds the SAME markup twice:
//
//   A — the bundled theme, exactly how the extension ships it (link tags to
//       the sprite sheets, _base.css and themes/final-fantasy.css)
//   B — the packaged theme, imported under a fresh custom- id, as a single
//       compiled <style> and nothing else
//
// then compares getComputedStyle on a set of probes across both. Any property
// that differs is a piece of the theme that did not survive the trip.

import { readFile, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findChrome } from "./chrome.mjs";

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = findChrome();
const rel = (p) => resolve(ROOT, p);

await import(new URL("../lib/theme-engine.js", import.meta.url));
await import(new URL("../lib/packer.js", import.meta.url));
const E = globalThis.YumeEngine;
const P = globalThis.YumePacker;

const readText = (p) => readFile(rel(p), "utf8");
const readBase64 = async (p) => (await readFile(rel(p))).toString("base64");

const THEME_ID = "final-fantasy";
const data = JSON.parse(await readText("themes/themes.json"));
const meta = (data.themes || data).find((t) => t.id === THEME_ID);

// Pack, then take it all the way through a share code — that is the path a
// real hand-off takes, and it is where rawCss would get dropped if the
// exportable() whitelist ever forgets it.
const packed = await P.packTheme(meta, readText, readBase64);
const imported = E.decodeShare(E.encodeShare(packed));
const feats = (imported.features || []).join(" ");

// Markup covering every mechanism the theme uses: sprite backgrounds on nav
// rows and recents, the party, the moogle glyph slot, the composer, reply
// windows, and plain type (for the fonts).
const BODY = `
<aside class="dframe-sidebar"><div class="dframe-sidebar-body">
  <div class="shrink-0 nav-block">
    <div class="group mt-1"><button data-row-main-button><span class="df-leading-slot"></span><span>New</span></button></div>
    <div class="contents">
      <button data-row-main-button><span class="df-leading-slot"></span><span>Chats and tasks</span></button>
      <button data-row-main-button><span class="df-leading-slot"></span><span>Projects</span></button>
      <button data-row-main-button><span class="df-leading-slot"></span><span>Artifacts</span></button>
      <button data-row-main-button><span class="df-leading-slot"></span><span>Scheduled</span></button>
      <button data-row-main-button><span class="df-leading-slot"></span><span>Customize</span></button>
    </div>
  </div>
  <div class="df-recents-anchor"><div class="group/section">
    <div data-row-key="chat:0"><div><div data-row><a data-row-main-button href="#"><span class="df-leading-slot"></span><span class="flex-1 min-w-0">A recent chat</span></a></div></div></div>
    <div data-row-key="chat:1"><div><div data-row><a data-row-main-button href="#"><span class="df-leading-slot"></span><span class="flex-1 min-w-0">Another chat</span></a></div></div></div>
  </div></div>
</div></aside>
<main class="dframe-content">
  <h2 class="font-title">Hello, night owl</h2>
  <div class="text-text-200 text-balance text-center font-display"><span class="select-none">Hey there, Chris</span></div>
  <div role="article"><div class="contents">
    <div data-is-streaming="false" data-yume-reply="1" class="group relative">
      <div class="font-claude-response"><p>A finished reply with some text in it.</p>
        <div><div><ul><li><p class="deep-probe">nested five levels down</p></li></ul></div></div>
      </div>
      <button class="group/status flex items-center gap-2"><div class="relative h-5 flex items-center"><div class="pt-1"><svg data-cds="Spark" viewBox="0 0 100 100" width="20" height="20"><path d="M50 0 60 40 100 50 60 60 50 100 40 60 0 50 40 40Z"/></svg></div></div><span class="truncate font-base">Weighing options</span></button>
    </div>
  </div></div>
  <div role="article"><div class="contents">
    <div data-is-streaming="false" data-yume-reply="1" class="group relative">
      <div class="font-claude-response">
        <h3>A heading</h3>
        <p>Plain text with <strong>bold</strong>, <em>italics</em>, <code>inline_code</code> and <a href="#">a link</a>.</p>
        <ul><li>a list item</li></ul>
        <pre><code>fenced_code_keeps_its_own_colours()</code></pre>
      </div>
    </div>
  </div></div>
  <div class="cowork-tray rounded-b-[20px] bg-surface-1 flex h-[60px] items-center px-3.5 text-footnote">
    <div><span>Project</span></div><div><span>Manual</span></div>
  </div>
  <div data-yume-party="dom" hidden></div>
  <div class="yume-party">
    <div class="yume-party-member" data-member="0" data-pose="idle"></div>
    <div class="yume-party-member" data-member="1" data-pose="fall" style="--pose: 5"></div>
    <!-- Frozen mid-way through the idle bob: the second keyframe must land
         EXACTLY on frame 1. It drifted to a quarter-frame off when the strips
         grew a 6th pose and the keyframe percentage was hardcoded — the
         "random pixels between the characters" bug. -->
    <div class="yume-party-member" data-member="2" data-pose="idle"
         style="animation: ff-member-idle 1s steps(1) -0.75s infinite paused"></div>
    <div class="yume-party-member" data-member="3" data-pose="idle"></div>
  </div>
  <span data-yume-icon="bolt"></span>
  <span data-yume-icon="star"></span>
  <span data-yume-icon="artifacts"></span>
  <span data-yume-icon="case"></span>
  <div class="yume-choco-a"><div class="yume-choco"></div></div>
  <div class="yume-choco-sky"><div class="yume-choco"></div></div>
  <!-- Code tab (epitaxy shell), structure transcribed from live claude.ai/code. -->
  <div class="epitaxy-root">
    <div class="epitaxy-top-scrim"></div>
    <span class="status-dot text-accent animate-pulse"><svg width="18" height="18"></svg></span>
    <!-- The transcript working spark: an 18px window over a masked sprite
         strip, inside a bounded scroller exactly like the real transcript.
         The strip is full height on purpose: the regression this guards is
         scroll-range inflation, which computed styles can't see. -->
    <div class="epitaxy-transcript-width spark-scroller" style="height:120px;overflow-y:auto"><div class="flex">
      <span class="strip-spark inline-block overflow-hidden shrink-0" style="width:18px;height:18px"><div style="width: 18px; height: 1512px; background: currentcolor; mask-image: url(&quot;data:image/webp;base64,UklGRg==&quot;);"></div></span>
    </div></div>
    <div class="epitaxy-user-turn">
      <div class="ut-bubble bg-[var(--ui-user-message-background)]">a user turn</div>
      <div class="ut-actions" style="height:24px"><button class="sr-only">Show message actions</button></div>
    </div>
    <div class="epitaxy-composer-width"><div class="pointer-events-none" style="position:relative;height:0">
      <button aria-hidden="true" tabindex="-1" type="button" class="mascot"></button></div>
      <div class="epitaxy-prompt">
        <div class="absolute inset-0" style="position:absolute;inset:0"></div>
        <div class="tiptap">prompt text</div>
        <button aria-label="Send" style="position:absolute;right:10px;top:10px;width:24px;height:24px"></button>
      </div>
      <!-- The compact prompt variant (repo/branch chips live in these): must
           NOT get the window frame — that was the stray banner bug. -->
      <div class="epitaxy-prompt compact-fixture bg-[var(--prompt-compact-bg)]">chips row</div>
    </div>
    <div class="epitaxy-bottom-scrim"></div>
  </div>
  <button aria-label="Send feedback" style="position:relative;width:32px;height:32px"></button>
  <div class="dframe-root" data-frame-mode="code"><div class="dframe-sidebar-body">
    <div class="shrink-0"><div class="contents">
      <button data-row-main-button><span class="df-leading-slot"></span><span>New</span></button>
      <button data-row-main-button><span class="df-leading-slot"></span><span>Artifacts</span></button>
      <button data-row-main-button><span class="df-leading-slot"></span><span>Customize</span></button>
      <button data-row-main-button><span class="df-leading-slot"></span><span>More</span></button>
    </div></div>
  </div></div>
  <div class="cursor-text composer"><div data-testid="chat-input">Reply to Claude…</div>
    <div role="radiogroup" data-cds="SegmentedControl" aria-label="Surface" data-size="sm" class="cds-seg">
      <div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-clip rounded"><div class="cds-thumb"></div></div>
      <span role="radio" data-checked aria-checked="true"><span class="text-footnote">Chat</span></span>
      <input type="radio" value="chat" checked aria-hidden="true" tabindex="-1">
      <span role="radio" data-unchecked aria-checked="false"><span class="text-footnote">Cowork</span></span>
      <input type="radio" value="cowork" aria-hidden="true" tabindex="-1">
    </div>
  </div>
</main>
<div data-radix-popper-content-wrapper>
  <div data-side="right" data-align="center" data-state="delayed-open" class="px-2 py-1 text-xs font-normal font-ui leading-tight rounded-md shadow-md text-always-white backdrop-blur break-words text-pretty font-claude-response max-w-none italic">Hi, I\u2019m Claude. How can I help you today?<span role="tooltip">Hi, I\u2019m Claude. How can I help you today?</span></div>
</div>
<div data-radix-popper-content-wrapper>
  <div data-side="top" data-align="center" class="px-2 py-1 text-xs font-normal font-ui leading-tight rounded-md shadow-md text-always-white backdrop-blur break-words text-pretty">Copy</div>
</div>`;

// Probes: [label, selector, pseudo|null, properties]
const PROBES = JSON.stringify([
  ["page bg",        "html",                                            null,      ["backgroundColor"]],
  ["body text",      "main.dframe-content",                             null,      ["color", "fontFamily"]],
  ["title type",     "h2.font-title",                                   null,      ["fontFamily", "fontSize", "color"]],
  ["reply body",     ".font-claude-response",                           null,      ["fontFamily", "color"]],
  ["reply colour",   ".font-claude-response p",                          null,      ["color"]],
  // em compounding regression: 0.92em on a `*` selector shrank each nesting
  // level by another 8% — ~11px five levels down while shallow text stayed
  // full size. rem must land the SAME size at any depth.
  ["reply deep",     ".font-claude-response .deep-probe",                null,      ["fontSize"]],
  // The crystal beside a reply. Width is derived from the asset's aspect, so
  // it doubles as a provenance check: the ripped crystal.png is 8x16 -> 16px
  // wide at height 32, while the hand-drawn fallback is 24x32 -> 24px. A
  // publish step once swapped the drawn one in and the user spotted it.
  ["reply crystal",  '[data-yume-reply]',                                "::before", ["backgroundImage", "width", "height", "animationName"]],
  ["reply window",   "[data-yume-reply]",                               null,      ["borderTopWidth", "borderTopColor", "borderRadius", "backgroundColor", "boxShadow"]],
  ["composer",       ".cursor-text",                                    null,      ["borderTopColor", "borderRadius", "animationName", "animationDuration", "boxShadow"]],
  ["composer party", ".cursor-text",                                    "::before", ["content", "backgroundImage", "width", "height", "animationName"]],
  ["nav New icon",   ".nav-block .group.mt-1 [data-row-main-button] .df-leading-slot", "::after", ["backgroundImage", "width", "height"]],
  ["nav Chats icon", ".contents > [data-row-main-button]:nth-of-type(1) .df-leading-slot", "::after", ["backgroundImage"]],
  ["nav Projects",   ".contents > [data-row-main-button]:nth-of-type(2) .df-leading-slot", "::after", ["backgroundImage"]],
  ["nav Customize",  ".contents > [data-row-main-button]:nth-of-type(5) .df-leading-slot", "::after", ["backgroundImage"]],
  ["recents icon 0", '[data-row-key="chat:0"] .df-leading-slot',        "::after", ["backgroundImage", "width", "height"]],
  ["recents icon 1", '[data-row-key="chat:1"] .df-leading-slot',        "::after", ["backgroundImage"]],
  ["sidebar frame",  ".dframe-sidebar-body",                            null,      ["borderTopWidth", "borderTopColor", "backgroundColor"]],
  ["scenery",        "main.dframe-content",                             "::before", ["content", "backgroundImage"]],
  ["starfield",      "main.dframe-content",                             "::after",  ["content", "backgroundImage", "animationName"]],
  ["status glyph",   "button[class*='group/status'] > *:first-child",   "::after", ["content", "backgroundImage"]],
  ["status svg",     "button[class*='group/status'] svg",               null,      ["opacity"]],
  // Chat/Cowork — only on a brand-new chat, which is why it went unstyled for
  // so long. Driven through the component's own --cds-* variables.
  ["mode switch",    '[data-cds="SegmentedControl"]',                    null,      ["backgroundColor", "borderTopLeftRadius", "boxShadow"]],
  ["mode active",    '[data-cds="SegmentedControl"] [role="radio"][data-checked] span', null, ["color", "fontFamily"]],
  ["mode inactive",  '[data-cds="SegmentedControl"] [role="radio"][data-unchecked] span', null, ["color", "fontFamily"]],
  ["mode thumb",     '[data-cds="SegmentedControl"] .cds-thumb',         null,      ["backgroundImage", "boxShadow", "borderTopLeftRadius"]],
  // Mog's greeting: original collapsed, replacement drawn in ::after.
  ["mog tip",        '[data-radix-popper-content-wrapper] div.font-claude-response.italic', null, ["fontSize"]],
  ["mog tip text",   '[data-radix-popper-content-wrapper] div.font-claude-response.italic', "::after", ["content", "fontFamily"]],
  // Control: an ordinary tooltip must be left completely alone.
  ["plain tip",      '[data-radix-popper-content-wrapper] div[data-side="top"]', null, ["fontSize"]],
  ["plain tip text", '[data-radix-popper-content-wrapper] div[data-side="top"]', "::after", ["content"]],
  // The new-chat greeting. Lived under .font-title until claude.ai renamed the
  // class to .font-display, at which point it silently went back to serif.
  ["greeting",       ".font-display",                                    null,      ["fontFamily", "textShadow", "letterSpacing"]],
  ["greeting span",  ".font-display span",                               null,      ["fontFamily"]],
  // Cowork footer tray.
  ["cowork tray",    '[class*="rounded-b-["][class*="bg-surface-1"]',     null,      ["backgroundImage", "boxShadow", "borderBottomLeftRadius"]],
  ["tray font",      '[class*="rounded-b-["][class*="bg-surface-1"] span', null,     ["fontFamily"]],
  // Optional colourful text, exercised with the option switched ON.
  ["rich bold",      ".font-claude-response strong",                      null,      ["color"]],
  ["rich italic",    ".font-claude-response em",                          null,      ["color"]],
  ["rich heading",   ".font-claude-response h3",                          null,      ["color"]],
  ["rich code",      ".font-claude-response code:not(pre code)",          null,      ["color"]],
  ["rich link",      ".font-claude-response a",                           null,      ["color"]],
  ["fenced code",    ".font-claude-response pre code",                    null,      ["color"]],
  // Horizon silhouette: first background layer on the content surface,
  // natural-size, pinned right-bottom. The image itself is a 16KB data URI
  // (hashed by the reporter), so the size/position pair is the assertion.
  ["horizon",        "main.dframe-content",                              null,      ["backgroundSize", "backgroundPosition", "backgroundAttachment"]],
  // Party fall pose (frame 5 of the 6-frame strips) and the chocobo sprite.
  ["fall pose",      '.yume-party-member[data-pose="fall"]',              null,      ["backgroundPositionX", "backgroundSize"]],
  ["idle pose",      '.yume-party-member[data-member="3"]',               null,      ["backgroundPositionX"]],
  // The greeting is present in this fixture, so members 0/1 must kneel:
  // pose 4 of 6 -> 4/(6-1) = 80% exactly.
  ["kneel pose",     '.yume-party-member[data-member="0"][data-pose="idle"]', null,   ["backgroundPositionX", "animationName"]],
  ["glyph bolt",     '[data-yume-icon="bolt"]',                           "::after", ["backgroundImage", "width"]],
  ["glyph bolt text", '[data-yume-icon="bolt"]',                          null,      ["color"]],
  ["glyph artifacts", '[data-yume-icon="artifacts"]',                     "::after", ["backgroundImage"]],
  ["glyph case",     '[data-yume-icon="case"]',                           "::after", ["backgroundImage"]],
  ["idle mid-bob",   '.yume-party-member[data-member="2"]',               null,      ["backgroundPositionX"]],
  // Code tab surfaces.
  ["code prompt",    ".epitaxy-prompt",                                  null,      ["backgroundImage", "borderTopWidth", "borderTopColor", "animationName", "zIndex"]],
  ["code prompt txt", ".epitaxy-prompt .tiptap",                          null,      ["fontFamily"]],
  ["code mascot",    ".epitaxy-composer-width button.mascot",            null,      ["display"]],
  ["code mog dot",   ".epitaxy-root span.animate-pulse",                 "::after", ["content", "backgroundImage", "animationName"]],
  ["code user turn", ".epitaxy-user-turn > .ut-bubble",                  null,      ["backgroundImage", "borderTopColor"]],
  // The container and the actions strip must stay UNFRAMED — boxing them is
  // the "empty second row" bug.
  ["code turn shell", ".epitaxy-user-turn",                               null,      ["backgroundImage", "borderTopWidth"]],
  ["code scrim top", ".epitaxy-top-scrim",                               null,      ["display"]],
  ["code scrim bot", ".epitaxy-bottom-scrim",                            null,      ["display"]],
  ["code inner fill", ".epitaxy-prompt > div.absolute.inset-0",           null,      ["backgroundImage", "backgroundColor", "boxShadow"]],
  ["code strip spark", ".epitaxy-root span.strip-spark",                  "::after", ["content", "backgroundImage", "animationName"]],
  ["code strip hidden", ".epitaxy-root span.strip-spark > div",           null,      ["display"]],
  ["code spark scroll", ".spark-scroller",                                null,      ["@scrollHeight", "@clientHeight"]],
  ["code send hand",  '.epitaxy-prompt button[aria-label="Send"]',        "::after", ["left", "right", "width"]],
  ["code compact",   ".epitaxy-prompt.compact-fixture",                  null,      ["borderTopWidth", "animationName", "backgroundImage"]],
  ["feedback crystal", 'button[aria-label="Send feedback"]',              "::after", ["backgroundImage", "transform", "width"]],
  ["code nav more",  '[data-frame-mode="code"] .contents > button:nth-of-type(4) .df-leading-slot', "::after", ["backgroundImage"]],
  ["code nav artifacts", '[data-frame-mode="code"] .contents > button:nth-of-type(2) .df-leading-slot', "::after", ["backgroundImage"]],
  ["chocobo",        ".yume-choco-a .yume-choco",                        null,      ["animationName", "backgroundSize", "transform"]],
  ["chocobo stage",  ".yume-choco-a",                                    null,      ["width", "height", "zIndex", "pointerEvents"]],
  ["chocobo sky",    ".yume-choco-sky",                                  null,      ["position", "zIndex", "pointerEvents"]],
  ["chocobo sky spr", ".yume-choco-sky .yume-choco",                     null,      ["animationName"]],
]);

const REPORT = `
  const probes = ${PROBES};
  const out = [];
  for (const [label, sel, pseudo, props] of probes) {
    const el = document.querySelector(sel);
    if (!el) { out.push([label, "MISSING ELEMENT"]); continue; }
    const cs = getComputedStyle(el, pseudo);
    const vals = {};
    for (const p of props) vals[p] = p.startsWith("@") ? String(el[p.slice(1)]) : cs[p];
    out.push([label, vals]);
  }
  // Data URIs are enormous and identical on both sides or not at all; hash them
  // so a mismatch report stays readable.
  const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return "img#" + (h >>> 0).toString(36); };
  for (const [, v] of out) {
    if (typeof v === "string") continue;
    for (const k of Object.keys(v)) {
      if (typeof v[k] === "string" && v[k].length > 90) v[k] = hash(v[k]);
    }
  }
  document.title = "PROBE:" + JSON.stringify(out);
`;

const page = (attrs, head) => `<!doctype html>
<html lang="en" ${attrs}>
<head><meta charset="utf-8">
<style>
  /* Layout only — identical on both sides, so it can never mask a difference. */
  html, body { margin: 0; min-height: 600px; }
  .dframe-sidebar { width: 240px; float: left; }
  main.dframe-content { min-height: 600px; padding: 20px; }
  .cursor-text { min-height: 60px; border: 1px solid transparent; }
  .df-leading-slot { display: inline-block; width: 20px; height: 20px; }
  .cds-seg { position: relative; display: inline-flex; width: fit-content;
             background-color: var(--cds-segmented-control-track, #111); }
  .cds-seg .cds-thumb { position: absolute; left: 0; top: 1px; bottom: 1px; width: 50px;
             background-color: var(--cds-segmented-control-thumb, rgba(255,255,255,.2)); }
</style>
${head}
</head>
<body>${BODY}
<script>window.addEventListener("load", () => { ${REPORT} });</script>
</body></html>`;

const linkHead = [
  "fonts/fonts.css", ...P.SPRITE_SHEETS, "themes/_base.css", `themes/${THEME_ID}.css`,
].map((p) => `<link rel="stylesheet" href="../${p}">`).join("\n");

const compiled = E.compileCss(imported);
const importedHead =
  `<link rel="stylesheet" href="../themes/_base.css">\n<style>\n${compiled}\n</style>`;

const A = rel("tools/.pack-a.html");
const B = rel("tools/.pack-b.html");
const OPT = 'data-yume-opt="rich-text menu-sounds bottom-scenery"';
await writeFile(A, page(`data-cct-theme="${THEME_ID}" data-yume-feat="party stars banner composer-glow replies" ${OPT}`, linkHead), "utf8");
await writeFile(B, page(`data-cct-theme="${imported.id}" data-yume-feat="${feats}" ${OPT}`, importedHead), "utf8");

async function probe(file) {
  const { stdout } = await run(CHROME, [
    "--headless", "--disable-gpu", "--allow-file-access-from-files",
    "--virtual-time-budget=5000", "--dump-dom", "file://" + file,
  ], { maxBuffer: 200 * 1024 * 1024 });
  const m = /<title>PROBE:([\s\S]*?)<\/title>/.exec(stdout);
  if (!m) throw new Error("page never reported: " + file);
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
}

const [a, b] = await Promise.all([probe(A), probe(B)]);
await Promise.all([rm(A, { force: true }), rm(B, { force: true })]);

let bad = 0, checks = 0;
for (let i = 0; i < a.length; i++) {
  const [label, av] = a[i];
  const bv = b[i][1];
  if (typeof av === "string" || typeof bv === "string") {
    bad++;
    console.log(`FAIL ${label.padEnd(16)} ${av} / ${bv}`);
    continue;
  }
  const diffs = Object.keys(av).filter((k) => av[k] !== bv[k]);
  checks += Object.keys(av).length;
  if (diffs.length) {
    bad++;
    console.log(`FAIL ${label.padEnd(16)} ` +
      diffs.map((k) => `${k}: bundled=${av[k]}  imported=${bv[k]}`).join("\n                      "));
  } else {
    console.log(`ok   ${label.padEnd(16)} ${Object.keys(av).length} propert${Object.keys(av).length === 1 ? "y" : "ies"} match`);
  }
}

// A theme that renders nothing would also "match" if every probe came back
// empty, so assert the bundled side is actually doing something first.
const drew = a.filter(([, v]) => typeof v === "object" &&
  Object.values(v).some((x) => /img#|url\(/.test(String(x)))).length;
if (drew < 6) {
  bad++;
  console.log(`FAIL sanity          only ${drew} probes drew an image — the bundled theme isn't rendering, so a match proves nothing`);
} else {
  console.log(`ok   sanity          ${drew} probes draw sprite images on the bundled side`);
}

// Named probes whose bundled value must differ from the browser default —
// otherwise "identical" just means "identically unstyled".
const MUST_BE_STYLED = {
  "mode switch":   ["backgroundColor", /rgba\(8, 14, 52/],
  "mode active":   ["color", /rgb\(255, 215, 94\)/],
  "mode inactive": ["fontFamily", /Silkscreen/],
  "mode thumb":    ["backgroundImage", /linear-gradient/],
  "mog tip":       ["fontSize", /^0px$/],
  "mog tip text":  ["content", /Mog/],
  "greeting":      ["fontFamily", /Press Start/],
  "greeting span": ["fontFamily", /Press Start/],
  // Message text must use the face that HAS lowercase. Silkscreen renders
  // lowercase as capitals, which read as shouting prose.
  "reply body":    ["fontFamily", /Press Start/],
  // Explicit, not inherited from claude.ai tokens — a different app build
  // left this near-black on the dark window.
  "reply colour":  ["color", /rgb\(255, 255, 255\)/],
  // 12px exactly, at any depth: 0.75rem is grid-aligned for the 8px pixel
  // face (3 device px per glyph pixel on 2x displays) and immune to em
  // compounding. Any other value here means the unit or the number drifted.
  "reply deep":    ["fontSize", /^12px$/],
  "reply crystal": ["width", /^16px$/],
  "horizon":       ["backgroundSize", /1878px 409px/],
  "cowork tray":   ["backgroundImage", /linear-gradient/],
  "tray font":     ["fontFamily", /Silkscreen/],
  "rich bold":     ["color", /rgb\(255, 215, 94\)/],
  "rich italic":   ["color", /rgb\(139, 234, 255\)/],
  "rich heading":  ["color", /rgb\(255, 138, 216\)/],
  // --pose: 5 over a 6-frame strip = 5/(6-1) = 100% exactly. If the strip
  // count and this maths ever disagree, the fallen member shows the wrong
  // frame and this value drifts off 100%.
  "fall pose":     ["backgroundPositionX", /^100%$/],
  "idle pose":     ["backgroundPositionX", /^0%$/],
  "kneel pose":    ["backgroundPositionX", /^80%$/],
  // The reporter hashes long data URIs before this check runs — img#… IS the
  // sprite; "none" is the failure.
  "glyph bolt":    ["backgroundImage", /^img#/],
  "glyph artifacts": ["backgroundImage", /^img#/],
  "glyph case":    ["backgroundImage", /^img#/],
  "glyph bolt text": ["color", /rgba\(0, 0, 0, 0\)/],
  // 1/(6-1) — frame 1 of a six-frame strip. A literal 25% here means the
  // keyframe went stale against the pose count again.
  "idle mid-bob":  ["backgroundPositionX", /^20%$/],
  "chocobo":       ["animationName", /ff-choco-gait/],
  "chocobo sky":   ["position", /^fixed$/],
  "chocobo sky spr": ["animationName", /ff-choco-gait/],
  "code prompt":   ["animationName", /ff-breathe/],
  // The code composer is prose you type, so it rides --ff-body (Press Start
  // 2P) like the Home composer — Silkscreen would shout it back at you.
  "code prompt txt": ["fontFamily", /Press Start/],
  "code mascot":   ["display", /^none$/],
  "code mog dot":  ["animationName", /ff-moogle-frames/],
  "code user turn": ["backgroundImage", /linear-gradient/],
  "code turn shell": ["borderTopWidth", /^0px$/],
  "code scrim top": ["display", /^none$/],
  "code scrim bot": ["display", /^none$/],
  "code strip spark": ["animationName", /ff-moogle-frames/],
  "code strip hidden": ["display", /^none$/],
  // The whole bug: a hidden-but-laid-out 1512px strip inflating the
  // transcript's scroll range. 120 = the scroller's own height, nothing more.
  "code spark scroll": ["@scrollHeight", /^12[0-5]$/],
  // right-anchored, not centered: centered put the 40px hand's right half
  // past the window border on the code tab's tight 24px send button.
  "code send hand": ["right", /^0px$/],
  // Unframed and unanimated — the compact variant must never look like the
  // composer window.
  "code compact":  ["borderTopWidth", /^0px$/],
  // The crystal, not the hand: transform none (the hand mirrors), and width
  // from the crystal's own half-scale, not the cursor sprite's.
  "feedback crystal": ["transform", /^none$/],
};

// Code-mode remap: More (#4) must NOT wear Scheduled's clock — the code rows
// share Home's markup positions, which is exactly how the clock got there.
{
  const codeMore = a.find(([l]) => l === "code nav more");
  const homeSched = a.find(([l]) => l === "nav Customize");   // any home slot works as a differ-check anchor
  const clock = a.find(([l]) => l === "nav Projects");
  const cm = codeMore && typeof codeMore[1] === "object" ? codeMore[1].backgroundImage : "?";
  const cl = clock && typeof clock[1] === "object" ? clock[1].backgroundImage : "?";
  if (cm !== "none" && cm !== cl) {
    console.log(`ok   ${"code nav remap".padEnd(16)} More has its own icon (${String(cm).slice(0, 14)}…)`);
  } else {
    bad++;
    console.log(`FAIL ${"code nav remap".padEnd(16)} code More icon is ${cm === "none" ? "missing" : "a Home icon"} — the positional mapping is leaking again`);
  }
}

// The tray override must NOT strip the icon font: those glyphs are Private Use
// Area codepoints from Anthropicons, and dropping it renders them as tofu.
{
  const tray = a.find(([l]) => l === "tray font");
  const fam = tray && typeof tray[1] === "object" ? tray[1].fontFamily : "";
  if (/Anthropicons/.test(String(fam))) {
    console.log(`ok   ${"tray icon font".padEnd(16)} Anthropicons kept as a fallback, so PUA icons still resolve`);
  } else {
    bad++;
    console.log(`FAIL ${"tray icon font".padEnd(16)} font stack is "${fam}" with no Anthropicons — ` +
                "the Project/Manual icons will render as tofu");
  }
}

// Fenced code must keep its own syntax highlighting rather than being flattened.
{
  const fenced = a.find(([l]) => l === "fenced code");
  const inline = a.find(([l]) => l === "rich code");
  const fc = fenced && typeof fenced[1] === "object" ? fenced[1].color : "?";
  const ic = inline && typeof inline[1] === "object" ? inline[1].color : "?";
  if (fc !== ic) {
    console.log(`ok   ${"fenced code".padEnd(16)} left alone (${fc}) while inline code is recoloured (${ic})`);
  } else {
    bad++;
    console.log(`FAIL ${"fenced code".padEnd(16)} fenced and inline code are both ${fc} — ` +
                "the rule leaked into code blocks and flattened their highlighting");
  }
}

// And the negative: the ordinary tooltip must keep its own text and size.
{
  const plain = a.find(([l]) => l === "plain tip");
  const plainAfter = a.find(([l]) => l === "plain tip text");
  const size = plain && typeof plain[1] === "object" ? plain[1].fontSize : "?";
  const after = plainAfter && typeof plainAfter[1] === "object" ? plainAfter[1].content : "?";
  if (size !== "0px" && !/Mog/.test(String(after))) {
    console.log(`ok   ${"plain tooltip".padEnd(16)} untouched (fontSize ${size}, no injected content)`);
  } else {
    bad++;
    console.log(`FAIL ${"plain tooltip".padEnd(16)} an ordinary tooltip was hit by the Mog rule ` +
                `(fontSize ${size}, content ${after}) — the selector is too broad`);
  }
}
for (const [label, [prop, want]] of Object.entries(MUST_BE_STYLED)) {
  const row = a.find(([l]) => l === label);
  const got = row && typeof row[1] === "object" ? row[1][prop] : undefined;
  if (want.test(String(got))) {
    console.log(`ok   ${label.padEnd(16)} is genuinely themed (${prop}: ${got})`);
  } else {
    bad++;
    console.log(`FAIL ${label.padEnd(16)} ${prop} is "${got}" — the theme rule is not applying, ` +
                "so the parity match above proves nothing");
  }
}

/* ------------------------------------------------------------------ gpt */

// The ChatGPT theme, same treatment: bundled vs packaged-and-reimported over
// a chatgpt.com-shaped fixture, then MUST checks so "identical" can't mean
// "identically unstyled". The fixture reproduces the site's tailwind cascade
// layers INCLUDING a trailing-! utility (background-color !important inside
// @layer utilities) — layered importants beat unlayered ones, which is the
// exact war the writing-block override has to win via @layer theme.
const GPT_ID = "final-fantasy-gpt";
const gmeta = (data.themes || data).find((t) => t.id === GPT_ID);
const gpacked = await P.packTheme(gmeta, readText, readBase64);
const gimported = E.decodeShare(E.encodeShare(gpacked));
const gfeats = (gimported.features || []).join(" ");

const GPT_BODY = `
<div id="stage-slideover-sidebar">
  <div class="sticky" style="height:40px">sticky head</div>
  <a class="__menu-item" data-testid="create-new-chat-button" href="#"><div aria-hidden="true" class="icon"><svg width="20" height="20"></svg></div><div>New chat</div></a>
  <a class="__menu-item" data-testid="sidebar-item-library" href="#"><div aria-hidden="true" class="icon"><svg width="20" height="20"></svg></div><div>Library</div></a>
  <nav aria-label="Chat history">
    <a class="__menu-item" href="/c/aaa">First chat</a>
    <a class="__menu-item" href="/c/bbb">Second chat</a>
  </nav>
</div>
<main>
  <div data-splash-headline-option="ON_YOUR_MIND"><h1>Where should we begin?</h1></div>
  <section data-testid="conversation-turn-1" data-turn="user">
    <div data-message-author-role="user"><div class="user-message-bubble-color" style="border-radius:22px">a question</div></div>
  </section>
  <section data-testid="conversation-turn-2" data-turn="assistant" data-yume-reply="1" data-yume-latest>
    <div data-message-author-role="assistant"><div class="markdown prose">
      <p>A finished reply with <strong>bold</strong>, <em>italics</em>, <code>inline_code</code> and <a href="#">a link</a>.</p>
      <div><div><ul><li><p class="deep-probe">nested five levels down</p></li></ul></div></div>
      <h3>A heading</h3>
      <pre><code>fenced_code_keeps_its_own_colours()</code></pre>
      <div class="group/writing-block-surface" style="border-radius:24px">
        <div class="wb-fill dark:bg-[#2a2a2a]!" style="height:20px"></div>
        <p>document text</p>
      </div>
    </div></div>
  </section>
  <section data-testid="conversation-turn-3" data-turn="assistant" data-yume-working>
    <div><div><div data-message-author-role="assistant"><div class="markdown prose result-thinking"><p></p></div></div></div></div>
  </section>
  <form data-type="unified-composer" style="width:640px">
    <div class="relative">
      <div data-composer-surface="true" style="border-radius:28px;height:52px">
        <button class="composer-btn" data-testid="composer-plus-btn">+</button>
        <div id="prompt-textarea" contenteditable="true"><p data-placeholder="Ask anything" class="placeholder"></p></div>
        <button aria-label="Send prompt" data-testid="send-button-fixture" style="width:36px;height:36px"><svg></svg></button>
        <button aria-label="Stop answering" data-testid="stop-button" style="width:36px;height:36px"><svg></svg></button>
      </div>
    </div>
    <div class="yume-party">
      <div class="yume-party-member" data-member="0" data-pose="idle"></div>
      <div class="yume-party-member" data-member="1" data-pose="fall" style="--pose: 5"></div>
      <div class="yume-party-member" data-member="2" data-pose="idle"
           style="animation: ff-member-idle 1s steps(1) -0.75s infinite paused"></div>
      <div class="yume-party-member" data-member="3" data-pose="idle"></div>
    </div>
  </form>
  <div class="yume-choco-sky"><div class="yume-choco"></div></div>
</main>
<div data-radix-menu-content role="menu"><div role="menuitem">Add photos</div></div>
<div popover="manual" role="tooltip" class="popover">a tooltip</div>`;

const GPT_PROBES = JSON.stringify([
  ["gpt sky",          "body",                                   null,       ["backgroundImage", "backgroundAttachment"]],
  ["gpt moon",         "html",                                   "::before", ["content", "backgroundImage"]],
  ["gpt motes",        "html",                                   "::after",  ["content", "backgroundImage", "animationName"]],
  ["gpt stars",        "body",                                   "::after",  ["content", "animationName"]],
  ["gpt greeting",     "main h1",                                null,       ["fontFamily", "textShadow"]],
  ["gpt user bubble",  ".user-message-bubble-color",             null,       ["backgroundImage", "borderTopWidth", "borderTopColor", "borderRadius"]],
  ["gpt reply window", 'section[data-yume-reply] div[data-message-author-role="assistant"]', null, ["backgroundImage", "borderTopWidth", "borderRadius", "animationName"]],
  ["gpt crystal",      'section[data-yume-reply] div[data-message-author-role="assistant"]', "::before", ["content", "backgroundImage", "width", "height", "animationName"]],
  ["gpt reply body",   ".markdown p",                            null,       ["fontFamily", "color"]],
  ["gpt reply deep",   ".markdown .deep-probe",                  null,       ["fontSize"]],
  ["gpt rich bold",    ".markdown strong",                       null,       ["color"]],
  ["gpt rich italic",  ".markdown em",                           null,       ["color"]],
  ["gpt rich heading", ".markdown h3",                           null,       ["color"]],
  ["gpt rich code",    ".markdown code:not(pre code)",           null,       ["color"]],
  ["gpt fenced code",  ".markdown pre code",                     null,       ["color"]],
  ["gpt wb fill",      ".wb-fill",                               null,       ["backgroundColor"]],
  ["gpt wb frame",     '[class*="writing-block-surface"]',       null,       ["borderTopWidth", "borderRadius"]],
  ["gpt thinking",     ".result-thinking",                       null,       ["color", "position"]],
  ["gpt thinking mog", 'section[data-yume-working] > div:first-of-type > div:first-child', "::after", ["content", "backgroundImage", "animationName"]],
  ["gpt parked mog",   'section[data-yume-latest] > div:first-of-type > div:first-child', "::after", ["content"]],
  ["gpt composer",     "[data-composer-surface]",                null,       ["backgroundImage", "borderTopWidth", "borderRadius", "animationName", "zIndex"]],
  ["gpt composer btn", ".composer-btn",                          null,       ["borderTopWidth", "borderRadius", "fontFamily"]],
  ["gpt send hand",    'button[aria-label="Send prompt"]',       "::after",  ["content", "backgroundImage", "transform", "width"]],
  ["gpt send glyph",   'button[aria-label="Send prompt"] > svg', null,       ["opacity"]],
  ["gpt stop",         '[data-testid="stop-button"]',            null,       ["borderTopColor", "color"]],
  ["gpt party row",    "form > .yume-party",                     null,       ["position", "zIndex"]],
  ["gpt kneel pose",   '.yume-party-member[data-member="0"][data-pose="idle"]', null, ["backgroundPositionX", "animationName"]],
  ["gpt fall pose",    '.yume-party-member[data-pose="fall"]',   null,       ["backgroundPositionX"]],
  ["gpt mid-bob",      '.yume-party-member[data-member="2"]',    null,       ["backgroundPositionX"]],
  ["gpt idle anim",    '.yume-party-member[data-member="3"]',    null,       ["animationName"]],
  ["gpt sidebar",      "#stage-slideover-sidebar",               null,       ["backgroundImage", "borderRightWidth", "borderRightColor"]],
  ["gpt new icon",     '[data-testid="create-new-chat-button"] .icon', "::after", ["content", "backgroundImage", "width"]],
  ["gpt new svg",      '[data-testid="create-new-chat-button"] .icon svg', null, ["opacity"]],
  ["gpt library icon", '[data-testid="sidebar-item-library"] .icon', "::after", ["backgroundImage"]],
  ["gpt history rest", 'a[href="/c/aaa"]',                       "::before", ["opacity", "backgroundImage"]],
  ["gpt row hand",     ".__menu-item",                           "::before", ["content", "backgroundImage", "opacity"]],
  ["gpt menu",         "[data-radix-menu-content]",              null,       ["backgroundImage", "borderTopWidth", "borderRadius"]],
  ["gpt tooltip",      '[role="tooltip"]',                       null,       ["backgroundImage", "borderTopWidth", "fontFamily"]],
  ["gpt choco sky",    ".yume-choco-sky",                        null,       ["position", "zIndex"]],
  ["gpt choco spr",    ".yume-choco-sky .yume-choco",            null,       ["animationName", "backgroundSize"]],
]);

const GPT_REPORT = REPORT.replace("const probes = " + PROBES, "const probes = " + GPT_PROBES);
if (GPT_REPORT === REPORT) throw new Error("GPT_REPORT substitution found nothing — the probe anchor moved");

const gpage = (attrs, head) => `<!doctype html>
<html lang="en" ${attrs}>
<head><meta charset="utf-8">
<style>
  /* The site's cascade-layer order, with a trailing-! utility in the last
     layer — the strongest thing chatgpt.com ever throws at an override. */
  @layer theme, base, components, utilities;
  @layer utilities {
    .dark\\:bg-\\[\\#2a2a2a\\]\\! { background-color: #2a2a2a !important; }
  }
  html, body { margin: 0; min-height: 600px; }
  #stage-slideover-sidebar { width: 240px; float: left; min-height: 600px; }
  .__menu-item { display: block; padding: 6px 10px; }
  .icon { display: inline-block; width: 20px; height: 20px; }
  main { min-height: 600px; padding: 20px; margin-left: 250px; }
  [data-composer-surface] { position: relative; }
</style>
${head}
</head>
<body>${GPT_BODY}
<script>window.addEventListener("load", () => { ${GPT_REPORT} });</script>
</body></html>`;

const glinkHead = [
  "fonts/fonts.css", ...P.SPRITE_SHEETS, `themes/${GPT_ID}.css`,
].map((p) => `<link rel="stylesheet" href="../${p}">`).join("\n");
const gcompiled = E.compileCss(gimported);
const gimportedHead = `<style>\n${gcompiled}\n</style>`;

const GA = rel("tools/.pack-ga.html");
const GB = rel("tools/.pack-gb.html");
const GOPT = 'data-yume-opt="rich-text menu-sounds bottom-scenery"';
await writeFile(GA, gpage(`data-cct-theme="${GPT_ID}" data-yume-feat="party stars composer-glow replies" ${GOPT}`, glinkHead), "utf8");
await writeFile(GB, gpage(`data-cct-theme="${gimported.id}" data-yume-feat="${gfeats}" ${GOPT}`, gimportedHead), "utf8");

const [ga, gb] = await Promise.all([probe(GA), probe(GB)]);
await Promise.all([rm(GA, { force: true }), rm(GB, { force: true })]);

console.log("");
for (let i = 0; i < ga.length; i++) {
  const [label, av] = ga[i];
  const bv = gb[i][1];
  if (typeof av === "string" || typeof bv === "string") {
    bad++;
    console.log(`FAIL ${label.padEnd(16)} ${av} / ${bv}`);
    continue;
  }
  const diffs = Object.keys(av).filter((k) => av[k] !== bv[k]);
  checks += Object.keys(av).length;
  if (diffs.length) {
    bad++;
    console.log(`FAIL ${label.padEnd(16)} ` +
      diffs.map((k) => `${k}: bundled=${av[k]}  imported=${bv[k]}`).join("\n                      "));
  } else {
    console.log(`ok   ${label.padEnd(16)} ${Object.keys(av).length} propert${Object.keys(av).length === 1 ? "y" : "ies"} match`);
  }
}

const GPT_MUST = {
  // Hashed: the value is the horizon data URI plus the gradient, far over the
  // reporter's 90-char cap. img# IS the layered background; "none" is bare.
  "gpt sky":          ["backgroundImage", /^img#/],
  "gpt moon":         ["backgroundImage", /img#|url\(/],
  "gpt greeting":     ["fontFamily", /Press Start/],
  "gpt user bubble":  ["backgroundImage", /linear-gradient/],
  // 7px against an inline 22px superellipse — the JRPG corner must win.
  "gpt user radius":  null,
  "gpt reply window": ["borderTopWidth", /^2px$/],
  "gpt crystal":      ["width", /^16px$/],
  "gpt reply body":   ["fontFamily", /Press Start/],
  "gpt reply colour": null,
  "gpt reply deep":   ["fontSize", /^12px$/],
  // The layer war: #2a2a2a !important inside @layer utilities must lose to
  // the theme's @layer theme override. rgb(16,26,84) = #101a54.
  "gpt wb fill":      ["backgroundColor", /rgb\(16, 26, 84\)/],
  "gpt thinking mog": ["animationName", /ff-moogle-frames/],
  // Both a latest and a working turn are mounted in this fixture; the parked
  // Mog must stand down so he never doubles mid-run.
  "gpt parked mog":   ["content", /^none$/],
  "gpt composer":     ["animationName", /ff-breathe/],
  // 9px against an inline border-radius:28px.
  "gpt composer rad": null,
  "gpt send hand":    ["backgroundImage", /img#|url\(/],
  "gpt send glyph":   ["opacity", /^0$/],
  "gpt stop":         ["borderTopColor", /rgb\(255, 215, 94\)/],
  "gpt kneel pose":   ["backgroundPositionX", /^80%$/],
  "gpt fall pose":    ["backgroundPositionX", /^100%$/],
  "gpt mid-bob":      ["backgroundPositionX", /^20%$/],
  // The stop button is in the fixture, so idle members must be bobbing.
  "gpt idle anim":    ["animationName", /ff-member-idle/],
  "gpt sidebar":      ["borderRightWidth", /^2px$/],
  "gpt new icon":     ["backgroundImage", /^img#|^url\(/],
  "gpt new svg":      ["opacity", /^0$/],
  // The hand owns the chat-row ::before: cursor sprite, hidden at rest.
  "gpt history rest": ["opacity", /^0$/],
  "gpt menu":         ["backgroundImage", /linear-gradient/],
  "gpt tooltip":      ["fontFamily", /Silkscreen/],
  "gpt choco sky":    ["position", /^fixed$/],
  "gpt choco spr":    ["animationName", /ff-choco-gait/],
};

for (const [label, spec] of Object.entries(GPT_MUST)) {
  if (!spec) continue;   // named for the reader; asserted via the pair below
  const [prop, want] = spec;
  const row = ga.find(([l]) => l === label);
  const got = row && typeof row[1] === "object" ? row[1][prop] : undefined;
  if (want.test(String(got))) {
    console.log(`ok   ${label.padEnd(16)} is genuinely themed (${prop}: ${got})`);
  } else {
    bad++;
    console.log(`FAIL ${label.padEnd(16)} ${prop} is "${got}" — the gpt theme rule is not applying`);
  }
}

// Inline-style wars, asserted directly: the composer ships border-radius:28px
// and the bubble 22px inline; the windows must land on 9px/7px.
{
  const comp = ga.find(([l]) => l === "gpt composer");
  const r = comp && typeof comp[1] === "object" ? comp[1].borderRadius : "?";
  if (r === "9px") console.log(`ok   ${"gpt composer rad".padEnd(16)} 9px beats the inline 28px superellipse`);
  else { bad++; console.log(`FAIL ${"gpt composer rad".padEnd(16)} composer radius is "${r}" — the inline 28px is winning`); }
  const bub = ga.find(([l]) => l === "gpt user bubble");
  const br = bub && typeof bub[1] === "object" ? bub[1].borderRadius : "?";
  if (br === "7px") console.log(`ok   ${"gpt user radius".padEnd(16)} 7px beats the inline 22px`);
  else { bad++; console.log(`FAIL ${"gpt user radius".padEnd(16)} bubble radius is "${br}"`); }
  const body = ga.find(([l]) => l === "gpt reply body");
  const col = body && typeof body[1] === "object" ? body[1].color : "?";
  if (col === "rgb(255, 255, 255)") console.log(`ok   ${"gpt reply colour".padEnd(16)} stated explicitly (white), not inherited`);
  else { bad++; console.log(`FAIL ${"gpt reply colour".padEnd(16)} reply text computes to ${col}`); }
}

// The thinking turn's Mog and the settled reply's crystal are mutually
// exclusive by construction: thinking has no [data-yume-reply], settled has
// no .result-thinking. Assert the fixture agrees (guards the content.js
// contract the CSS relies on).
{
  const think = ga.find(([l]) => l === "gpt thinking mog");
  const c = think && typeof think[1] === "object" ? think[1].content : "?";
  if (c !== "none") console.log(`ok   ${"gpt mog slot".padEnd(16)} thinking turn draws the moogle`);
  else { bad++; console.log(`FAIL ${"gpt mog slot".padEnd(16)} no moogle on the thinking turn`); }
}

const gdrew = ga.filter(([, v]) => typeof v === "object" &&
  Object.values(v).some((x) => /img#|url\(/.test(String(x)))).length;
if (gdrew < 6) {
  bad++;
  console.log(`FAIL gpt sanity      only ${gdrew} probes drew an image on the gpt side`);
} else {
  console.log(`ok   gpt sanity      ${gdrew} gpt probes draw sprite images`);
}

/* --------------------------------------------------------------- gemini */

// The Gemini theme, same treatment: bundled vs packaged-and-reimported over a
// gemini.google.com-shaped fixture (Angular custom elements, mat-icon
// ligature icons, the input-area-v2 pill), then MUST checks.
const GEM_ID = "final-fantasy-gemini";
const mmeta = (data.themes || data).find((t) => t.id === GEM_ID);
const mpacked = await P.packTheme(mmeta, readText, readBase64);
const mimported = E.decodeShare(E.encodeShare(mpacked));
const mfeats = (mimported.features || []).join(" ");

const GEM_BODY = `
<bard-sidenav><side-navigation-content>
  <mode-switcher-toggle><div class="app-tabs">
    <button class="app-tab app-tab--active">Chat</button>
    <button class="app-tab">Spark</button>
  </div></mode-switcher-toggle>
  <div class="overflow-container">
    <gem-nav-list-item><a href="/app"><mat-icon class="lumi-symbols">edit</mat-icon><span>New chat</span></a></gem-nav-list-item>
    <gem-nav-list-item><a href="/gems/view"><mat-icon class="lumi-symbols">gem</mat-icon><span>Gems</span></a></gem-nav-list-item>
    <gem-nav-list-item><a href="/app/abc123">A recent chat</a></gem-nav-list-item>
  </div>
  <sidenav-mavatar-footer><div class="mavatar-footer-row">footer</div></sidenav-mavatar-footer>
</side-navigation-content></bard-sidenav>
<main>
  <div class="zero-state-container"><modular-zero-state><h1 class="gds-display-m"><span class="message-text">Your move!</span></h1></modular-zero-state></div>
  <div class="conversation-container">
    <user-query><span class="user-query-bubble-with-background" style="border-radius:18px 4px 18px 18px">a question</span></user-query>
    <model-response data-yume-reply="1" data-yume-latest><div class="response-container">
      <div class="response-container-content">
        <model-thoughts><div class="thoughts-container"><div class="thoughts-content">reasoning</div></div></model-thoughts>
        <message-content><div class="markdown">
          <p>A finished reply with <strong>bold</strong>, <em>italics</em>, <code>inline_code</code> and <a href="#">a link</a>.</p>
          <div><div><ul><li><p class="deep-probe">nested five levels down</p></li></ul></div></div>
          <h3>A heading</h3>
          <pre><code>fenced_code_keeps_its_own_colours()</code></pre>
        </div></message-content>
      </div>
    </div><message-actions><button aria-label="Copy"></button></message-actions></model-response>
  </div>
  <div class="conversation-container">
    <model-response data-yume-working><div class="response-container">
      <div class="response-container-content">
        <model-thoughts><div class="thoughts-container"><div class="thoughts-content">thinking…</div></div></model-thoughts>
        <div class="skeleton-loader-container in-progress" style="height:16px"></div>
      </div>
    </div><div class="thinking-banner below-last-turn">Thinking…</div></model-response>
  </div>
  <input-container><fieldset class="input-area-container" style="border-radius:26px;width:640px;position:relative">
    <input-area-v2><div class="input-area">
      <rich-textarea class="ql-container"><div class="ql-editor ql-blank" data-placeholder="Ask Gemini"><p><br></p></div></rich-textarea>
      <div class="trailing-actions-wrapper">
        <bard-mode-switcher><button data-test-id="bard-mode-menu-button">Pro</button></bard-mode-switcher>
        <div data-test-id="send-button-container"><gem-icon-button class="send-button"><button aria-label="Send message"><mat-icon class="lumi-symbols">up</mat-icon></button></gem-icon-button></div>
      </div>
    </div></input-area-v2>
    <div class="yume-party">
      <div class="yume-party-member" data-member="0" data-pose="idle"></div>
      <div class="yume-party-member" data-member="1" data-pose="fall" style="--pose: 5"></div>
      <div class="yume-party-member" data-member="2" data-pose="idle"
           style="animation: ff-member-idle 1s steps(1) -0.75s infinite paused"></div>
      <div class="yume-party-member" data-member="3" data-pose="idle"></div>
    </div>
  </fieldset></input-container>
  <div class="yume-choco-sky"><div class="yume-choco"></div></div>
</main>
<div class="popover-menu"><gem-menu role="menu"><gem-menu-item class="selected">2.5 Pro</gem-menu-item></gem-menu></div>
<mat-tooltip-component><div class="mdc-tooltip gem-tooltip">a tooltip</div></mat-tooltip-component>`;

const GEM_PROBES = JSON.stringify([
  ["gem sky",          "body",                                   null,       ["backgroundImage", "backgroundAttachment"]],
  ["gem moon",         "html",                                   "::before", ["content", "backgroundImage"]],
  ["gem motes",        "html",                                   "::after",  ["content", "backgroundImage", "animationName"]],
  ["gem stars",        "body",                                   "::after",  ["content", "animationName"]],
  ["gem greeting",     "modular-zero-state h1",                  null,       ["fontFamily", "textShadow"]],
  ["gem user bubble",  ".user-query-bubble-with-background",     null,       ["backgroundImage", "borderTopWidth", "borderTopColor", "borderRadius"]],
  ["gem reply window", "model-response[data-yume-reply] .response-container-content", null, ["backgroundImage", "borderTopWidth", "borderRadius", "animationName"]],
  ["gem crystal",      "model-response[data-yume-reply] .response-container-content", "::before", ["content", "backgroundImage", "width", "height", "animationName"]],
  ["gem reply body",   ".markdown p",                            null,       ["fontFamily", "color"]],
  ["gem reply deep",   ".markdown .deep-probe",                  null,       ["fontSize"]],
  ["gem rich bold",    ".markdown strong",                       null,       ["color"]],
  ["gem rich italic",  ".markdown em",                           null,       ["color"]],
  ["gem rich heading", ".markdown h3",                           null,       ["color"]],
  ["gem rich code",    ".markdown code:not(pre code)",           null,       ["color"]],
  ["gem fenced code",  ".markdown pre code",                     null,       ["color"]],
  ["gem thoughts",     "model-thoughts",                         null,       ["borderTopWidth", "borderRadius"]],
  ["gem think banner", ".thinking-banner",                       null,       ["backgroundImage", "fontFamily", "marginLeft"]],
  ["gem thinking mog", "model-response[data-yume-working] .response-container", "::after", ["content", "backgroundImage", "animationName"]],
  ["gem parked mog",   "model-response[data-yume-latest] .response-container", "::after", ["content"]],
  ["gem composer",     "fieldset.input-area-container",          null,       ["backgroundImage", "borderTopWidth", "borderRadius", "animationName", "zIndex"]],
  ["gem mode pill",    'button[data-test-id="bard-mode-menu-button"]', null, ["borderTopWidth", "fontFamily"]],
  ["gem send hand",    'button[aria-label="Send message"]',      "::after",  ["content", "backgroundImage", "transform", "width"]],
  ["gem send glyph",   'button[aria-label="Send message"] > mat-icon', null, ["opacity"]],
  ["gem party row",    "fieldset > .yume-party",                 null,       ["position", "zIndex"]],
  ["gem kneel pose",   '.yume-party-member[data-member="0"][data-pose="idle"]', null, ["backgroundPositionX", "animationName"]],
  ["gem fall pose",    '.yume-party-member[data-pose="fall"]',   null,       ["backgroundPositionX"]],
  ["gem mid-bob",      '.yume-party-member[data-member="2"]',    null,       ["backgroundPositionX"]],
  ["gem idle anim",    '.yume-party-member[data-member="3"]',    null,       ["animationName"]],
  ["gem sidebar",      "bard-sidenav",                           null,       ["backgroundImage", "borderRightWidth", "borderRightColor"]],
  ["gem tab box",      "mode-switcher-toggle .app-tabs",         null,       ["borderTopWidth", "borderRadius"]],
  ["gem active tab",   "button.app-tab.app-tab--active",         null,       ["backgroundImage", "color"]],
  ["gem new icon",     'a[href="/app"] mat-icon',                "::after",  ["content", "backgroundImage", "width"]],
  ["gem new glyph",    'a[href="/app"] mat-icon',                null,       ["color"]],
  ["gem gems icon",    'a[href^="/gems"] mat-icon',              "::after",  ["backgroundImage"]],
  ["gem row hand",     'a[href="/app"]',                         "::before", ["content", "backgroundImage", "opacity"]],
  ["gem footer",       "sidenav-mavatar-footer",                 null,       ["backgroundImage", "borderTopWidth", "borderRadius"]],
  ["gem menu",         ".popover-menu",                          null,       ["backgroundImage", "borderTopWidth", "borderRadius"]],
  ["gem menu sel",     "gem-menu-item.selected",                 null,       ["color"]],
  ["gem tooltip",      ".mdc-tooltip.gem-tooltip",               null,       ["backgroundImage", "borderTopWidth", "fontFamily"]],
  ["gem choco sky",    ".yume-choco-sky",                        null,       ["position", "zIndex"]],
  ["gem choco spr",    ".yume-choco-sky .yume-choco",            null,       ["animationName", "backgroundSize"]],
]);

const GEM_REPORT = REPORT.replace("const probes = " + PROBES, "const probes = " + GEM_PROBES);
if (GEM_REPORT === REPORT) throw new Error("GEM_REPORT substitution found nothing — the probe anchor moved");

const mpage = (attrs, head) => `<!doctype html>
<html lang="en" ${attrs}>
<head><meta charset="utf-8">
<style>
  html, body { margin: 0; min-height: 600px; }
  bard-sidenav { display: block; width: 240px; float: left; min-height: 600px; }
  gem-nav-list-item a { display: block; padding: 6px 10px; position: relative; }
  mat-icon { display: inline-block; width: 20px; height: 20px; }
  main { min-height: 600px; padding: 20px; margin-left: 250px; }
  .app-tabs { display: flex; }
  fieldset.input-area-container { border: 0; }
</style>
${head}
</head>
<body class="dark-theme">${GEM_BODY}
<script>window.addEventListener("load", () => { ${GEM_REPORT} });</script>
</body></html>`;

const mlinkHead = [
  "fonts/fonts.css", ...P.SPRITE_SHEETS, `themes/${GEM_ID}.css`,
].map((p) => `<link rel="stylesheet" href="../${p}">`).join("\n");
const mcompiled = E.compileCss(mimported);
const mimportedHead = `<style>\n${mcompiled}\n</style>`;

const MA = rel("tools/.pack-ma.html");
const MB = rel("tools/.pack-mb.html");
const MOPT = 'data-yume-opt="rich-text menu-sounds bottom-scenery"';
await writeFile(MA, mpage(`data-cct-theme="${GEM_ID}" data-yume-feat="party stars composer-glow replies" ${MOPT}`, mlinkHead), "utf8");
await writeFile(MB, mpage(`data-cct-theme="${mimported.id}" data-yume-feat="${mfeats}" ${MOPT}`, mimportedHead), "utf8");

const [ma, mb] = await Promise.all([probe(MA), probe(MB)]);
await Promise.all([rm(MA, { force: true }), rm(MB, { force: true })]);

console.log("");
for (let i = 0; i < ma.length; i++) {
  const [label, av] = ma[i];
  const bv = mb[i][1];
  if (typeof av === "string" || typeof bv === "string") {
    bad++;
    console.log(`FAIL ${label.padEnd(16)} ${av} / ${bv}`);
    continue;
  }
  const diffs = Object.keys(av).filter((k) => av[k] !== bv[k]);
  checks += Object.keys(av).length;
  if (diffs.length) {
    bad++;
    console.log(`FAIL ${label.padEnd(16)} ` +
      diffs.map((k) => `${k}: bundled=${av[k]}  imported=${bv[k]}`).join("\n                      "));
  } else {
    console.log(`ok   ${label.padEnd(16)} ${Object.keys(av).length} propert${Object.keys(av).length === 1 ? "y" : "ies"} match`);
  }
}

const GEM_MUST = {
  "gem sky":          ["backgroundImage", /^img#/],
  "gem moon":         ["backgroundImage", /img#|url\(/],
  "gem greeting":     ["fontFamily", /Press Start/],
  "gem user bubble":  ["backgroundImage", /linear-gradient/],
  "gem user radius":  null,
  "gem reply window": ["borderTopWidth", /^2px$/],
  "gem crystal":      ["width", /^16px$/],
  "gem reply body":   ["fontFamily", /Press Start/],
  "gem reply colour": null,
  "gem reply deep":   ["fontSize", /^12px$/],
  "gem think banner": ["fontFamily", /Silkscreen/],
  "gem thinking mog": ["animationName", /ff-moogle-frames/],
  // Both a latest and a working reply are mounted; the parked Mog must
  // stand down so he never doubles mid-run.
  "gem parked mog":   ["content", /^none$/],
  "gem composer":     ["animationName", /ff-breathe/],
  "gem composer rad": null,
  "gem send hand":    ["backgroundImage", /img#|url\(/],
  "gem send glyph":   ["opacity", /^0$/],
  "gem kneel pose":   ["backgroundPositionX", /^80%$/],
  "gem fall pose":    ["backgroundPositionX", /^100%$/],
  "gem mid-bob":      ["backgroundPositionX", /^20%$/],
  // A working reply is mounted, so idle members must be bobbing.
  "gem idle anim":    ["animationName", /ff-member-idle/],
  "gem sidebar":      ["borderRightWidth", /^2px$/],
  "gem tab box":      ["borderTopWidth", /^2px$/],
  "gem active tab":   ["backgroundImage", /linear-gradient/],
  "gem new icon":     ["backgroundImage", /^img#|^url\(/],
  // The stock ligature glyph hides by colour (the slot's size is load-bearing).
  "gem new glyph":    ["color", /rgba\(0, 0, 0, 0\)|transparent/],
  "gem row hand":     ["opacity", /^0$/],
  "gem footer":       ["backgroundImage", /linear-gradient/],
  "gem menu":         ["backgroundImage", /linear-gradient/],
  "gem menu sel":     ["color", /rgb\(255, 215, 94\)/],
  "gem tooltip":      ["fontFamily", /Silkscreen/],
  "gem choco sky":    ["position", /^fixed$/],
  "gem choco spr":    ["animationName", /ff-choco-gait/],
};

for (const [label, spec] of Object.entries(GEM_MUST)) {
  if (!spec) continue;
  const [prop, want] = spec;
  const row = ma.find(([l]) => l === label);
  const got = row && typeof row[1] === "object" ? row[1][prop] : undefined;
  if (want.test(String(got))) {
    console.log(`ok   ${label.padEnd(16)} is genuinely themed (${prop}: ${got})`);
  } else {
    bad++;
    console.log(`FAIL ${label.padEnd(16)} ${prop} is "${got}" — the gemini theme rule is not applying`);
  }
}

// Inline-style wars: the pill ships border-radius:26px and the bubble an
// asymmetric 18px set inline; the windows must land on 9px/7px.
{
  const comp = ma.find(([l]) => l === "gem composer");
  const r = comp && typeof comp[1] === "object" ? comp[1].borderRadius : "?";
  if (r === "9px") console.log(`ok   ${"gem composer rad".padEnd(16)} 9px beats the inline 26px pill`);
  else { bad++; console.log(`FAIL ${"gem composer rad".padEnd(16)} composer radius is "${r}" — the inline 26px is winning`); }
  const bub = ma.find(([l]) => l === "gem user bubble");
  const br = bub && typeof bub[1] === "object" ? bub[1].borderRadius : "?";
  if (br === "7px") console.log(`ok   ${"gem user radius".padEnd(16)} 7px beats the inline 18px set`);
  else { bad++; console.log(`FAIL ${"gem user radius".padEnd(16)} bubble radius is "${br}"`); }
  const body = ma.find(([l]) => l === "gem reply body");
  const col = body && typeof body[1] === "object" ? body[1].color : "?";
  if (col === "rgb(255, 255, 255)") console.log(`ok   ${"gem reply colour".padEnd(16)} stated explicitly (white), not inherited`);
  else { bad++; console.log(`FAIL ${"gem reply colour".padEnd(16)} reply text computes to ${col}`); }
}

const mdrew = ma.filter(([, v]) => typeof v === "object" &&
  Object.values(v).some((x) => /img#|url\(/.test(String(x)))).length;
if (mdrew < 6) {
  bad++;
  console.log(`FAIL gem sanity      only ${mdrew} probes drew an image on the gemini side`);
} else {
  console.log(`ok   gem sanity      ${mdrew} gemini probes draw sprite images`);
}

console.log(bad
  ? `\n${bad} probe(s) differ — that much of the theme does not survive export`
  : `\nround-trip clean — ${checks} properties identical across ${a.length + ga.length + ma.length} probes`);
process.exit(bad ? 1 : 0);
