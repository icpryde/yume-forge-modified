// Yume Forge Modified — build the shareable extension zip.
//
//   node tools/package.mjs [--out ~/Downloads]
//
// Produces:
//
//   yume-forge-modified.zip      ready to unzip and Load unpacked
//
// The extension list is an explicit ALLOWLIST. A denylist ("everything except
// *.png") silently ships whatever new junk lands in the tree next — an editor
// backup, a .env, a screenshot — and the failure mode is that you find out
// after handing the file to someone.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, rm, cp, stat } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p) => resolve(ROOT, p);

const argOut = process.argv.indexOf("--out");
const OUT = argOut > 0 && process.argv[argOut + 1]
  ? resolve(process.argv[argOut + 1].replace(/^~/, homedir()))
  : join(homedir(), "Downloads");

/* ----------------------------------------------------------- extension */

// Everything the extension needs at runtime, plus the dev tooling and README
// so this is a working copy rather than a black box.
//
// Excluded on purpose:
//   sources/ — the original sprite sheets and audio (build inputs for
//     tools/rip-*.py and convert-sounds.sh only; the generated CSS carries the
//     art as data URIs and merely cites the sources in comments).
//   sprites/*.png, *.svg — debug dumps from the same rippers. Nothing loads
//     them; grep for them in the CSS and you get comments.
//   dist/ — generated theme exports used by tests and the popup workflow.
//   .DS_Store — Finder litter, and it lands in every folder if you let it.
const INCLUDE = [
  "manifest.json",
  "content.js",
  "README.md",
  "CHANGELOG.md",
  "lib/theme-engine.js",
  "lib/packer.js",
  "lib/themezip.js",
  "popup/",
  "editor/",
  "themes/",
  "fonts/",
  "icons/",
  "sprites/*.css",
  "sounds/",
  "tools/",
];

// Within the copied dirs, drop these. Kept narrow and explicit.
const PRUNE = [
  "tools/.glyph.html", "tools/.pack-a.html", "tools/.pack-b.html", "tools/.b64check.html",
];

const NAME = "yume-forge-modified";

async function sh(cmd, args, cwd) {
  const { stdout } = await run(cmd, args, { cwd, maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

async function buildExtensionZip() {
  const stage = join(await mkTemp(), NAME);
  await mkdir(stage, { recursive: true });

  for (const item of INCLUDE) {
    if (item.includes("*")) {
      // Only pattern in use is a per-dir extension filter.
      const [dir, pat] = [dirname(item), item.split("/").pop()];
      const ext = pat.replace("*", "");
      const names = (await sh("ls", [rel(dir)])).split("\n").filter((n) => n.endsWith(ext));
      await mkdir(join(stage, dir), { recursive: true });
      for (const n of names) await cp(rel(join(dir, n)), join(stage, dir, n));
    } else if (item.endsWith("/")) {
      await cp(rel(item), join(stage, item), { recursive: true });
    } else {
      await mkdir(join(stage, dirname(item)), { recursive: true });
      await cp(rel(item), join(stage, item));
    }
  }

  for (const p of PRUNE) await rm(join(stage, p), { force: true });
  // Finder litter copies along with the directories it lives in — and so do
  // the test harnesses' scratch pages (tools/.*.html and friends). Prune every
  // dotfile: nothing legitimate in this tree hides behind a dot.
  // Tree-wide, not just tools/: the comment always claimed every dotfile, and
  // a stray editor swap file or .env outside tools/ would otherwise ship.
  // This subsumes the .DS_Store sweep.
  await sh("find", [stage, "-name", ".*", "-type", "f", "-delete"]);

  const out = join(OUT, `${NAME}.zip`);
  await rm(out, { force: true });
  // -r recurse, -q quiet, -X drop macOS extended attributes so the archive has
  // no __MACOSX/ shadow entries.
  await sh("zip", ["-rqX", out, NAME], dirname(stage));
  return { out, stage };
}

let tmpN = 0;
async function mkTemp() {
  // No Math.random(): a counter is enough and keeps runs reproducible.
  const dir = join(tmpdir(), `yume-pkg-${process.pid}-${tmpN++}`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  return dir;
}

/* ------------------------------------------------------------------ go */

await mkdir(OUT, { recursive: true });

const ext = await buildExtensionZip();

for (const { out } of [ext]) {
  const s = await stat(out);
  const n = (await sh("unzip", ["-l", out])).trim().split("\n").pop().trim().split(/\s+/)[1];
  console.log(`${(s.size / 1024).toFixed(0).padStart(5)}KB  ${String(n).padStart(3)} files  ${out}`);
}
