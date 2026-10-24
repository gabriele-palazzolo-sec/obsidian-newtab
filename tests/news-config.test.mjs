import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const N = require("../src/news-config.js");

test("only https feed URLs are accepted", () => {
  assert.equal(N.cleanFeedUrl("https://example.com/feed"), "https://example.com/feed");
  assert.equal(N.cleanFeedUrl("example.com/rss.xml"), "https://example.com/rss.xml");
  assert.equal(N.cleanFeedUrl("http://example.com/feed"), null);
  assert.equal(N.cleanFeedUrl("javascript:alert(1)"), null);
  assert.equal(N.cleanFeedUrl("file:///etc/passwd"), null);
  assert.equal(N.cleanFeedUrl("https://user:pass@example.com/feed"), null);
  assert.equal(N.cleanFeedUrl("https://localhost/feed"), null);
  assert.equal(N.cleanFeedUrl(""), null);
});

test("sections are sanitised: bad URLs, duplicates, unknown icons and fields", () => {
  const out = N.sanitizeSections([
    { title: "  Security  ", icon: "shield", extra: "<script>", feeds: [
      { source: "A", url: "https://a.example/feed" },
      { source: "A again", url: "https://a.example/feed" },
      { source: "Bad", url: "javascript:alert(1)" },
      { url: "https://b.example/rss" }
    ] },
    { title: "", feeds: [] },
    { title: "World", icon: "skull", feeds: "not an array" },
    null
  ]);
  assert.deepEqual(out, [
    { title: "Security", icon: "shield", feeds: [
      { source: "A", url: "https://a.example/feed" },
      { source: "b.example", url: "https://b.example/rss" }
    ] },
    { title: "World", icon: "globe", feeds: [] }
  ]);
});

test("limits are enforced", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ title: `S${i}`, feeds: Array.from({ length: 30 }, (_, j) => ({ url: `https://f${j}.example/rss` })) }));
  const out = N.sanitizeSections(many);
  assert.equal(out.length, N.LIMITS.sections);
  assert.equal(out[0].feeds.length, N.LIMITS.feedsPerSection);
  assert.equal(N.sanitizeSections([{ title: "x".repeat(200), feeds: [] }])[0].title.length, N.LIMITS.title);
  assert.deepEqual(N.sanitizeSections("nope"), []);
});

test("permissions are requested per origin", () => {
  const sections = N.sanitizeSections([
    { title: "A", feeds: [{ url: "https://a.example/one" }, { url: "https://a.example/two" }] },
    { title: "B", feeds: [{ url: "https://b.example:8443/rss" }] }
  ]);
  assert.deepEqual(N.originsOf(sections), ["https://a.example/*", "https://b.example:8443/*"]);
});

test("ready-made packs are valid and survive sanitisation unchanged", () => {
  for (const pack of N.PACKS) {
    const [clean] = N.sanitizeSections([pack.section]);
    assert.deepEqual(clean, pack.section, pack.id);
  }
});

test("the cache key changes when feeds change", () => {
  const a = N.sanitizeSections([{ title: "A", feeds: [{ url: "https://a.example/rss" }] }]);
  const b = N.sanitizeSections([{ title: "Renamed", feeds: [{ url: "https://a.example/rss" }] }]);
  const c = N.sanitizeSections([{ title: "A", feeds: [{ url: "https://c.example/rss" }] }]);
  assert.equal(N.cacheKey(a), N.cacheKey(b));
  assert.notEqual(N.cacheKey(a), N.cacheKey(c));
});
