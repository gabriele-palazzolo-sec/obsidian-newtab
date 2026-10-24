// Shared helpers: storage, DOM helpers, configuration and user settings.
(function () {
  const inExtension = typeof chrome !== "undefined" && !!chrome.runtime?.id;
  const hasChromeStorage = inExtension && !!chrome.storage?.local;

  // ── storage: chrome.storage.local in the extension, localStorage in a plain preview ──
  async function get(key) {
    try {
      if (hasChromeStorage) return (await chrome.storage.local.get(key))[key];
      const v = localStorage.getItem(key);
      return v == null ? undefined : JSON.parse(v);
    } catch (e) {
      return undefined;
    }
  }

  async function set(key, value) {
    try {
      if (hasChromeStorage) return await chrome.storage.local.set({ [key]: value });
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* storage full or blocked: ignored */ }
  }

  async function remove(key) {
    try {
      if (hasChromeStorage) return await chrome.storage.local.remove(key);
      localStorage.removeItem(key);
    } catch (e) {}
  }

  // IndexedDB is only used to remember the vault folder:
  // a file system handle cannot be stored anywhere else.
  function db() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("obsidian-newtab", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGet(key) {
    try {
      const d = await db();
      return await new Promise((resolve, reject) => {
        const r = d.transaction("kv").objectStore("kv").get(key);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    } catch (e) { return undefined; }
  }
  async function idbSet(key, value) {
    try {
      const d = await db();
      await new Promise((resolve, reject) => {
        const t = d.transaction("kv", "readwrite");
        t.objectStore("kv").put(value, key);
        t.oncomplete = resolve;
        t.onerror = () => reject(t.error);
      });
    } catch (e) {}
  }

  // ── DOM helpers: elements are always built with text nodes, never from HTML strings ──
  function el(tag, attrs, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c != null) n.append(c.nodeType ? c : String(c));
    return n;
  }

  // Icons: builds an SVG from a list of [tag, attributes] pairs (no innerHTML).
  const SVG_NS = "http://www.w3.org/2000/svg";
  function icon(shapes, size = 16) {
    const s = document.createElementNS(SVG_NS, "svg");
    s.setAttribute("width", size);
    s.setAttribute("height", size);
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("aria-hidden", "true");
    for (const [tag, attrs] of shapes) {
      const shape = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) shape.setAttribute(k, v);
      s.append(shape);
    }
    return s;
  }
  const path = (d) => ["path", { d }];
  const ICONS = {
    close: [path("M18 6 6 18M6 6l12 12")],
    plus: [path("M12 5v14M5 12h14")],
    shield: [path("M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"), path("M12 8v5M12 16h.01")],
    chip: [["rect", { x: 6, y: 6, width: 12, height: 12, rx: 2 }], path("M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"), path("M10 10h4v4h-4z")],
    globe: [["circle", { cx: 12, cy: 12, r: 9 }], path("M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z")],
    lock: [["rect", { x: 5, y: 11, width: 14, height: 10, rx: 2 }], path("M8 11V7a4 4 0 0 1 8 0v4")]
  };

  // ── configuration: defaults (config.js) + optional config.local.json ──
  const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);
  function merge(base, over) {
    if (!isObject(base) || !isObject(over)) return over === undefined ? base : over;
    const out = { ...base };
    for (const [k, v] of Object.entries(over)) {
      if (v === null) delete out[k];          // null removes a default entry
      else out[k] = merge(base[k], v);
    }
    return out;
  }

  async function loadLocalConfig() {
    try {
      const r = await fetch("config.local.json", { cache: "no-store" });
      if (!r.ok) return {};
      const data = await r.json();
      return isObject(data) ? data : {};
    } catch (e) {
      return {}; // the file is optional
    }
  }

  // ── user settings made on the page (name, accent colour) ──
  const HEX = /^#[0-9a-f]{6}$/i;
  function cleanSettings(s) {
    const out = {};
    if (s && typeof s.name === "string") out.name = s.name.trim().slice(0, 40);
    if (s && typeof s.accent === "string" && HEX.test(s.accent)) out.accent = s.accent;
    return out;
  }

  const App = {
    config: null,
    settings: {},
    inExtension,
    demo: new URLSearchParams(location.search).has("demo"),

    async init() {
      // Demo mode (?demo=1) ignores personal configuration and settings,
      // so screenshots never contain personal data.
      if (App.demo) {
        App.config = merge(window.DEFAULT_CONFIG, { name: "Ada", label: "Demo" });
        App.settings = {};
      } else {
        App.config = merge(window.DEFAULT_CONFIG, await loadLocalConfig());
        App.settings = cleanSettings(await get("settings"));
      }
      App.applyAccent();
    },

    get name() { return App.settings.name ?? App.config.name ?? ""; },
    get accent() {
      const a = App.settings.accent || App.config.accent;
      return HEX.test(a || "") ? a : "#A78BFA";
    },

    applyAccent() {
      document.documentElement.style.setProperty("--accent", App.accent);
    },

    async saveSettings(changes) {
      App.settings = cleanSettings({ ...App.settings, ...changes });
      await set("settings", App.settings);
      App.applyAccent();
      document.dispatchEvent(new CustomEvent("settings-changed"));
    },

    async resetSettings() {
      App.settings = {};
      await remove("settings");
      App.applyAccent();
      document.dispatchEvent(new CustomEvent("settings-changed"));
    },

    merge
  };

  window.Store = { get, set, remove, idbGet, idbSet };
  window.UI = { el, icon, ICONS };
  window.App = App;
})();
