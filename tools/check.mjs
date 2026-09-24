// Yume Forge — run everything.
//
//   node tools/check.mjs
//
// One entry point, because the failures this repo actually shipped were all
// "forgot to run the one test that would have caught it":
//
//   test.mjs        colour maths and theme objects — pure, fast
//   smoke.mjs       executes content.js against a stand-in DOM (node --check
//                   cannot see a function deleted out from under its callers)
//   glyph-test.mjs  asserts the working-glyph rules PARSED, since an invalid
//                   selector is dropped silently and looks exactly like a bug
//   wide-test.mjs   lays out wide tables on chatgpt- and claude-shaped pages
//                   and asserts the reply window grows to fit, never spills
//   pack-test.mjs   renders bundled vs exported-and-reimported and diffs the
//                   computed styles
//   popup-test.mjs  drives the real popup through import -> export
//   zip-test.mjs    reads the actual extension archive, plus internal theme
//                   import fixtures made by other tools and broken on purpose

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SUITES = [
  ["engine", "tools/test.mjs"],
  ["smoke", "tools/smoke.mjs"],
  ["glyph", "tools/glyph-test.mjs"],
  ["wide", "tools/wide-test.mjs"],
  ["package", "tools/pack-test.mjs"],
  // Drives the real popup: import a packaged theme, export it again, check
  // what would have been downloaded. Needs a packed theme to feed it.
  ["popup", "tools/popup-test.mjs", () => existsSync(resolve(ROOT, "dist/final-fantasy.yume.json"))],
  // Needs the built extension archive and the dist/ package used to create
  // internal theme-import fixtures.
  // Guarding on the zip alone was exactly backwards: whoever was handed
  // yume-forge-modified.zip satisfies that check by construction and is precisely the
  // person without dist/, so the suite ran and died on an unhandled ENOENT.
  ["zips", "tools/zip-test.mjs", () =>
    existsSync(resolve(ROOT, "release", "yume-forge-modified.zip")) &&
    existsSync(resolve(ROOT, "dist/final-fantasy.yume.json"))],
];

let failed = 0;
for (const [name, script, when] of SUITES) {
  if (when && !when()) {
    console.log(`── ${name} ${"─".repeat(Math.max(0, 40 - name.length))}\nskipped — run: node tools/pack-theme.mjs final-fantasy && node tools/package.mjs\n`);
    continue;
  }
  process.stdout.write(`── ${name} ${"─".repeat(Math.max(0, 40 - name.length))}\n`);
  try {
    const { stdout } = await run(process.execPath, [resolve(ROOT, script)], {
      cwd: ROOT,
      maxBuffer: 200 * 1024 * 1024,
    });
    console.log(stdout.trim());
  } catch (err) {
    failed++;
    // execFile rejects on a non-zero exit; the suite's own output is the
    // useful part, so print it rather than the wrapper's stack.
    console.log((err.stdout || "").trim() || err.message);
    console.log(`\n^^ ${name} FAILED`);
  }
  console.log("");
}

console.log(failed ? `${failed} suite(s) failed` : "all suites passed");
process.exit(failed ? 1 : 0);
