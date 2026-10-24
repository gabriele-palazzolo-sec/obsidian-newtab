// News sections: validation, ready-made packs and helpers.
// No DOM and no browser APIs, so this also runs in Node (tests/news-config.test.mjs).
(function (root) {
  const ICONS = ["shield", "chip", "globe"];
  const LIMITS = { sections: 6, feedsPerSection: 12, title: 40, source: 40, url: 500 };

  // Only https feeds: the content is fetched by the extension page.
  function cleanFeedUrl(input) {
    const text = String(input || "").trim();
    if (!text || text.length > LIMITS.url) return null;
    let u;
    try { u = new URL(/^[a-z][\w+.-]*:/i.test(text) ? text : `https://${text}`); } catch (e) { return null; }
    if (u.protocol !== "https:" || !u.hostname.includes(".") || u.username || u.password) return null;
    return u.href;
  }

  // Host permission pattern for a feed, e.g. "https://example.com/*".
  const originPattern = (url) => `${new URL(url).origin}/*`;

  // Turns any stored or configured value into a safe list of sections.
  // Unknown fields are dropped, text is trimmed and limited, bad URLs removed.
  function sanitizeSections(value) {
    if (!Array.isArray(value)) return [];
    const out = [];
    for (const s of value.slice(0, LIMITS.sections)) {
      if (!s || typeof s !== "object") continue;
      const title = String(s.title || "").trim().slice(0, LIMITS.title);
      const seen = new Set();
      const feeds = [];
      for (const f of Array.isArray(s.feeds) ? s.feeds : []) {
        const url = cleanFeedUrl(f && f.url);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        const feed = { source: String(f.source || new URL(url).hostname).trim().slice(0, LIMITS.source), url };
        if (f.category) feed.category = String(f.category).trim().slice(0, LIMITS.title);
        feeds.push(feed);
        if (feeds.length >= LIMITS.feedsPerSection) break;
      }
      if (!title) continue;
      out.push({ title, icon: ICONS.includes(s.icon) ? s.icon : "globe", feeds });
    }
    return out;
  }

  // All host permission patterns needed by a list of sections.
  function originsOf(sections) {
    const set = new Set();
    for (const s of sections) for (const f of s.feeds) set.add(originPattern(f.url));
    return [...set];
  }

  // Ready-made packs, added with one click from the news editor.
  const PACKS = [
    {
      id: "security", label: "Security news",
      section: { title: "Security", icon: "shield", feeds: [
        { source: "The Hacker News", url: "https://feeds.feedburner.com/TheHackersNews" },
        { source: "BleepingComputer", url: "https://www.bleepingcomputer.com/feed/" },
        { source: "Krebs on Security", url: "https://krebsonsecurity.com/feed/" },
        { source: "SecurityWeek", url: "https://www.securityweek.com/feed/" }
      ] }
    },
    {
      id: "advisories", label: "Vulnerability advisories",
      section: { title: "Advisories", icon: "shield", feeds: [
        { source: "CISA", url: "https://www.cisa.gov/cybersecurity-advisories/all.xml" },
        { source: "Help Net Security", url: "https://www.helpnetsecurity.com/feed/" }
      ] }
    },
    {
      id: "ai", label: "AI",
      section: { title: "AI", icon: "chip", feeds: [
        { source: "Hugging Face", url: "https://huggingface.co/blog/feed.xml" },
        { source: "OpenAI", url: "https://openai.com/news/rss.xml" },
        { source: "Google AI", url: "https://blog.google/technology/ai/rss/" }
      ] }
    },
    {
      id: "tech", label: "Tech",
      section: { title: "Tech", icon: "chip", feeds: [
        { source: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
        { source: "Hacker News", url: "https://hnrss.org/frontpage" },
        { source: "The Verge", url: "https://www.theverge.com/rss/index.xml" }
      ] }
    },
    {
      id: "world", label: "World news",
      section: { title: "World", icon: "globe", feeds: [
        { source: "BBC News", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
        { source: "The Guardian", url: "https://www.theguardian.com/world/rss" }
      ] }
    },
    {
      id: "italia", label: "Notizie in italiano",
      section: { title: "Italia", icon: "globe", feeds: [
        { source: "ANSA", url: "https://www.ansa.it/sito/ansait_rss.xml" },
        { source: "Il Post", url: "https://www.ilpost.it/feed/" }
      ] }
    }
  ];

  // A cache key that changes whenever the feeds change.
  const cacheKey = (sections) => JSON.stringify(sections.map((s) => s.feeds.map((f) => [f.url, f.category || ""])));

  const api = { ICONS, LIMITS, PACKS, cleanFeedUrl, originPattern, sanitizeSections, originsOf, cacheKey };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NewsConfig = api;
})(typeof window !== "undefined" ? window : globalThis);
