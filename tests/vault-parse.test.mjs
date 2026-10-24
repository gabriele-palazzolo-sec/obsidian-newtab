import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const P = require("../src/vault-parse.js");

test("frontmatter is separated from the body", () => {
  const { yaml, body } = P.frontmatter("---\ntags: [a, b]\n---\n# Title\n");
  assert.equal(yaml, "tags: [a, b]");
  assert.equal(body, "# Title\n");
  assert.deepEqual(P.frontmatter("no yaml"), { yaml: "", body: "no yaml" });
});

test("tags are read from inline and list frontmatter", () => {
  assert.deepEqual(P.tagsFromYaml("tags: [one, \"#two\"]"), ["one", "two"]);
  assert.deepEqual(P.tagsFromYaml("tags:\n  - alpha\n  - beta\ntitle: x"), ["alpha", "beta"]);
  assert.deepEqual(P.tagsFromYaml("title: x"), []);
});

test("links and tags are found, code blocks are ignored", () => {
  const text = [
    "See [[Note A]], [[folder/Note B|alias]], [[Note C#Heading]] and [md](Note%20D.md).",
    "![[image.png]] is an attachment, ![[Embedded note]] is a note.",
    "#tag-one and #nested/tag but not #123 or a#b",
    "```",
    "[[Inside code]] #notatag",
    "```",
    "`[[inline code]]`"
  ].join("\n");
  const { targets, tags } = P.analyze(text);
  assert.deepEqual(targets, ["Note A", "folder/Note B", "Note C", "Embedded note", "Note%20D.md"]);
  assert.deepEqual(tags.sort(), ["nested/tag", "tag-one"]);
});

test("names resolve like Obsidian: path, relative path, then file name", () => {
  const maps = P.buildMaps(["Home.md", "Projects/Lab.md", "Archive/Lab.md", "Projects/Sub/Plan.md"]);
  assert.equal(P.resolveNote(maps, "Home", "Projects/Lab.md"), "Home.md");
  assert.equal(P.resolveNote(maps, "Archive/Lab", "Home.md"), "Archive/Lab.md");
  assert.equal(P.resolveNote(maps, "Sub/Plan", "Projects/Lab.md"), "Projects/Sub/Plan.md");
  assert.equal(P.resolveNote(maps, "../Home", "Projects/Lab.md"), "Home.md");
  assert.equal(P.resolveNote(maps, "plan", "Home.md"), "Projects/Sub/Plan.md");
  assert.equal(P.resolveNote(maps, "Missing", "Home.md"), null);
});

test("the shortest path wins when two notes share a name", () => {
  const maps = P.buildMaps(["a/b/Same.md", "x/Same.md"]);
  assert.equal(P.resolveNote(maps, "Same", "Other.md"), "x/Same.md");
});

test("the index keeps links, unresolved names and no note text", () => {
  const { index } = P.buildIndex("Vault", [
    { path: "A.md", mtime: 1, text: "[[B]] [[Ghost]] [[A]] [[pic.png]]" },
    { path: "B.md", mtime: 2, text: "#topic" }
  ]);
  assert.deepEqual(index.notes[0].links, ["B.md"]);
  assert.deepEqual(index.notes[0].unresolved, ["Ghost"]);
  assert.deepEqual(index.notes[1].tags, ["topic"]);
  assert.ok(!JSON.stringify(index).includes("[[B]]"), "note text must not be stored in the index");
});

test("path normalisation handles . and ..", () => {
  assert.equal(P.normalizePath("a/./b/../c"), "a/c");
  assert.equal(P.normalizePath("../a"), "a");
});
