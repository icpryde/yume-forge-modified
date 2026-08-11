// Yume Forge — packaging test.
//
//   node tools/zip-test.mjs
//
// Two release-critical claims are tested here:
//
//   1. zipped theme files can be handed to the popup and imported
//   2. yume-forge-modified.zip is complete and loadable with no junk in it
//
// The extension archive is the real release output. Theme archives are
// internal fixtures now: Final Fantasy is bundled in the extension and is no
// longer published as a separate download. The fixtures still exercise the
// actual lib/themezip.js in a real browser.

import { readFile, rm, writeFile, mkdtemp } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findChrome } from "./chrome.mjs";
import { homedir, tmpdir } from "node:os";

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = findChrome();
// Defaults to the repo's release/ dir — where tools/package.mjs writes. It
// used to default to ~/Downloads, which could hold an OLDER build: the suite
// then verified the stale zip and reported "packaging clean" while the fix
// under test was absent from the artifact. Verify what you just built.
const OUT = process.argv[2] ? resolve(process.argv[2]) : resolve(ROOT, "release");

const EXT_ZIP = join(OUT, "yume-forge-modified.zip");

// Build an internal theme-import fixture. This proves zip import still works
// without creating or advertising a second public release download.
const vdir = await mkdtemp(join(tmpdir(), "yume-variants-"));
const src = join(vdir, "src");
const at = (d) => ({ cwd: d });
await run("mkdir", ["-p", src]);
await run("cp", [resolve(ROOT, "dist/final-fantasy.yume.json"), join(src, "final-fantasy.yume.json")]);
await run("cp", [resolve(ROOT, "dist/final-fantasy.yume.txt"), join(src, "final-fantasy.yume.txt")]);
await writeFile(join(src, "READ ME FIRST.txt"), "Internal theme-import test fixture.\n", "utf8");
const THEME_ZIP = join(vdir, "zip-X.zip");
await run("zip", ["-rqX", THEME_ZIP, "."], at(src));

let bad = 0;
const ok = (m) => console.log("ok   " + m);
const fail = (m) => { bad++; console.log("FAIL " + m); };

/* ------------------------------------------ 1. the theme zip imports */

const zipBytes = await readFile(THEME_ZIP);
const direct = JSON.parse(await readFile(resolve(ROOT, "dist/final-fantasy.yume.json"), "utf8"));

const page = `<!doctype html><html><head><meta charset="utf-8">
<script src="../lib/theme-engine.js"></script>
<script src="../lib/packer.js"></script>
<script src="../lib/themezip.js"></script>
</head><body><script>
// The archive, base64'd into the page: Chrome blocks fetch() on file:// even
// with --allow-file-access-from-files, and the point is to exercise the real
// bytes rather than something re-encoded on the way in.
const B64 = "${zipBytes.toString("base64")}";
const bin = atob(B64);
const bytes = new Uint8Array(bin.length);
for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

(async () => {
  const out = {};
  try {
    out.looksLikeZip = YumeZip.looksLikeZip(bytes);
    out.names = YumeZip.entries(bytes).map((e) => e.name);
    out.methods = [...new Set(YumeZip.entries(bytes).map((e) => e.method))];

    const text = await YumeZip.extractTheme(bytes);
    out.textLen = text.length;
    out.textHead = text.slice(0, 60);
    out.textTail = text.slice(-40);
    const theme = YumeEngine.decodeShare(text);
    out.name = theme.name;
    out.emoji = theme.emoji;
    out.features = theme.features;
    out.rawCssLen = (theme.rawCss || "").length;
    // Compile it the way content.js would, then neutralise the freshly minted
    // id so it can be compared against a direct import byte for byte.
    out.css = YumeEngine.compileCss(theme).split(theme.id).join("ID");

    // And the text-code path, which is the other half of the bundle.
    const codeEntry = YumeZip.entries(bytes)
      .find((e) => e.name.split("/").pop().toLowerCase().endsWith(".yume.txt"));
    if (!codeEntry) throw new Error("no .yume.txt in the bundle");
    const code = new TextDecoder().decode(await YumeZip.read(bytes, codeEntry));
    const t2 = YumeEngine.decodeShare(code);
    out.codeCss = YumeEngine.compileCss(t2).split(t2.id).join("ID");
  } catch (e) {
    out.error = e.message;
  }
  document.title = "ZIP:" + encodeURIComponent(JSON.stringify(out));
})();
</script></body></html>`;

