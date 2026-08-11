# Yume Forge Modified

Themes for **claude.ai**, **chatgpt.com** and **gemini.google.com**, in one
Chrome extension.

A fork of [Yume Themes for Claude](https://chromewebstore.google.com/detail/ipfkpkhddkhndibomlaklpfaikjfdlgb)
(by Mohamed El-Harras) with:

- **A Final Fantasy theme** — royal-blue menu windows with white frames, pixel
  fonts, a crystal beside every reply, a four-person party idling on the
  message box, a moogle who supervises the replies, menu sounds, and the
  occasional chocobo drive-by. Works on **all three sites**: all of claude.ai
  (Home and the Code tab), chatgpt.com, and gemini.google.com (the Chat and
  Spark surfaces alike).
- **Claude / OpenAI / Gemini tabs in the popup** — each site keeps its own
  selected theme, so you can run Final Fantasy on all of them, or mix and
  match.
- **Import / export / share** — every theme card has a **⤓** button that
  saves a self-contained file and copies a share code. Import a file, a
  pasted code, or a zip of either.
- The original's 24 Claude themes, untouched.

## Install (Chrome)

1. Download **`yume-forge-modified.zip`** from the
   [latest release](https://github.com/icpryde/yume-forge-modified/releases/latest)
   and **unzip it**.
2. If you have the original *Yume Themes for Claude* (or an older copy of
   this) installed, remove or disable it first.
3. Open `chrome://extensions` in Chrome.
4. Turn on **Developer mode** (toggle in the top right).
5. Click **Load unpacked** and pick the unzipped `yume-forge-modified` folder.
6. Open (or reload) claude.ai, chatgpt.com or gemini.google.com, click the
   extension's icon, and pick a theme — use the **Claude / OpenAI / Gemini**
   tabs at the top of the popup to choose which site you're theming.

Also works in Arc and other Chromium browsers — use `arc://extensions` (or the
equivalent) instead in step 3.

Because it's loaded unpacked it never auto-updates: to update, download the
new zip, replace the folder, and press **↻** on the extension's card.

### Theme settings

Cards with options show a **⚙** — Final Fantasy has three: colourful text,
menu sounds, and the horizon scenery. There are also buttons in there to
summon the chocobo on demand; left alone, he visits on his own every few
minutes.

## Sharing themes

**⤓** on any card saves a `.yume.json` file and copies a `YUME1:` code —
send either one. **📥 Import a theme** (or **Paste code**) brings one in;
imports are self-contained (sprites, fonts and sounds travel inside the file)
and never overwrite your existing themes.

## Trust notes (what changed from the store version)

- The store version's background service worker — which fetched CSS from a
  remote repo every 6 hours and injected it into claude.ai — is **removed**.
  Nothing remote ever lands in your sessions.
- Permissions are just `storage`.
- Theme files are data-only: nothing a theme contains can execute.

## For developers

`node tools/check.mjs` runs every test suite (engine, content-script smoke
drives for both sites, glyph states, packaged-theme round-trips, popup, zip).
`node tools/package.mjs --out ./release` builds the shareable zip. The asset
generators and their sources are documented in `tools/` — the generated
`sprites/*.css` files each name the tool that wrote them.

## Credits

- Original extension by **Mohamed El-Harras**.
- **Press Start 2P** © 2012 CodeMan38, **Silkscreen** © 2001 Jason Kottke —
  both SIL Open Font License 1.1 (`fonts/OFL.txt`).

This is an unofficial, non-commercial fan project. Final Fantasy and related
names and characters are trademarks or copyrighted works of their respective
owners. This project is not affiliated with or endorsed by Square Enix or
OpenAI or Anthropic.
