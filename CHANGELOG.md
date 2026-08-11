# Changelog

## 1.3.6 — 2026-08-11

- The send/submit slot is stripped of every fill UNCONDITIONALLY — no
  colour tests (the box was a blue fill fed by our own tokens, which two
  colour-tested sweeps politely skipped), no label tests (Submit vs Send
  message vs neither, per build). The stop state opts back out so the gold
  stop chip still shows.
- Menu flash: the card was dressed instantly but its inner groups mount a
  beat later and flashed their own dark fills. Children are now glassed in
  the mutation microtask — before the browser paints — and the card holds
  invisible until its first fully-dressed frame (double-rAF), with the CSS
  veil as the pre-stamp cover.

## 1.3.5 — 2026-08-11

The band and the finger, actually solved — both verified against the live
page this time.

- The bottom "second layer" chat text hides behind is input-container's
  ::BEFORE — a pseudo-element, invisible to every DOM sweep ever written,
  which is how it survived four rounds. A stylesheet !important repaint
  (proven live, applied + reverted) turns it into a night-sky fade.
- The box behind the select hand: the fill lives on the bare
  gem-icon-button WRAPPER (and the button's aria-label is "Submit" on some
  builds, "Send message" on others). content.js now finds the button by
  label pattern and strips every fill from it, its inner layers, and its
  ancestor chain, unconditionally.
- Context menus stopped flashing black before turning blue: undressed
  overlay cards hold invisible behind a 90ms pure-CSS veil the dresser
  lifts the instant the window fill lands — with the animation as a
  dead-man's switch so a menu can never stay hidden.
- The whole sidebar wears the pixel face now (rows re-declare their own
  fonts on inner spans; stated on the descendants, icons exempt).

## 1.3.4 — 2026-08-11

- Dressed overlay cards are re-glassed on every mutation pass: menu groups
  that mount AFTER the card (the "mostly black" block) get caught now.
- Hover/selected rows inside menus go gold wash via CSS (they are dynamic
  Material state layers no inline pin can reach).
- The box behind the select hand was the send slot's WRAPPER elements
  painting, not the button — the shell sweep now glasses the whole subtree,
  with a stylesheet backup.
- The bottom scroll-fade colour now matches the sky gradient's own bottom
  stop with a gentler ramp, and the sweep probes three x positions so
  offset painters can't dodge it.

## 1.3.3 — 2026-08-11

Third polish round: measured enforcement over selector guessing.

- Overlay surfaces (the + menu's mat-cards AND dialog surfaces like the
  notebook Sources window) are dressed INLINE by content.js the moment they
  mount: window-gradient fill, and any child painting Google's near-black
  surface family goes glass — colours with real hue survive. A/B builds
  kept shuffling the class names; geometry and computed colour don't lie.
- The label font rides the same stamp, so every menu/dialog row gets the
  pixel face, not just the spans one build happened to name .menu-text.
- The bottom strip where chat scrolls out of view is Gemini's scroll-fade:
  instead of deleting it, the shell sweep repaints it as a night-sky fade,
  so text melts into OUR dark rather than Google's black. The sweep works
  by probing the strip and pinning whatever wide painter it finds.
- User bubbles: the truncation scrim and the grey chip behind the
  expand/collapse arrow are swept to glass — just the arrow now.
- The composer's send-hand exclusions are structural (send-button-container
  / gem-icon-button.send-button), not aria-label-dependent — the box behind
  the finger while typing is gone for every label variant.
- Chips (the notebook "N sources" pill) become little blue menu buttons;
  the footer's settings gear becomes the menu crystal, as on the other
  sites.

## 1.3.2 — 2026-08-11

Second Gemini polish round, live-diagnosed.

- The + menu's dark fill survived 1.3.1: it is a literal high-specificity
  declaration in a cross-origin sheet, no token behind it. The window fill
  now states every background longhand in full !important dress, and the
  item labels get the pixel face on the spans that re-declare their own
  font (.menu-text / .item).
- The bottom band (input-container's opaque #0f0f0f) is now pinned
  transparent by content.js with an inline !important — the one lever no
  stylesheet can outrank — cleared again when the theme switches off.
- The active sidebar row trades gold for a crystal-blue wash with a soft
  pulsing glow, per taste.
- Composer buttons (plus, mode pill, mic, stop) flatten to one 32px chip
  height — they shipped in three sizes — and the send hand opts out of the
  chip frame entirely, so the finger no longer wears a box.

## 1.3.1 — 2026-08-11

Gemini polish, from first-morning feedback on the live site.

- The composer's **+ menu** and its More-uploads/More-tools flyouts (Material
  `mat-card.lm-menu-theme` overlays, not mat-menu panels) are now proper menu
  windows with gold hover rows.
- The **active sidebar row** (current page / open chat) trades Gemini's flat
  dark pill for a gold cursor-row wash with a thin white ring; the trailing
  "More options" arrow keeps just its arrow (its Material state layer goes
  gold on hover instead of the grey disc).
