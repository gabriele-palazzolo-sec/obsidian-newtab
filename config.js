// ─────────────────────────────────────────────────────────────────────────────
//  Default configuration.
//
//  Don't put personal data here. To customise the page, either:
//    • use the settings menu (⚙) on the page for your name and accent colour;
//    • or create config.local.json next to this file (it is git-ignored) and
//      override only what you need, e.g. { "bookmarks": [...], "news": [...] }.
//      Objects are merged key by key; arrays replace the default array.
//      See config.local.example.json.
//
//  After editing a file, reload the extension from edge://extensions
//  or chrome://extensions.
// ─────────────────────────────────────────────────────────────────────────────

window.DEFAULT_CONFIG = {
  // Shown in the greeting. Usually set from the settings menu instead.
  name: "",

  // Small label in the top-left corner (useful with several browser profiles).
  label: "New tab",

  // Accent colour. Also editable from the settings menu.
  accent: "#A78BFA",

  // Locale for the date, e.g. "en-GB", "it-IT". Empty = browser language.
  locale: "",

  // Starting bookmarks. Bookmarks added or removed on the page are saved in
  // the browser and take precedence. Keys 1–9 open the matching bookmark.
  bookmarks: [
    { name: "GitHub",    description: "Code",          url: "https://github.com" },
    { name: "Wikipedia", description: "Encyclopedia",  url: "https://en.wikipedia.org" },
    { name: "NVD",       description: "Vulnerabilities", url: "https://nvd.nist.gov" },
    { name: "MDN",       description: "Web docs",      url: "https://developer.mozilla.org" }
  ],

  // Search prefixes: type "gh openssl" to search GitHub.
  // {q} is replaced by the query, {vault} by the Obsidian vault name.
  search: {
    default: "https://duckduckgo.com/?q={q}",
    prefixes: {
      gh:  { name: "GitHub",    url: "https://github.com/search?q={q}" },
      w:   { name: "Wikipedia", url: "https://en.wikipedia.org/w/index.php?search={q}" },
      cve: { name: "NVD",       url: "https://nvd.nist.gov/vuln/search/results?query={q}" },
      mdn: { name: "MDN",       url: "https://developer.mozilla.org/en-US/search?q={q}" },
      o:   { name: "Notes",     url: "obsidian://search?vault={vault}&query={q}" }
    }
  },

  // News: one column per section, each fed by RSS/Atom feeds.
  // The extension asks for permission to read each feed's site the first time
  // (nothing is granted at install time). "category" (optional) keeps only the
  // items with that category in the feed.
  // Icons: "shield", "chip", "globe".
  news: [
    {
      title: "Vulnerabilities & attacks",
      icon: "shield",
      feeds: [
        { source: "The Hacker News",  url: "https://feeds.feedburner.com/TheHackersNews" },
        { source: "BleepingComputer", url: "https://www.bleepingcomputer.com/feed/" },
        { source: "SecurityWeek",     url: "https://www.securityweek.com/feed/" }
      ]
    },
    {
      title: "Security tools & AI",
      icon: "chip",
      feeds: [
        { source: "Help Net Security", url: "https://www.helpnetsecurity.com/feed/" },
        { source: "Hugging Face",      url: "https://huggingface.co/blog/feed.xml" }
      ]
    },
    {
      title: "World",
      icon: "globe",
      feeds: [
        { source: "BBC News", url: "https://feeds.bbci.co.uk/news/world/rss.xml" }
      ]
    }
  ],
  newsPerSection: 8,      // items shown in each section
  newsMaxPerSource: 3,    // so that one very active source doesn't hide the others
  newsCacheMinutes: 15,   // how often feeds are downloaded again

  // Obsidian graph
  graph: {
    maxNodes: 500,        // above this, only the most connected notes are shown
    cacheMinutes: 10,     // how often the vault is read again
    excludedFolders: [".obsidian", ".trash", ".git", "node_modules"],
    recentNotes: 4
  },

  // Note reader
  reader: {
    // Images hosted on the internet (https://…) inside notes are blocked by
    // default: loading them would tell those servers when you read the note.
    loadRemoteImages: false
  }
};
