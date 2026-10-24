// Access to the Obsidian vault: folder selection, reading notes, link index
// (cached) and on-demand file reads. Everything is local and read-only.
(function () {
  const P = window.VaultParse;
  let C;
  let demo = false;

  let handle = null;
  let index = null;   // { vault, ts, notes:[{path,mtime,tags,links,unresolved}], attachments:[path], settings }
  let maps = null;
  const texts = new Map();
  const blobs = new Map();

  const rebuildMaps = () => { maps = P.buildMaps(index.notes.map((n) => n.path), index.attachments || []); };

  // ── reading the vault ──
  async function* walk(dir, prefix, files, attachments) {
    for await (const [name, h] of dir.entries()) {
      if (h.kind === "directory") {
        if (name.startsWith(".") || C.excludedFolders.includes(name)) continue;
        yield* walk(h, `${prefix}${name}/`, files, attachments);
      } else if (/\.md$/i.test(name)) {
        files.push({ path: prefix + name, h });
        yield files.length;
      } else if (P.IMAGE.test(name)) {
        attachments.push(prefix + name);
      }
    }
  }

  // Graph settings saved by Obsidian (forces, colour groups, filters).
  async function readGraphSettings(dir) {
    try {
      const o = await dir.getDirectoryHandle(".obsidian");
      const f = await (await o.getFileHandle("graph.json")).getFile();
      const s = JSON.parse(await f.text());
      return s && typeof s === "object" ? s : {};
    } catch (e) {
      return {};
    }
  }

  async function scan(progress) {
    const files = [], attachments = [];
    for await (const n of walk(handle, "", files, attachments)) {
      if (n % 50 === 0) progress?.(`Looking for notes… ${n}`);
    }
    const read = [];
    for (let i = 0; i < files.length; i += 25) {
      const batch = await Promise.all(files.slice(i, i + 25).map(async ({ path, h }) => {
        try {
          const f = await h.getFile();
          const text = await f.text();
          texts.set(path, text);
          return { path, mtime: f.lastModified, text };
        } catch (e) { return null; }
      }));
      read.push(...batch.filter(Boolean));
      progress?.(`Reading the vault… ${read.length} / ${files.length}`);
    }
    const built = P.buildIndex(handle.name, read, attachments);
    index = built.index;
    maps = built.maps;
    index.settings = await readGraphSettings(handle);
    // Only paths, dates, tags and links are stored: note contents stay on disk.
    await Store.set("vaultIndex", index);
    return index;
  }

  // ── permissions and files ──
  async function permission(ask) {
    if (demo) return true;
    if (!handle) return false;
    const opts = { mode: "read" };
    try {
      if ((await handle.queryPermission(opts)) === "granted") return true;
      if (!ask) return false;
      return (await handle.requestPermission(opts)) === "granted";
    } catch (e) { return false; }
  }

  async function fileHandle(path) {
    let d = handle;
    const parts = path.split("/");
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
    return d.getFileHandle(parts[parts.length - 1]);
  }

  async function readNote(path, ask = true) {
    if (texts.has(path)) return texts.get(path);
    if (demo) return window.DEMO_VAULT[path] ?? `# ${P.withoutExt(P.baseName(path))}\n\nExample note.`;
    if (!(await permission(ask))) return null;
    const t = await (await (await fileHandle(path)).getFile()).text();
    texts.set(path, t);
    return t;
  }

  async function attachmentUrl(path) {
    if (blobs.has(path)) return blobs.get(path);
    if (demo || !(await permission(false))) return null;
    try {
      const u = URL.createObjectURL(await (await fileHandle(path)).getFile());
      blobs.set(path, u);
      return u;
    } catch (e) { return null; }
  }

  async function choose() {
    const h = await window.showDirectoryPicker({ id: "obsidian-vault", mode: "read" });
    handle = h;
    texts.clear();
    await Store.idbSet("vault", h);
    await Store.set("vaultName", h.name);
    return h;
  }

  async function load() {
    C = App.config.graph;
    demo = App.demo;
    if (demo) {
      const notes = Object.entries(window.DEMO_VAULT).map(([path, text], i) => ({ path, text, mtime: 1000 - i }));
      ({ index, maps } = P.buildIndex("Demo", notes));
      return;
    }
    handle = (await Store.idbGet("vault")) || null;
    const saved = await Store.get("vaultIndex");
    if (saved && Array.isArray(saved.notes) && (!handle || saved.vault === handle.name)) {
      index = saved;
      rebuildMaps();
    }
  }

  window.Vault = {
    get demo() { return demo; },
    load, choose, scan, permission, readNote, attachmentUrl,
    resolveNote: (t, from) => P.resolveNote(maps, t, from),
    resolveAttachment: (t, from) => P.resolveAttachment(maps, t, from),
    frontmatter: P.frontmatter,
    get handle() { return handle; },
    get index() { return index; },
    get name() { return index?.vault || handle?.name || ""; },
    obsidianUrl(path) {
      const v = encodeURIComponent(this.name);
      return path ? `obsidian://open?vault=${v}&file=${encodeURIComponent(P.withoutExt(path))}` : `obsidian://open?vault=${v}`;
    },
    title: (path) => P.withoutExt(P.baseName(path)),
    folder: P.folderOf
  };
})();
