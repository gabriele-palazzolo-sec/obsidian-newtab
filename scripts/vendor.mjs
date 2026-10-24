// Copies third-party files from node_modules into lib/ and fonts/,
// then writes lib/CHECKSUMS.sha256 so the vendored copies can be verified.
//
//   npm ci && npm run vendor
//
// The extension itself has no build step: lib/ and fonts/ are committed,
// and this script is the only way they are meant to change.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nm = (p) => join(root, "node_modules", p);

export const SCRIPTS = [
  "d3-dispatch/dist/d3-dispatch.min.js",
  "d3-quadtree/dist/d3-quadtree.min.js",
  "d3-timer/dist/d3-timer.min.js",
  "d3-force/dist/d3-force.min.js",
  "marked/lib/marked.umd.js",
  "dompurify/dist/purify.min.js"
];

export const FONTS = [
  "@fontsource/inter/files/inter-latin-400-normal.woff2",
  "@fontsource/inter/files/inter-latin-500-normal.woff2",
  "@fontsource/inter/files/inter-latin-600-normal.woff2",
  "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2",
  "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2",
  "@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2"
];

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// Source map comments point to files we do not ship.
const stripSourceMap = (text) => text.replace(/\n\/\/# sourceMappingURL=\S+\s*$/, "\n");

export function vendoredFiles() {
  const out = [];
  for (const p of SCRIPTS) {
    out.push({ dest: `lib/${basename(p)}`, data: Buffer.from(stripSourceMap(readFileSync(nm(p), "utf8"))) });
  }
  for (const p of FONTS) {
    out.push({ dest: `fonts/${basename(p)}`, data: readFileSync(nm(p)) });
  }
  return out;
}

export function checksums(files) {
  return files.map((f) => `${sha256(f.data)}  ${f.dest}`).join("\n") + "\n";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = vendoredFiles();
  for (const f of files) {
    mkdirSync(join(root, dirname(f.dest)), { recursive: true });
    writeFileSync(join(root, f.dest), f.data);
  }
  writeFileSync(join(root, "lib/CHECKSUMS.sha256"), checksums(files));
  console.log(`Vendored ${files.length} files.`);
}