const file = resolve(ROOT, "tools/.zip-test.html");
await writeFile(file, page, "utf8");
const { stdout } = await run(CHROME, [
  "--headless", "--disable-gpu", "--allow-file-access-from-files",
  "--virtual-time-budget=8000", "--dump-dom", "file://" + file,
], { maxBuffer: 400 * 1024 * 1024 });
await rm(file, { force: true });

const m = /<title>ZIP:([\s\S]*?)<\/title>/.exec(stdout);
if (!m) {
  fail("the zip-reading page never reported — check for a script error");
} else {
  const r = JSON.parse(decodeURIComponent(m[1].replace(/&amp;/g, "&")));
  if (r.error) {
    fail("reading the theme zip threw: " + r.error +
      (r.textHead ? `\n     extracted ${r.textLen} chars starting: ${JSON.stringify(r.textHead)}` : ""));
  } else {
    r.looksLikeZip ? ok("magic bytes recognised as a zip") : fail("magic bytes not recognised");
    ok(`archive lists ${r.names.length} entries: ${r.names.join(", ")}`);
    // Method 8 is deflate. If everything came back stored the inflater never
    // ran, and this test would pass without proving it works.
    r.methods.includes(8)
      ? ok("at least one entry is deflated, so DecompressionStream was exercised")
      : fail(`nothing in the archive is deflated (methods: ${r.methods}) — inflate path untested`);

    r.name === direct.name && r.emoji === direct.emoji
      ? ok(`extracted the right theme (${r.emoji} ${r.name})`)
      : fail(`extracted "${r.emoji} ${r.name}", expected "${direct.emoji} ${direct.name}"`);

    JSON.stringify(r.features) === JSON.stringify(direct.features)
      ? ok(`features survived: ${r.features.join(", ")}`)
      : fail(`features differ: zip=${JSON.stringify(r.features)} direct=${JSON.stringify(direct.features)}`);

    r.rawCssLen === direct.rawCss.length
      ? ok(`rawCss intact (${r.rawCssLen} bytes)`)
      : fail(`rawCss is ${r.rawCssLen} bytes from the zip, ${direct.rawCss.length} direct`);

    {
      const want = ["hover", "select", "fall-1", "fall-2", "fall-3", "chirp", "step", "jump"];
      const got = direct.sounds || {};
      const missing = want.filter((n) => !got[n]);
      // "UklGR" is base64 for "RIFF" — the wav magic. A truncated or
      // mis-encoded sound would import fine and fail only at play time.
      const bad = want.filter((n) => got[n] && !got[n].startsWith("data:audio/wav;base64,UklGR"));
      missing.length || bad.length
        ? fail(`theme sounds: missing [${missing}] malformed [${bad}]`)
        : ok(`all ${want.length} sounds embedded in the theme as RIFF wavs`);
    }

    r.css === r.codeCss
      ? ok("the .json and the .txt code in the bundle compile identically")
      : fail("the bundled .txt code compiles to different CSS than the .json");
  }
}

/* ------------------------ 1b. zips made by other tools, and broken ones */

// The shipped bundle is only ever produced by one command, so testing only
// that proves almost nothing about what happens when someone re-zips the
// folder in Finder, or the download truncates. Build the variants for real and
// run each through the actual reader.

const mk = async (name, build) => { const p = join(vdir, name); await build(p); return { name, path: p }; };

const VARIANTS = [
  { name: "zip-X.zip", path: THEME_ZIP },
  await mk("zip-plain.zip",  (p) => run("zip", ["-rq", p, "."], at(src))),
  await mk("zip-stored.zip", (p) => run("zip", ["-rq", "-0", p, "."], at(src))),
  await mk("ditto.zip",      (p) => run("ditto", ["-c", "-k", "--sequesterRsrc", src, p])),
  await mk("encrypted.zip",  (p) => run("zip", ["-rqX", "-P", "hunter2", p, "."], at(src))),
];

