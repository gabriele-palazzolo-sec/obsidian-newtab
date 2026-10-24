// Bookmarks: tiles with the site icon, keys 1–9, add and remove from the page.
(function () {
  // Only these schemes can be saved as bookmarks: a "javascript:" or "data:"
  // URL would turn a bookmark into code running inside the extension page.
  const SAFE_URL = /^(https?:\/\/|obsidian:\/\/)/i;

  function normalizeUrl(input) {
    let url = String(input || "").trim();
    if (!/^[a-z][\w+.-]*:/i.test(url)) url = `https://${url}`;
    if (!SAFE_URL.test(url)) return null;
    try { new URL(url); } catch (e) { return null; }
    return url;
  }

  function init() {
    const C = App.config;
    const box = document.getElementById("bookmarks");
    const form = document.getElementById("new-bookmark");
    const fName = document.getElementById("nb-name");
    const fUrl = document.getElementById("nb-url");
    const fDescription = document.getElementById("nb-description");
    const fError = document.getElementById("nb-error");
    let list = [];

    function siteIcon(b) {
      const wrap = UI.el("span", { class: "bookmark-icon", "aria-hidden": "true" });
      const letter = () => { wrap.textContent = b.name.trim().charAt(0).toUpperCase(); };
      if (App.inExtension && /^https?:/i.test(b.url)) {
        // favicon from the browser's own cache: no request to the site
        const img = UI.el("img", { alt: "" });
        img.src = chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(b.url)}&size=32`);
        img.addEventListener("error", letter);
        wrap.append(img);
      } else {
        letter();
      }
      return wrap;
    }

    function render() {
      box.replaceChildren();
      list.forEach((b, i) => {
        const removeBtn = UI.el("button", {
          class: "bookmark-remove", type: "button", "aria-label": `Remove ${b.name}`, title: "Remove"
        }, UI.icon(UI.ICONS.close, 14));
        removeBtn.addEventListener("click", (e) => {
          e.preventDefault(); e.stopPropagation();
          list.splice(i, 1);
          save();
        });
        box.append(UI.el("a", { class: "bookmark", href: b.url },
          siteIcon(b),
          UI.el("span", { class: "bookmark-text" },
            UI.el("span", { class: "bookmark-name" }, b.name),
            b.description ? UI.el("span", { class: "bookmark-description" }, b.description) : null),
          i < 9 ? UI.el("span", { class: "key-hint", "aria-hidden": "true" }, String(i + 1)) : null,
          removeBtn
        ));
      });
      const add = UI.el("button", { class: "bookmark bookmark-add", type: "button" },
        UI.icon(UI.ICONS.plus, 18), "Add bookmark");
      add.addEventListener("click", () => { form.hidden = false; fName.focus(); });
      box.append(add);
    }

    async function save() {
      if (!App.demo) await Store.set("bookmarks", list);
      render();
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const url = normalizeUrl(fUrl.value);
      if (!url) {
        fError.textContent = "Use a web address (https://…) or an obsidian:// link.";
        fError.hidden = false;
        fUrl.focus();
        return;
      }
      list.push({ name: fName.value.trim().slice(0, 60), description: fDescription.value.trim().slice(0, 80), url });
      form.reset();
      fError.hidden = true;
      form.hidden = true;
      save();
    });
    document.getElementById("nb-cancel").addEventListener("click", () => {
      form.reset(); fError.hidden = true; form.hidden = true;
    });

    // keys 1–9
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest("input, textarea")) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9 && list[n - 1]) location.href = list[n - 1].url;
    });

    (async () => {
      const saved = App.demo ? null : await Store.get("bookmarks");
      // saved bookmarks are re-validated: storage is not trusted blindly
      const source = Array.isArray(saved) ? saved : C.bookmarks || [];
      list = source
        .map((b) => ({ name: String(b.name || "").slice(0, 60), description: String(b.description || "").slice(0, 80), url: normalizeUrl(b.url) }))
        .filter((b) => b.name && b.url);
      render();
    })();
  }

  window.Bookmarks = { init, normalizeUrl };
})();
