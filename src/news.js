// News: one column per section, each fed by its RSS/Atom feeds.
// CVE identifiers in titles are highlighted.
//
// Permissions: the extension is installed with no access to any website.
// The first time, it asks to read the feed sites listed in the configuration
// (optional_host_permissions); the request is shown by the browser and can be
// revoked at any time from the extension's details page.
(function () {
  const ICONS = { shield: UI.ICONS.shield, chip: UI.ICONS.chip, globe: UI.ICONS.globe };
  const EXPLOITED = /zero[- ]?day|0-day|actively exploited|in the wild/i;
  const CVE = /CVE-\d{4}-\d{4,7}/gi;

  let C, box;
  let sections = [];   // from the editor (saved in the browser) or from the configuration
  const lists = [];

  function ago(ts) {
    if (!ts) return "";
    const min = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if (min < 1) return "now";
    if (min < 60) return `${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h} h`;
    return `${Math.round(h / 24)} d`;
  }

  function layout() {
    box.replaceChildren();
    sections.forEach((section, i) => {
      const list = UI.el("div", { class: "news-list" }, UI.el("p", { class: "muted" }, "Loading…"));
      lists[i] = list;
      const id = `news-title-${i}`;
      const icon = UI.icon(ICONS[section.icon] || ICONS.globe, 18);
      icon.classList.add("accent-icon");
      box.append(UI.el("section", { class: "panel news-panel", "aria-labelledby": id },
        UI.el("div", { class: "panel-head" },
          UI.el("div", { class: "panel-title" }, icon, UI.el("h2", { id }, section.title))),
        UI.el("p", { class: "sources" }, section.feeds.map((f) => f.source).join(" · ")),
        list));
    });
  }

  function titleWithCve(title) {
    const span = UI.el("span", { class: "news-title" });
    let last = 0;
    for (const m of title.matchAll(CVE)) {
      span.append(title.slice(last, m.index), UI.el("code", { class: "cve" }, m[0].toUpperCase()));
      last = m.index + m[0].length;
    }
    span.append(title.slice(last));
    return span;
  }

  function renderSection(i, items) {
    const list = lists[i];
    list.replaceChildren();
    if (!items.length) {
      list.append(UI.el("p", { class: "notice" }, "Couldn't load these feeds. Check your connection or the feed addresses."));
      return;
    }
    for (const n of items) {
      if (!/^https?:\/\//i.test(n.link)) continue; // cached data is re-checked too
      list.append(UI.el("a", { class: "news-item", href: n.link, rel: "noopener noreferrer" },
        UI.el("span", { class: "news-meta" },
          UI.el("b", {}, n.source), n.ts ? ` · ${ago(n.ts)}` : "",
          EXPLOITED.test(n.title) ? UI.el("span", { class: "risk-label" }, "exploited") : null),
        titleWithCve(n.title)));
    }
  }

  // ── feed parsing ──
  // Text is extracted with an inert DOMParser document (no scripts run, nothing
  // is loaded) and only plain text and http(s) links are kept.
  function toText(s) {
    const d = new DOMParser().parseFromString(`<!doctype html><body>${s}`, "text/html");
    return (d.body.textContent || "").replace(/\s+/g, " ").trim().slice(0, 300);
  }

  function parseFeed(xmlText, feed) {
    const xml = new DOMParser().parseFromString(xmlText, "text/xml");
    let entries = [...xml.querySelectorAll("item, entry")];
    if (feed.category) {
      const cat = feed.category.toLowerCase();
      entries = entries.filter((v) => [...v.querySelectorAll("category")]
        .some((c) => (c.textContent || c.getAttribute("term") || "").trim().toLowerCase() === cat));
    }
    return entries.map((v) => {
      const text = (sel) => v.querySelector(sel)?.textContent?.trim() || "";
      const linkEl = [...v.querySelectorAll("link")].find((l) => !l.getAttribute("rel") || l.getAttribute("rel") === "alternate") || v.querySelector("link");
      const link = (linkEl?.getAttribute("href") || linkEl?.textContent || "").trim();
      const date = text("pubDate") || text("published") || text("updated") || text("date");
      return { source: feed.source, title: toText(text("title")), link, ts: Date.parse(date) || 0 };
    }).filter((n) => n.title && /^https?:\/\//i.test(n.link));
  }

  async function readFeed(feed) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    try {
      const r = await fetch(feed.url, { signal: ctrl.signal, cache: "no-store", credentials: "omit" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return parseFeed(await r.text(), feed);
    } catch (e) {
      console.warn(`[news] ${feed.source}: feed unavailable (${e.message || e})`);
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  function pick(all) {
    all.sort((a, b) => b.ts - a.ts);
    const seen = new Set(), perSource = new Map(), out = [];
    for (const n of all) {
      const key = n.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      if (seen.has(n.link) || seen.has(key)) continue;
      const c = perSource.get(n.source) || 0;
      if (c >= C.newsMaxPerSource) continue;
      seen.add(n.link); seen.add(key);
      perSource.set(n.source, c + 1);
      out.push(n);
      if (out.length >= C.newsPerSection) break;
    }
    return out;
  }

  async function download() {
    return Promise.all(sections.map(async (section) =>
      pick((await Promise.all(section.feeds.map(readFeed))).flat())));
  }

  // ── permissions ──
  function feedOrigins() {
    const origins = new Set();
    for (const s of sections) for (const f of s.feeds) {
      try {
        const u = new URL(f.url);
        if (u.protocol === "https:") origins.add(`${u.origin}/*`);
      } catch (e) {}
    }
    return [...origins];
  }

  async function missingOrigins() {
    if (!App.inExtension || !chrome.permissions) return [];
    const missing = [];
    for (const o of feedOrigins()) {
      if (!(await chrome.permissions.contains({ origins: [o] }))) missing.push(o);
    }
    return missing;
  }

  function askPermission(missing) {
    const hosts = missing.map((o) => o.replace(/^https:\/\//, "").replace(/\/\*$/, ""));
    const button = UI.el("button", { class: "btn btn-solid", type: "button" }, UI.icon(UI.ICONS.lock, 16), "Allow access");
    const panel = UI.el("section", { class: "panel permission-panel" },
      UI.el("div", { class: "panel-title" }, UI.el("h2", {}, "News needs your permission")),
      UI.el("p", { class: "notice" },
        `To show the news, the extension needs to read the feeds on ${hosts.length} site${hosts.length > 1 ? "s" : ""}. ` +
        "It only downloads the feeds listed in the configuration, without cookies, and you can revoke access at any time from the extension's details."),
      UI.el("p", { class: "hosts" }, hosts.join(" · ")),
      button);
    button.addEventListener("click", async () => {
      // must be called directly from the click (user gesture)
      const ok = await chrome.permissions.request({ origins: missing });
      if (ok) start();
    });
    box.replaceChildren(panel);
  }

  // ── demo data (?demo=1) ──
  function demo() {
    const now = Date.now();
    const t = (source, min, title) => ({ source, title, link: "https://example.com", ts: now - min * 60000 });
    return [
      [t("The Hacker News", 8, "Example: critical flaw CVE-2026-12345 actively exploited in VPN appliances"),
       t("BleepingComputer", 40, "Example: data breach exposes millions of user accounts"),
       t("SecurityWeek", 95, "Example: new ransomware campaign targets manufacturing companies")],
      [t("Help Net Security", 20, "Example: new release of an open-source vulnerability scanner"),
       t("Hugging Face", 300, "Example: an open model for source code classification")],
      [t("BBC News", 15, "Example: international summit on climate opens today"),
       t("BBC News", 70, "Example: elections in a European country, what to know")]
    ];
  }

  function emptyState() {
    const button = UI.el("button", { class: "btn", type: "button" }, "Customize news");
    button.addEventListener("click", () => window.NewsEditor?.open());
    box.replaceChildren(UI.el("section", { class: "panel permission-panel" },
      UI.el("div", { class: "panel-title" }, UI.el("h2", {}, "No news sections")),
      UI.el("p", { class: "notice" }, "Add a section or a ready-made pack to see news here."),
      button));
  }

  // Each run gets a number: a newer run (e.g. after saving in the editor)
  // makes older downloads stop rendering.
  let run = 0;
  async function start() {
    const me = ++run;
    if (!sections.length) { emptyState(); return; }
    layout();
    if (App.demo) { demo().forEach((items, i) => lists[i] && renderSection(i, items)); return; }

    const missing = await missingOrigins();
    if (me !== run) return;
    if (missing.length) { askPermission(missing); return; }

    const key = NewsConfig.cacheKey(sections);
    const cache = await Store.get("newsSections");
    const valid = cache && cache.key === key && Array.isArray(cache.sections) && cache.sections.length === sections.length;
    if (valid) cache.sections.forEach((items, i) => renderSection(i, items));
    if (!valid || Date.now() - cache.ts > C.newsCacheMinutes * 60000) {
      const fresh = await download();
      if (me !== run) return;
      const merged = fresh.map((s, i) => (s.length ? s : (valid ? cache.sections[i] : [])));
      merged.forEach((items, i) => renderSection(i, items));
      if (fresh.some((s) => s.length)) await Store.set("newsSections", { key, ts: Date.now(), sections: merged });
    }
  }

  // ── sections chosen in the editor ──
  const defaults = () => NewsConfig.sanitizeSections(C.news);

  async function loadSections() {
    const saved = App.demo ? undefined : await Store.get("newsConfig");
    sections = Array.isArray(saved) ? NewsConfig.sanitizeSections(saved) : defaults();
  }

  // After a change, give back the permissions of sites no longer used by any feed.
  async function releaseUnusedPermissions() {
    if (!App.inExtension || !chrome.permissions) return;
    try {
      const keep = new Set(NewsConfig.originsOf(sections));
      const { origins = [] } = await chrome.permissions.getAll();
      const unused = origins.filter((o) => !keep.has(o));
      if (unused.length) await chrome.permissions.remove({ origins: unused });
    } catch (e) {
      console.warn("[news] could not release permissions", e);
    }
  }

  async function apply(next) {
    sections = next;
    await Store.remove("newsSections");
    await releaseUnusedPermissions();
    start();
  }

  // Downloads a feed once to check that it really is RSS/Atom, and reads its title.
  async function probe(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    try {
      const r = await fetch(url, { signal: ctrl.signal, cache: "no-store", credentials: "omit" });
      if (!r.ok) throw new Error(`the site answered with HTTP ${r.status}`);
      const xml = new DOMParser().parseFromString(await r.text(), "text/xml");
      const rootName = xml.documentElement?.nodeName.toLowerCase();
      if (xml.querySelector("parsererror") || !["rss", "feed", "rdf:rdf"].includes(rootName)) {
        throw new Error("this address is not an RSS or Atom feed");
      }
      const title = toText(xml.querySelector("channel > title, feed > title")?.textContent || "").slice(0, NewsConfig.LIMITS.source);
      return { title, items: xml.querySelectorAll("item, entry").length };
    } catch (e) {
      if (e.name === "AbortError") throw new Error("the site did not answer in time");
      if (e instanceof TypeError) throw new Error("the feed could not be downloaded");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  window.News = {
    async init() {
      C = App.config;
      box = document.getElementById("news");
      await loadSections();
      start();
    },
    get sections() { return sections.map((s) => ({ ...s, feeds: s.feeds.map((f) => ({ ...f })) })); },
    get defaults() { return defaults(); },
    get customized() { return Store.get("newsConfig").then(Array.isArray); },
    async save(next) {
      const clean = NewsConfig.sanitizeSections(next);
      await Store.set("newsConfig", clean);
      await apply(clean);
    },
    async reset() {
      await Store.remove("newsConfig");
      await apply(defaults());
    },
    releaseUnusedPermissions,
    probe,
    parseFeed
  };
})();