// Only the code + a readme: no .yume.json at all.
{
  const only = join(vdir, "onlycode");
  await run("mkdir", ["-p", only]);
  await run("cp", [resolve(ROOT, "dist/final-fantasy.yume.txt"), join(only, "final-fantasy.yume.txt")]);
  await writeFile(join(only, "README.txt"), "Not a theme.\n", "utf8");
  VARIANTS.push(await mk("code-only.zip", (p) => run("zip", ["-rqX", p, "."], at(only))));
}

// Theme buried two folders down.
{
  const deep = join(vdir, "deep");
  await run("mkdir", ["-p", join(deep, "themes", "mine")]);
  await run("cp", [resolve(ROOT, "dist/final-fantasy.yume.json"), join(deep, "themes", "mine", "final-fantasy.yume.json")]);
  VARIANTS.push(await mk("nested.zip", (p) => run("zip", ["-rqX", p, "."], at(deep))));
}

// An archive comment after the EOCD — the reader has to scan backwards for it.
{
  const p = join(vdir, "commented.zip");
  await run("cp", [VARIANTS[0].path, p]);
  const buf = await readFile(p);
  const cmt = Buffer.from("a trailing archive comment, which is legal and rare");
  // Bump the EOCD comment length and append. Scanning forwards for the EOCD
  // signature would find a false positive inside compressed data; this is what
  // makes the backwards scan necessary.
  let e = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  buf.writeUInt16LE(cmt.length, e + 20);
  await writeFile(p, Buffer.concat([buf, cmt]));
  VARIANTS.push({ name: "commented.zip", path: p });
}

// Corrupt the .json entry's compressed bytes, leaving the directory sane. The
// bundle also carries the same theme as a .yume.txt code, so this SHOULD still
// import — that redundancy is the point of shipping both.
{
  const p = join(vdir, "corrupt-one.zip");
  await run("cp", [VARIANTS[0].path, p]);
  const buf = await readFile(p);
  const from = buf.indexOf(Buffer.from("final-fantasy.yume.json")) + 200;
  for (let i = from; i < from + 400 && i < buf.length - 300; i++) buf[i] ^= 0xff;
  await writeFile(p, buf);
  VARIANTS.push({ name: "corrupt-one.zip", path: p });
}

// Now damage EVERY candidate, so there is nothing to fall back to and the
// error the user sees has to name the real problem.
{
  const p = join(vdir, "corrupt-all.zip");
  await run("cp", [VARIANTS[0].path, p]);
  const buf = await readFile(p);
  for (const entry of ["final-fantasy.yume.json", "final-fantasy.yume.txt"]) {
    const from = buf.indexOf(Buffer.from(entry)) + 200;
    for (let i = from; i < from + 600 && i < buf.length - 300; i++) buf[i] ^= 0xff;
  }
  await writeFile(p, buf);
  VARIANTS.push({ name: "corrupt-all.zip", path: p });
}

// And the wrong archive entirely: the extension, picked by mistake.
VARIANTS.push({ name: "extension.zip", path: EXT_ZIP });

// Expected outcome per variant: "theme" = imports, or a substring the error
// message must contain.
const EXPECT = {
  "zip-X.zip": "theme",
  "zip-plain.zip": "theme",
  "zip-stored.zip": "theme",
  "ditto.zip": "theme",
  "code-only.zip": "theme",
  "nested.zip": "theme",
  "commented.zip": "theme",
  "encrypted.zip": "password-protected",
  "corrupt-one.zip": "theme",
  "corrupt-all.zip": "corrupted",
  "extension.zip": "doesn't contain a theme",
};

const loaded = [];
for (const v of VARIANTS) loaded.push([v.name, (await readFile(v.path)).toString("base64")]);

const vpage = `<!doctype html><html><head><meta charset="utf-8">
<script src="../lib/theme-engine.js"></script>
<script src="../lib/themezip.js"></script>
</head><body><script>
const ARCHIVES = ${JSON.stringify(loaded)};
const toBytes = (b64) => { const s = atob(b64); const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
(async () => {
  const out = {};
  for (const [name, b64] of ARCHIVES) {
    try {
      const text = await YumeZip.extractTheme(toBytes(b64));
      const t = YumeEngine.decodeShare(text);
      out[name] = { ok: true, name: t.name, css: YumeEngine.compileCss(t).length };
    } catch (e) {
      out[name] = { ok: false, error: e.message };
    }
  }
  document.title = "VAR:" + encodeURIComponent(JSON.stringify(out));
})();
</script></body></html>`;

