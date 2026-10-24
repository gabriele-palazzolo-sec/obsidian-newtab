// Note reader: shows a vault note as formatted text, with navigable [[links]],
// images, callouts and a button to open it in Obsidian.
//
// Security: a note is untrusted input (it may contain text pasted from the
// web). Markdown is converted by marked and the resulting HTML is always
// sanitised by DOMPurify, which returns DOM nodes directly; after that the
// code only touches the DOM, never HTML strings. The extension's Content
// Security Policy also blocks any inline script as a second line of defence.
(function () {
  let panel, body, titleEl, pathEl, btnBack, btnClose, btnObsidian, grid;
  const history = [];
  let current = null;
  let currentNote = null; // used to resolve relative links while rendering

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

  // ── marked extensions for Obsidian syntax ──
  function setupMarked() {
    marked.use({
      gfm: true,
      breaks: true,
      extensions: [
        {
          name: "wikilink",
          level: "inline",
          start(src) { const i = src.search(/!?\[\[/); return i < 0 ? undefined : i; },
          tokenizer(src) {
            const m = /^(!?)\[\[([^\[\]\n]+?)\]\]/.exec(src);
            if (!m) return;
            const [, embed, inner] = m;
            const [target, alias] = inner.split("|");
            const [name, ...anchor] = target.split("#");
            return { type: "wikilink", raw: m[0], embed: !!embed, name: name.trim(), anchor: anchor.join("#").replace(/^\^/, "").trim(), alias: alias?.trim() };
          },
          renderer(t) {
            if (t.embed && IMAGE.test(t.name)) {
              const p = Vault.resolveAttachment(t.name, currentNote);
              return `<img data-vault="${esc(p || "")}" alt="${esc(t.alias || t.name)}">`;
            }
            const p = t.name ? Vault.resolveNote(t.name, currentNote) : currentNote;
            const text = t.alias || (t.name || "") + (t.anchor ? ` › ${t.anchor}` : "") || t.anchor;
            const cls = `wikilink${p ? "" : " unresolved"}${t.embed ? " embedded" : ""}`;
            return `<a href="#" class="${cls}" data-note="${esc(p || "")}" data-anchor="${esc(t.anchor)}" title="${esc(p || "Note not created yet")}">${t.embed ? "↪ " : ""}${esc(text)}</a>`;
          }
        },
        {
          name: "highlight",
          level: "inline",
          start(src) { const i = src.indexOf("=="); return i < 0 ? undefined : i; },
          tokenizer(src) {
            const m = /^==(?=\S)([\s\S]*?\S)==/.exec(src);
            if (m) return { type: "highlight", raw: m[0], tokens: this.lexer.inlineTokens(m[1]) };
          },
          renderer(t) { return `<mark>${this.parser.parseInline(t.tokens)}</mark>`; }
        },
        {
          name: "tag",
          level: "inline",
          start(src) { const m = /(^|\s)#[\p{L}_]/u.exec(src); return m ? m.index + m[1].length : undefined; },
          tokenizer(src) {
            const m = /^#([\p{L}\p{N}_\/-]*[\p{L}_\/-][\p{L}\p{N}_\/-]*)/u.exec(src);
            if (m) return { type: "tag", raw: m[0], name: m[1] };
          },
          renderer(t) { return `<span class="tag">#${esc(t.name)}</span>`; }
        }
      ]
    });
  }

  // ── rendering ──
  function properties(yaml) {
    if (!yaml.trim()) return null;
    const rows = [];
    let key = null;
    for (const line of yaml.split(/\r?\n/)) {
      const kv = line.match(/^([\w\s-]+):\s*(.*)$/);
      if (kv) { key = kv[1].trim(); rows.push([key, kv[2].replace(/^\[|\]$/g, "")]); }
      else {
        const li = line.match(/^\s*-\s*(.+)$/);
        if (li && key) rows[rows.length - 1][1] += (rows[rows.length - 1][1] ? ", " : "") + li[1];
      }
    }
    if (!rows.length) return null;
    const box = UI.el("dl", { class: "properties" });
    for (const [k, v] of rows) box.append(UI.el("dt", {}, k), UI.el("dd", {}, v.replace(/["']/g, "")));
    return box;
  }

  // "> [!tip] Title" → styled callout. Works on DOM text nodes only.
  function callout(bq) {
    const p = bq.firstElementChild;
    if (!p || p.tagName !== "P") return;
    const first = p.firstChild;
    if (!first || first.nodeType !== Node.TEXT_NODE) return;
    const m = first.data.match(/^\[!([\w-]+)\]([+-]?)[ \t]*([^\n]*)\n?/);
    if (!m) return;
    const type = m[1].toLowerCase();
    first.data = first.data.slice(m[0].length);
    if (!first.data) {
      const next = first.nextSibling;
      first.remove();
      if (next && next.nodeName === "BR") next.remove();
    }
    if (!p.textContent.trim() && !p.querySelector("img")) p.remove();
    bq.classList.add("callout", `callout-${type}`);
    bq.prepend(UI.el("div", { class: "callout-title" }, m[3].trim() || type.charAt(0).toUpperCase() + type.slice(1)));
  }

  function missingImage(img, text) {
    img.replaceWith(UI.el("span", { class: "image-missing" }, text || `Image not found: ${img.alt || "unnamed"}`));
  }

  async function loadImages(root) {
    const remoteAllowed = !!App.config.reader?.loadRemoteImages;
    for (const img of root.querySelectorAll("img")) {
      let p = img.getAttribute("data-vault");
      const src = img.getAttribute("data-src");
      img.removeAttribute("data-src");
      if (src && /^https?:/i.test(src)) {
        if (remoteAllowed) img.src = src;
        else missingImage(img, `Remote image blocked: ${img.alt || new URL(src, location.href).hostname}`);
        continue;
      }
      if (src && /^data:image\//i.test(src)) { img.src = src; continue; }
      if (!p && src && !/^[a-z][\w+.-]*:/i.test(src)) p = Vault.resolveAttachment(src, currentNote);
      if (!p) { missingImage(img); continue; }
      const u = await Vault.attachmentUrl(p);
      if (u) img.src = u; else missingImage(img);
    }
  }

  // Image addresses are moved to data-src while DOMPurify works on its inert
  // document: a browser starts downloading an <img src> as soon as the element
  // exists in the page, before any later check could stop it.
  function setupPurify() {
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.nodeName === "IMG" && node.hasAttribute("src")) {
        node.setAttribute("data-src", node.getAttribute("src"));
        node.removeAttribute("src");
      }
    });
  }

  function renderNote(path, text) {
    currentNote = path;
    const { yaml, body: md } = Vault.frontmatter(text);
    const clean = DOMPurify.sanitize(marked.parse(md), {
      RETURN_DOM_FRAGMENT: true,
      ADD_ATTR: ["data-note", "data-anchor", "data-vault", "data-src"],
      FORBID_TAGS: ["style", "form", "button", "textarea", "select", "iframe", "object", "embed", "svg", "math",
        "video", "audio", "source", "picture", "track"],
      FORBID_ATTR: ["style", "srcset", "ping", "poster"]
    });
    const root = UI.el("div", { class: "md" });
    root.append(clean);

    const props = properties(yaml);
    if (props) root.prepend(props);
    root.querySelectorAll("blockquote").forEach(callout);

    // links: internal → vault note, web → new tab, anything else is neutralised
    for (const a of root.querySelectorAll("a[href]")) {
      if (a.hasAttribute("data-note")) continue;
      const href = a.getAttribute("href");
      if (/^https?:/i.test(href)) { a.target = "_blank"; a.rel = "noopener noreferrer"; continue; }
      if (/^(mailto:|obsidian:)/i.test(href) || href.startsWith("#")) continue;
      if (/^[a-z][\w+.-]*:/i.test(href)) { a.removeAttribute("href"); continue; }
      const [file, anchor] = href.split("#");
      const p = Vault.resolveNote(file, path);
      a.setAttribute("href", "#");
      a.setAttribute("data-note", p || "");
      a.setAttribute("data-anchor", anchor || "");
      a.classList.add("wikilink");
      if (!p) a.classList.add("unresolved");
    }
    // headings get a key for [[note#heading]] links
    root.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h) => (h.dataset.heading = h.textContent.trim().toLowerCase()));
    root.querySelectorAll("input").forEach((i) => { if (i.type !== "checkbox") i.remove(); else i.disabled = true; });
    loadImages(root);
    return root;
  }

  async function show(path, anchor) {
    current = path;
    titleEl.textContent = Vault.title(path);
    pathEl.textContent = Vault.folder(path) || "/";
    btnObsidian.href = Vault.obsidianUrl(path);
    btnObsidian.hidden = Vault.demo;
    btnBack.hidden = history.length === 0;
    panel.hidden = false;
    grid.classList.add("with-reader");
    window.Graph?.select(path);
    body.replaceChildren(UI.el("p", { class: "muted" }, "Loading…"));

    let text = null;
    try { text = await Vault.readNote(path, true); } catch (e) { console.warn("[reader]", e); }
    if (current !== path) return;
    if (text == null) {
      body.replaceChildren(UI.el("p", { class: "notice" },
        "Can't read this note: the browser no longer has access to the vault. Press the ⟳ button above the graph to grant it again."));
      return;
    }
    body.replaceChildren(renderNote(path, text));
    body.scrollTop = 0;
    if (anchor) body.querySelector(`[data-heading="${CSS.escape(anchor.toLowerCase())}"]`)?.scrollIntoView({ block: "start" });
  }

  function close() {
    panel.hidden = true;
    grid.classList.remove("with-reader");
    current = null;
    history.length = 0;
    window.Graph?.deselect();
  }

  window.Reader = {
    init() {
      panel = document.getElementById("reader");
      body = document.getElementById("reader-body");
      titleEl = document.getElementById("reader-title");
      pathEl = document.getElementById("reader-path");
      btnBack = document.getElementById("reader-back");
      btnClose = document.getElementById("reader-close");
      btnObsidian = document.getElementById("reader-obsidian");
      grid = document.getElementById("graph-body");
      setupMarked();
      setupPurify();

      body.addEventListener("click", (e) => {
        const a = e.target.closest("a[data-note]");
        if (!a) return;
        e.preventDefault();
        const p = a.getAttribute("data-note");
        const anchor = a.getAttribute("data-anchor");
        if (!p) return;
        if (e.ctrlKey || e.metaKey) { if (!Vault.demo) location.href = Vault.obsidianUrl(p); return; }
        if (p === current && anchor) {
          body.querySelector(`[data-heading="${CSS.escape(anchor.toLowerCase())}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
          return;
        }
        if (current) history.push(current);
        show(p, anchor);
      });
      btnBack.addEventListener("click", () => { const p = history.pop(); if (p) show(p); });
      btnClose.addEventListener("click", close);
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !panel.hidden && !e.target.closest("input") && !document.querySelector("dialog[open]")) close();
      });
    },
    open(path) {
      if (current && current !== path) history.push(current);
      show(path);
    },
    close
  };
})();
