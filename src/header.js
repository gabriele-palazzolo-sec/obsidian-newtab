// Clock, greeting, settings menu and search bar with prefixes.
(function () {
  function greeting(h) {
    if (h >= 5 && h < 12) return "Good morning";
    if (h >= 12 && h < 18) return "Good afternoon";
    if (h >= 18 && h < 23) return "Good evening";
    return "Good night";
  }

  // ── clock and greeting ──
  function initClock() {
    const C = App.config;
    const timeEl = document.getElementById("time");
    const greetingEl = document.getElementById("greeting");
    let dateFormat;
    try {
      dateFormat = new Intl.DateTimeFormat(C.locale || undefined, { weekday: "long", day: "numeric", month: "long" });
    } catch (e) {
      dateFormat = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" });
    }

    function tick() {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      timeEl.textContent = `${hh}:${mm}`;
      let date = dateFormat.format(d);
      date = date.charAt(0).toUpperCase() + date.slice(1);
      const name = App.name;
      greetingEl.replaceChildren(`${date} · ${greeting(d.getHours())}${name ? `, ${name}` : ""}`);
      if (!name && !App.demo) {
        const setName = UI.el("button", { type: "button", class: "link-button" }, "set your name");
        setName.addEventListener("click", (e) => {
          e.stopPropagation(); // otherwise the "click outside closes the menu" handler closes it at once
          Settings.open("name");
        });
        greetingEl.append(" · ", setName);
      }
      document.title = `${hh}:${mm} · New tab`;
    }
    tick();
    setTimeout(() => { tick(); setInterval(tick, 60000); }, (60 - new Date().getSeconds()) * 1000);
    document.addEventListener("settings-changed", tick);

    document.getElementById("label").textContent = C.label || "";
  }

  // ── settings menu: name and accent colour, saved in the browser ──
  const Settings = {
    init() {
      this.menu = document.getElementById("settings");
      this.form = document.getElementById("settings-form");
      this.name = document.getElementById("settings-name");
      this.accent = document.getElementById("settings-accent");
      this.menu.addEventListener("toggle", () => { if (this.menu.open) this.fill(); });

      this.form.addEventListener("submit", async (e) => {
        e.preventDefault();
        await App.saveSettings({ name: this.name.value, accent: this.accent.value });
        this.menu.open = false;
      });
      document.getElementById("settings-reset").addEventListener("click", async () => {
        await App.resetSettings();
        this.fill();
      });
      // live preview of the accent colour
      this.accent.addEventListener("input", () => {
        document.documentElement.style.setProperty("--accent", this.accent.value);
      });
      const close = () => { this.menu.open = false; App.applyAccent(); };
      document.addEventListener("click", (e) => {
        if (this.menu.open && !this.menu.contains(e.target)) close();
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.menu.open) close();
      });
      if (App.demo) this.menu.hidden = true;
    },
    fill() {
      this.name.value = App.name;
      this.accent.value = App.accent;
    },
    open(focus) {
      this.menu.open = true;
      this.fill();
      if (focus === "name") this.name.focus();
    }
  };

  // ── search ──
  function initSearch() {
    const C = App.config;
    const form = document.getElementById("search");
    const input = document.getElementById("q");
    const badge = document.getElementById("search-engine");
    const prefixesEl = document.getElementById("prefixes");
    const P = C.search.prefixes || {};

    input.placeholder = Object.keys(P).length
      ? `Search the web, or use a prefix: ${Object.keys(P).slice(0, 3).join(", ")}…`
      : "Search the web";

    for (const [key, engine] of Object.entries(P)) {
      const b = UI.el("button", { type: "button", class: "prefix", title: `Search ${engine.name}` },
        UI.el("b", {}, key), " ", engine.name);
      b.addEventListener("click", () => {
        const rest = input.value.replace(/^(\S+)\s/, (m, p) => (P[p.toLowerCase()] ? "" : m));
        input.value = `${key} ${rest}`;
        input.focus();
        updateBadge();
      });
      prefixesEl.append(b);
    }

    function parse(text) {
      const m = text.match(/^(\S+)\s+(.*)$/);
      if (m && P[m[1].toLowerCase()]) return { engine: P[m[1].toLowerCase()], q: m[2] };
      return { engine: null, q: text };
    }

    function updateBadge() {
      const { engine } = parse(input.value);
      badge.hidden = !engine;
      if (engine) badge.textContent = engine.name;
    }
    input.addEventListener("input", updateBadge);

    const looksLikeUrl = (t) => /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/i.test(t) && !/\s/.test(t);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      const { engine, q } = parse(text);
      let url;
      if (!engine && looksLikeUrl(text)) {
        url = /^https?:\/\//i.test(text) ? text : `https://${text}`;
      } else {
        const vault = (await Store.get("vaultName")) || "";
        url = (engine ? engine.url : C.search.default)
          .replace("{q}", encodeURIComponent(q.trim()))
          .replace("{vault}", encodeURIComponent(vault));
      }
      location.href = url;
    });

    // "/" focuses the search bar, Esc clears it
    document.addEventListener("keydown", (e) => {
      const inField = e.target.closest("input, textarea");
      if (e.key === "/" && !inField) { e.preventDefault(); input.focus(); }
      if (e.key === "Escape" && e.target === input) { input.value = ""; updateBadge(); input.blur(); }
    });
  }

  window.Header = {
    init() {
      Settings.init();
      initClock();
      initSearch();
    }
  };
  window.Settings = Settings;
})();