const vfile = resolve(ROOT, "tools/.zip-variants.html");
await writeFile(vfile, vpage, "utf8");
const vout = (await run(CHROME, [
  "--headless", "--disable-gpu", "--allow-file-access-from-files",
  "--virtual-time-budget=15000", "--dump-dom", "file://" + vfile,
], { maxBuffer: 600 * 1024 * 1024 })).stdout;
await rm(vfile, { force: true });
await rm(vdir, { recursive: true, force: true });

const vm = /<title>VAR:([\s\S]*?)<\/title>/.exec(vout);
if (!vm) {
  fail("the zip-variants page never reported");
} else {
  const vr = JSON.parse(decodeURIComponent(vm[1].replace(/&amp;/g, "&")));
  for (const [name, want] of Object.entries(EXPECT)) {
    const got = vr[name];
    if (!got) { fail(`${name}: no result`); continue; }
    if (want === "theme") {
      got.ok && got.name === "Final Fantasy"
        ? ok(`${name.padEnd(16)} imports (${got.css} bytes of CSS)`)
        : fail(`${name.padEnd(16)} should import, got ${got.ok ? '"' + got.name + '"' : "error: " + got.error}`);
    } else {
      !got.ok && got.error.includes(want)
        ? ok(`${name.padEnd(16)} rejected clearly: "${got.error}"`)
        : fail(`${name.padEnd(16)} should fail mentioning "${want}", got ` +
               (got.ok ? `a successful import of "${got.name}"` : `"${got.error}"`));
    }
  }
}

/* --------------------------------- 2. the extension zip is complete */

const tmp = await mkdtemp(join(tmpdir(), "yume-ziptest-"));
await run("unzip", ["-qq", EXT_ZIP, "-d", tmp]);
const base = join(tmp, "yume-forge-modified");