- **Sidebar section windows**: New chat + Search chats, Images…Gems, and the
  Notebooks section each sit in their own white-framed box (Recent stays
  open). Section headers ride gold inside them.
- The **black band** across the viewport bottom after a reply was
  `input-container`'s own opaque #0f0f0f — now reliably glass (heavier
  selectors plus the longhand).
- The **gold block** beside the caret was the editor's own scrollbar wearing
  the theme's gold thumb; scrollbars inside the composer pill are hidden,
  as stock Gemini does.

## 1.3.0 — 2026-08-11

Final Fantasy comes to gemini.google.com.

- The popup gains a **Gemini** tab with its own selection slot
  (`cctThemeGemini`); imports carrying `site: "gemini"` file themselves under
  it automatically.
- New bundled theme: **💎 Final Fantasy (Gemini)** — the full treatment on
  the signed-in Pro build, Chat and Spark surfaces alike: night sky +
  starfields + moon + horizon, menu-window composer (the `input-area-v2`
  pill) and reply windows with the crystal, pixel fonts (12px grid-aligned
  prose, "Luminous Symbols" icon ligatures preserved), the party idling on
  the composer (kneeling under the zero-state greeting), working-Mog under
  the newest reply for the whole run (stop button + skeleton/shimmer/
  thinking-banner union, with the ChatGPT port's hysteresis), sidebar
  icon remaps keyed on link hrefs (Gems wear the crystal), the Chat/Spark
  toggle as a two-tab menu window with a gold active tab, the mavatar
  footer as its own window, gem-menu popovers and mdc tooltips framed,
  menu sounds, and all three chocobo runs staged off the composer pill.
- DOM facts that shaped the port, probed live: the visible composer pill
  belongs to the `input-area-v2` host (fieldset and inner wrappers are
  transparent); `div.response-container` nests INSIDE the
  `<response-container>` element (Mog anchors the div — the dual selector
  would have drawn two of him); settled replies keep only an empty
  `thinking-overlay` where the thoughts UI lived (excluded from the reply
  stamp, never given a border); a hidden pagination spinner idles in the
  history scroller at rest, so the busy test scopes spinners to the newest
  reply.
- Test coverage: a gemini smoke fixture (full working-stamp lifecycle,
  chocobo mounts, slot isolation), a gemini round-trip in pack-test (41
  probes incl. the pill/bubble inline-radius wars and both Mog slots),
  popup Gemini-tab assertions, and tools/gemini-mock.html for visual
  iteration offline.

## 1.2.0 — 2026-08-01

The ChatGPT theme, finished against the real logged-in site.

- Sidebar: the nav group (New chat…More), **Pinned** and **Projects** each sit
  in their own white-bordered menu window, sized by their content. Projects
  rows cycle the eight equipment icons (sword, axe, shield, staff, armor,
  hammer, helm, gauntlet); pinned chats get the chat-bubble; More wears the
  frog and its Images/Sites/GPTs menu gets star/halo/hood; Library the tome,
  Scheduled the clock, the profile row the menu crystal.
- **Mog is a permanent resident**: parked under the newest reply (he survives
  reloads), hopping only while ChatGPT is thinking/searching/writing, never
  doubled. His "working" sense unified everything that means busy, with a
  grace window so phase hand-offs can't blink him out.
- README rewritten as a simple front door: what it is, how to install.

## 1.1.0 — 2026-07-31

Final Fantasy comes to chatgpt.com.

- The popup now has **Claude / OpenAI** tabs; each site keeps its own selected
  theme (`cctTheme` / `cctThemeGpt`), and imports file themselves under the
  right tab automatically.
- New bundled theme: **💎 Final Fantasy (OpenAI)** — the full treatment on
  ChatGPT's Chat surface: night sky + starfields + moon + horizon, menu-window
  composer and replies with the crystal, pixel fonts (12px grid-aligned
  prose), the party idling on the composer (kneeling under the greeting,
  bobbing while ChatGPT works), working-Mog on the thinking dot, sidebar item
  icons + hover hand, themed menus/dialogs/tooltips, gold buttons, menu
  sounds, and all three chocobo runs.
- The inline canvas ("writing block") is themed too — including a cascade-layer
  override for ChatGPT's `!`-suffixed tailwind fills.
- Export/import carries the theme's site; older builds simply ignore it.
- Test coverage: a chatgpt-shaped smoke fixture, a gpt round-trip in
  pack-test (40 probes incl. the layer war and inline-style wins), and popup
  site-tab assertions.

Known gap, pending a logged-in DOM report: Pro-only surfaces (the Work tab's
task rows, sidebar section lists) are covered by token-level styling but their
markup-specific dressing may need one follow-up pass.

## 1.0.0 — 2026-07-29

First public release.

- Yume Forge Modified browser add-on with import, export, sharing, and theme
  studio support.
- Final Fantasy theme for Claude Home and Code views.
- One complete add-on download with Final Fantasy already bundled.
- Interactive party, crystal, menu styling, pixel fonts, ambience, sounds,
  accessibility-aware motion, and optional theme settings.
