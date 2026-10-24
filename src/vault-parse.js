// Pure functions to understand Obsidian notes: frontmatter, tags, links and
// name resolution. No DOM and no file access, so they run in the browser and
// in Node (tests/vault-parse.test.mjs).
(function (root) {
  const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

  const baseName = (p) => p.split("/").pop();
  const withoutExt = (p) => p.replace(/\.md$/i, "");
  const folderOf = (p) => p.split("/").slice(0, -1).join("/");

  function normalizePath(p) {
    const out = [];
    for (const s of p.split("/")) {
      if (!s || s === ".") continue;
      if (s === "..") out.pop(); else out.push(s);
    }
    return out.join("/");
  }

  function cleanTarget(t) {
    t = (t || "").trim();
    try { t = decodeURIComponent(t); } catch (e) {}
    return t.replace(/^<|>$/g, "");
  }

  // ── frontmatter and tags ──
  function frontmatter(text) {
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    return m ? { yaml: m[1], body: text.slice(m[0].length) } : { yaml: "", body: text };
  }

  function tagsFromYaml(yaml) {
    const tags = [];
    // [ \t]* and not \s*: \s would swallow the newline of a "tags:" list
    const m = yaml.match(/^tags?:[ \t]*(.*)$/m);
    if (!m) return tags;
    if (m[1].trim()) {
      tags.push(...m[1].replace(/[\[\]]/g, "").split(/[,\s]+/));
    } else {
      for (const line of yaml.slice(m.index + m[0].length).replace(/^\r?\n/, "").split(/\r?\n/)) {
        const x = line.match(/^\s*-\s*(.+)$/);
        if (!x) break;
        tags.push(x[1]);
      }
    }
    return tags.map((t) => t.trim().replace(/^["']|["']$/g, "").replace(/^#/, "")).filter(Boolean);
  }

  // ── links and tags in the body ──
  const RE_WIKI = /!?\[\[([^\[\]\n|#^]+)(?:[#^][^\[\]\n|]*)?(?:\|[^\[\]\n]*)?\]\]/g;
  const RE_MD = /\[[^\]\n]*\]\(([^)\s]+?\.md)(?:#[^)]*)?\)/gi;
  const RE_TAG = /(^|\s)#([\p{L}\p{N}_\/-]*[\p{L}_\/-][\p{L}\p{N}_\/-]*)/gu;

  function analyze(text) {
    const { yaml, body } = frontmatter(text);
    const noCode = body.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
    const targets = [];
    for (const m of noCode.matchAll(RE_WIKI)) {
      if (m[0].startsWith("!") && IMAGE.test(m[1].trim())) continue;
      targets.push(m[1]);
    }
    for (const m of noCode.matchAll(RE_MD)) targets.push(m[1]);
    const tags = new Set(tagsFromYaml(yaml).map((t) => t.toLowerCase()));
    for (const m of noCode.matchAll(RE_TAG)) tags.add(m[2].toLowerCase());
    return { targets, tags: [...tags] };
  }

  // ── name resolution, like Obsidian: full path, relative path, then file name ──
  function buildMaps(notePaths, attachmentPaths = []) {
    const byPath = new Map(), byName = new Map(), attachments = new Map(), attachmentsByName = new Map();
    for (const p of [...notePaths].sort((a, b) => a.length - b.length)) {
      byPath.set(withoutExt(p).toLowerCase(), p);
      const b = withoutExt(baseName(p)).toLowerCase();
      if (!byName.has(b)) byName.set(b, p);
    }
    for (const a of [...attachmentPaths].sort((x, y) => x.length - y.length)) {
      attachments.set(a.toLowerCase(), a);
      const b = baseName(a).toLowerCase();
      if (!attachmentsByName.has(b)) attachmentsByName.set(b, a);
    }
    return { byPath, byName, attachments, attachmentsByName };
  }

  function resolveNote(maps, target, from) {
    if (!maps) return null;
    const t = withoutExt(cleanTarget(target));
    if (!t) return null;
    const absolute = t.replace(/^\//, "").toLowerCase();
    if (from && !t.startsWith("/")) {
      const rel = normalizePath(`${folderOf(from)}/${t}`).toLowerCase();
      if (/^\.\.?\//.test(t) && maps.byPath.has(rel)) return maps.byPath.get(rel);
      if (maps.byPath.has(absolute)) return maps.byPath.get(absolute);
      if (maps.byPath.has(rel)) return maps.byPath.get(rel);
    } else if (maps.byPath.has(absolute)) {
      return maps.byPath.get(absolute);
    }
    return maps.byName.get(absolute.split("/").pop()) || null;
  }

  function resolveAttachment(maps, target, from) {
    if (!maps) return null;
    const t = cleanTarget(target);
    const low = t.replace(/^\//, "").toLowerCase();
    if (from) {
      const rel = normalizePath(`${folderOf(from)}/${t}`).toLowerCase();
      if (maps.attachments.has(rel)) return maps.attachments.get(rel);
    }
    return maps.attachments.get(low) || maps.attachmentsByName.get(low.split("/").pop()) || null;
  }

  // Builds the graph index from [{ path, mtime, text }].
  function buildIndex(vaultName, notes, attachments = []) {
    const analyzed = notes.map((n) => ({ ...n, ...analyze(n.text) }));
    const maps = buildMaps(analyzed.map((n) => n.path), attachments);
    const index = {
      vault: vaultName,
      ts: Date.now(),
      attachments,
      settings: {},
      notes: analyzed.map((n) => {
        const links = new Set(), unresolved = new Set();
        for (const t of n.targets) {
          const p = resolveNote(maps, t, n.path);
          if (p && p !== n.path) links.add(p);
          else if (!p) {
            const name = withoutExt(cleanTarget(t)).split("/").pop();
            if (name && !IMAGE.test(name) && !/\.\w{2,4}$/.test(name)) unresolved.add(name);
          }
        }
        return { path: n.path, mtime: n.mtime, tags: n.tags, links: [...links], unresolved: [...unresolved] };
      })
    };
    return { index, maps };
  }

  const api = {
    IMAGE, baseName, withoutExt, folderOf, normalizePath, cleanTarget,
    frontmatter, tagsFromYaml, analyze, buildMaps, resolveNote, resolveAttachment, buildIndex
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.VaultParse = api;
})(typeof window !== "undefined" ? window : globalThis);