const listed = (await run("unzip", ["-Z1", EXT_ZIP])).stdout
  .split("\n").map((s) => s.trim()).filter(Boolean)
  .map((s) => s.replace(/^yume-forge-modified\//, ""))
  .filter((s) => !s.endsWith("/"));

const manifest = JSON.parse(await readFile(join(base, "manifest.json"), "utf8"));

// Every path the manifest names must be in the archive. This is the check that
// catches "added a theme, forgot to include it" — which renders as one theme
// silently doing nothing.
const refs = [
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
  manifest.action?.default_popup,
  manifest.options_ui?.page,
  ...(manifest.content_scripts?.[0]?.js || []),
  ...(manifest.content_scripts?.[0]?.css || []),
].filter(Boolean);

const missing = refs.filter((p) => !listed.includes(p));
missing.length
  ? fail(`manifest references ${missing.length} file(s) not in the zip:\n     ` + missing.join("\n     "))
  : ok(`all ${refs.length} manifest-referenced files are present`);

// Scripts the HTML pages pull in are not in the manifest, so check those too —
// lib/packer.js and lib/themezip.js only appear in popup.html.
const htmlRefs = new Set();
for (const p of ["popup/popup.html", "editor/editor.html"]) {
  if (!listed.includes(p)) continue;
  const html = await readFile(join(base, p), "utf8");
  for (const mm of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const target = mm[1];
    if (/^(https?:|data:|#)/.test(target)) continue;
    // Resolve relative to the page.
    const abs = resolve("/" + dirname(p), target).slice(1);
    htmlRefs.add(abs);
  }
}
const htmlMissing = [...htmlRefs].filter((p) => !listed.includes(p));
htmlMissing.length
  ? fail(`popup/editor reference ${htmlMissing.length} missing file(s): ` + htmlMissing.join(", "))
  : ok(`all ${htmlRefs.size} files referenced by popup/editor HTML are present`);

// Nothing that shouldn't ship.
const JUNK = [
  [/\.DS_Store$/, "Finder litter"],
  [/^__MACOSX\//, "macOS resource forks"],
  [/\.(env|pem|key|p12)$/i, "credentials"],
  [/^dist\//, "generated exports"],
  [/^(nav|gear|tray)-icons\.png$/, "multi-MB sprite source sheets"],
  [/\.(mov|mp3)$/i, "raw audio sources — only the converted wavs ship"],
  [/Battle Sprites\.png$|Mog\.png$/, "ripped game sprite sheets"],
  [/^tools\/\./, "scratch files from the test harnesses"],
  [/~$|\.(bak|orig|swp)$/, "editor backups"],
];
const junk = listed.flatMap((p) => JUNK.filter(([re]) => re.test(p)).map(([, why]) => `${p} (${why})`));
junk.length
  ? fail(`the extension zip contains ${junk.length} thing(s) it shouldn't:\n     ` + junk.join("\n     "))
  : ok(`no junk in the archive (${listed.length} files, checked against ${JUNK.length} patterns)`);

// Menu sounds: referenced from content.js via chrome.runtime.getURL and only
// covered by a manifest glob ("sounds/*"), so the reference check above cannot
// miss them for us. Absent files would fail silently at runtime — the loader
// catches fetch errors by design.
{
  const want = ["hover", "select", "fall-1", "fall-2", "fall-3", "chirp", "step", "jump"]
    .map((n) => `sounds/${n}.wav`);
  const missingSnd = want.filter((p) => !listed.includes(p));
  missingSnd.length
    ? fail("sound files missing from the zip: " + missingSnd.join(", "))
    : ok("both menu-sound files are present");
}

// Font URLs must stay extension-absolute: a relative url() in content-script
// CSS resolved against claude.ai once, fetched HTML as a font, and filled the
// error panel with OTS decode failures.
{
  const fontsCss = await readFile(join(base, "fonts/fonts.css"), "utf8");
  const naked = [...fontsCss.matchAll(/url\("([^"]+\.woff2)"\)/g)].map((m) => m[1])
    .filter((u) => !u.startsWith("chrome-extension://__MSG_@@extension_id__/"));
  naked.length
    ? fail("fonts.css has page-relative font URLs again: " + naked.join(", "))
    : ok("fonts.css URLs are extension-absolute");
}

// The zip has to unzip to a folder Chrome can load, not a pile of loose files.
listed.length && (await run("unzip", ["-Z1", EXT_ZIP])).stdout.startsWith("yume-forge-modified/")
  ? ok("archive contains a single top-level yume-forge-modified/ folder")
  : fail("archive is not wrapped in a single folder — Load unpacked needs one");

// Sanity: every stylesheet in themes/ is wired into SOME content script —
// claude.ai's entry carries the claude set, chatgpt.com's carries its own.
const themeCss = new Set((manifest.content_scripts || [])
  .flatMap((cs) => cs.css || [])
  .filter((p) => p.startsWith("themes/")));
const themeFiles = listed.filter((p) => /^themes\/.*\.css$/.test(p));
themeCss.size === themeFiles.length
  ? ok(`all ${themeFiles.length} theme stylesheets are wired into a content script`)
  : fail(`themes/ has ${themeFiles.length} stylesheets but the manifests wire ${themeCss.size}`);

// All three sites must be able to load the fonts and sprites those sheets use.
const war = (manifest.web_accessible_resources || [])[0] || {};
["https://claude.ai/*", "https://chatgpt.com/*", "https://gemini.google.com/*"]
  .every((m) => (war.matches || []).includes(m))
  ? ok("web_accessible_resources covers claude.ai, chatgpt.com and gemini.google.com")
  : fail("web_accessible_resources matches: " + JSON.stringify(war.matches) +
         " — fonts/sprites would 404 on the missing site");

// A stale archive is the failure this whole suite exists to catch and the one
// it could not see: every other check here reads the zip against ITSELF, so an
// old build is internally consistent and sails through. Publishing that zip
// ships a version nobody tested — which is exactly what nearly happened for
// the gemini release, where release/ still held the previous build.
const repoVersion = JSON.parse(await readFile(resolve(ROOT, "manifest.json"), "utf8")).version;
manifest.version === repoVersion
  ? ok(`zip manifest version matches the tree (${repoVersion})`)
  : fail(`zip is version ${manifest.version} but the tree is ${repoVersion} — ` +
         "rebuild: node tools/package.mjs --out ./release");

await rm(tmp, { recursive: true, force: true });

console.log(bad ? `\n${bad} check(s) failed` : "\npackaging clean — extension archive verified");
process.exit(bad ? 1 : 0);
