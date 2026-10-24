// News editor: change sections and feeds from the page, without editing files.
// Changes are kept in a draft and saved in the browser with "Save".
//
// Adding a feed: the browser first asks permission for that one site, then the
// feed is downloaded once to check it is RSS/Atom and to read its name.
(function () {
  const N = window.NewsConfig;
  let dialog, body, statusEl;
  let draft = [];
  const ICON_LABELS = { shield: "Shield", chip: "Chip", globe: "Globe" };

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const host = (url) => new URL(url).hostname.replace(/^www\./, "");

  function setStatus(text, isError) {
    statusEl.textContent = text || "";
    statusEl.classList.toggle("error", !!isError);
  }

  // The browser only shows the permission prompt during a click, so this is
  // always the first awaited call in a click handler.
  async function requestOrigins(origins) {
    if (!App.inExtension || !chrome.permissions || !origins.length) return true;
    try {
      return await chrome.permissions.request({ origins });
    } catch (e) {
      return false;
    }
  }

  // ── rendering ──
  function iconButton(shape, label, onClick, disabled) {
    const b = UI.el("button", { type: "button", class: "btn btn-icon btn-small", "aria-label": label, title: label, disabled: !!disabled },
      UI.icon(shape, 14));
    b.addEventListener("click", onClick);
    return b;
  }
  const UP = [["path", { d: "m6 15 6-6 6 6" }]];
  const DOWN = [["path", { d: "m6 9 6 6 6-6" }]];

  function feedRow(section, f, fi) {
    return UI.el("li", { class: "editor-feed" },
      UI.el("span", { class: "editor-feed-text" },
        UI.el("span", { class: "editor-feed-name" }, f.source),
        UI.el("span", { class: "editor-feed-url" }, f.url)),
      iconButton(UI.ICONS.close, `Remove ${f.source}`, () => { section.feeds.splice(fi, 1); render(); }));
  }

  function addFeedForm(section) {
    const input = UI.el("input", { type: "url", placeholder: "Feed address, e.g. https://example.com/feed", "aria-label": `New feed for ${section.title}` });
    const button = UI.el("button", { type: "submit", class: "btn" }, UI.icon(UI.ICONS.plus, 14), "Add feed");
    const error = UI.el("p", { class: "form-error", role: "alert", hidden: true });
    const form = UI.el("form", { class: "editor-add-feed" }, input, button, error);
    const fail = (text) => { error.textContent = text; error.hidden = false; button.disabled = false; input.focus(); };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      error.hidden = true;
      const url = N.cleanFeedUrl(input.value);
      if (!url) return fail("Use an https:// address.");
      if (section.feeds.some((f) => f.url === url)) return fail("This feed is already in the section.");
      if (section.feeds.length >= N.LIMITS.feedsPerSection) return fail(`A section can have up to ${N.LIMITS.feedsPerSection} feeds.`);

      button.disabled = true;
      if (!(await requestOrigins([N.originPattern(url)]))) return fail(`Permission to read ${host(url)} was not granted.`);
      setStatus(`Checking ${host(url)}…`);
      try {
        const info = await News.probe(url);
        section.feeds.push({ source: info.title || host(url), url });
        setStatus(`Added “${info.title || host(url)}” (${info.items} items). Remember to save.`);
        render();
      } catch (err) {
        setStatus("");
        fail(`Not added: ${err.message}.`);
      }
    });
    return form;
  }

  function sectionCard(section, si) {
    const title = UI.el("input", { type: "text", value: section.title, maxlength: N.LIMITS.title, "aria-label": "Section title", class: "editor-title" });
    title.addEventListener("input", () => { section.title = title.value; });

    const icon = UI.el("select", { "aria-label": "Section icon" },
      N.ICONS.map((k) => UI.el("option", { value: k, selected: section.icon === k }, ICON_LABELS[k])));
    icon.addEventListener("change", () => { section.icon = icon.value; });

    const move = (d) => { const [s] = draft.splice(si, 1); draft.splice(si + d, 0, s); render(); };

    return UI.el("section", { class: "editor-section" },
      UI.el("div", { class: "editor-section-head" },
        title, icon,
        iconButton(UP, "Move up", () => move(-1), si === 0),
        iconButton(DOWN, "Move down", () => move(1), si === draft.length - 1),
        iconButton(UI.ICONS.close, `Remove section ${section.title}`, () => { draft.splice(si, 1); render(); })),
      section.feeds.length
        ? UI.el("ul", { class: "editor-feeds" }, section.feeds.map((f, fi) => feedRow(section, f, fi)))
        : UI.el("p", { class: "notice" }, "No feeds yet."),
      addFeedForm(section));
  }

  function addSectionBar() {
    const full = draft.length >= N.LIMITS.sections;

    const newSection = UI.el("button", { type: "button", class: "btn", disabled: full }, UI.icon(UI.ICONS.plus, 14), "Empty section");
    newSection.addEventListener("click", () => {
      draft.push({ title: "New section", icon: "globe", feeds: [] });
      render();
      body.querySelector(".editor-section:last-of-type .editor-title")?.select();
    });

    const used = new Set(draft.flatMap((s) => s.feeds.map((f) => f.url)));
    const pack = UI.el("select", { "aria-label": "Ready-made pack", disabled: full },
      UI.el("option", { value: "" }, "Add a ready-made pack…"),
      N.PACKS.map((p) => UI.el("option", { value: p.id }, `${p.label} (${p.section.feeds.length} feeds)`)));
    const addPack = UI.el("button", { type: "button", class: "btn", disabled: full }, "Add pack");
    addPack.addEventListener("click", async () => {
      const p = N.PACKS.find((x) => x.id === pack.value);
      if (!p) return setStatus("Choose a pack first.", true);
      const feeds = p.section.feeds.filter((f) => !used.has(f.url));
      if (!(await requestOrigins(N.originsOf([{ feeds }])))) return setStatus("Permission was not granted: the pack was not added.", true);
      draft.push(clone({ ...p.section, feeds }));
      setStatus(`Added “${p.section.title}”. Remember to save.`);
      render();
    });

    return UI.el("div", { class: "editor-add-section" },
      newSection, UI.el("span", { class: "editor-or" }, "or"), pack, addPack,
      full ? UI.el("span", { class: "notice" }, `Up to ${N.LIMITS.sections} sections.`) : null);
  }

  function render() {
    body.replaceChildren(
      ...draft.map(sectionCard),
      addSectionBar());
  }

  // ── open, save, reset ──
  async function open() {
    draft = News.sections;
    setStatus((await News.customized) ? "" : "Showing the sections from the configuration file.");
    render();
    dialog.showModal();
  }

  async function save() {
    const titled = draft.map((s) => ({ ...s, title: s.title.trim() || "Untitled" }));
    await News.save(titled);
    dialog.close();
  }

  async function reset() {
    await News.reset();
    draft = News.sections;
    render();
    setStatus("Restored the sections from the configuration file.");
  }

  window.NewsEditor = {
    init() {
      dialog = document.getElementById("news-editor");
      body = document.getElementById("news-editor-body");
      statusEl = document.getElementById("news-editor-status");
      document.getElementById("news-editor-save").addEventListener("click", save);
      document.getElementById("news-editor-cancel").addEventListener("click", () => dialog.close());
      document.getElementById("news-editor-close").addEventListener("click", () => dialog.close());
      document.getElementById("news-editor-reset").addEventListener("click", reset);
      // closing without saving: give back permissions asked for feeds that were not kept
      dialog.addEventListener("close", () => News.releaseUnusedPermissions());
      document.getElementById("open-news-editor").addEventListener("click", () => {
        document.getElementById("settings").open = false;
        open();
      });
    },
    open
  };
})();
