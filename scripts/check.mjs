// Integrity checks run in CI:
//  1. every file in lib/ and fonts/ is byte-identical to the pinned npm package
//     (no hand-edited or tampered third-party code), and CHECKSUMS.sha256 is current;
//  2. the manifest keeps its least-privilege shape;
//  3. no personal configuration file is committed.
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { vendoredFiles, checksums } from "./vendor.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

// 1. vendored files
const files = vendoredFiles();
for (const f of files) {
  const p = join(root, f.dest);
  if (!existsSync(p)) { errors.push(`${f.dest} is missing (run npm run vendor)`); continue; }
  if (!readFileSync(p).equals(f.data)) errors.push(`${f.dest} differs from the pinned npm package`);
}
const sums = join(root, "lib/CHECKSUMS.sha256");
if (!existsSync(sums) || readFileSync(sums, "utf8") !== checksums(files)) {
  errors.push("lib/CHECKSUMS.sha256 is out of date (run npm run vendor)");
}

// 2. manifest
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const allowedPermissions = ["storage", "unlimitedStorage", "favicon"];
for (const p of manifest.permissions || []) {
  if (!allowedPermissions.includes(p)) errors.push(`unexpected permission in manifest.json: ${p}`);
}
if ((manifest.host_permissions || []).length) {
  errors.push("host_permissions must stay empty: feed sites are requested at runtime (optional_host_permissions)");
}
const csp = manifest.content_security_policy?.extension_pages || "";
if (!/script-src 'self'(;|$)/.test(csp)) errors.push("extension_pages CSP must keep script-src 'self' only");

// 3. personal files
let tracked = "";
try { tracked = execSync("git ls-files", { cwd: root, encoding: "utf8" }); } catch {}
for (const f of tracked.split("\n")) {
  if (/(^|\/)config\.local\.json$/.test(f) || /(^|\/)\.env/.test(f)) errors.push(`personal file is tracked by git: ${f}`);
}

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join("\n"));
  process.exit(1);
}
console.log(`✓ ${files.length} vendored files verified, manifest and repository checks passed.`);
