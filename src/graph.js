// Obsidian-style note graph, drawn on a canvas with d3-force.
// It follows the vault's .obsidian/graph.json settings (forces, colour groups,
// tags, unresolved notes, orphans, arrows), adjustable from the Filters menu.
(function () {
  let C;
  let area, canvas, ctx, empty, msg, btnConnect, btnRefresh, btnChange, info, recentEl, vaultNameEl, openObsidian, filtersEl, preview;

  const PALETTE = ["#A78BFA", "#5EEAD4", "#FBBF24", "#F472B6", "#60A5FA", "#FB923C", "#A3E635", "#F87171"];
  const GREY = "#8B8FA3", TAG_COLOR = "#E4E4E7", GHOST_COLOR = "#4A4E5E";
  const accent = () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#A78BFA";

  let nodes = [], links = [], adj = new Map(), byId = new Map();
  let sim = null;
  let k = 1, tx = 0, ty = 0, W = 0, H = 0, dpr = 1;
  let userMoved = false;
  let hover = null, mix = 0, lastHover = null;
  let selected = null;
  let placeholder = false;   // decorative graph shown behind the "connect your vault" message
  let options = null;

  // ────────────────────────── options ──────────────────────────

  const LABELS = {
    tags: "Show tags",
    ghosts: "Notes not created yet",
    orphans: "Notes without links",
    arrows: "Direction arrows",
    colors: "Colour by folder"
  };

  function optionsFromObsidian(s = {}) {
    return {
      tags: !!s.showTags,
      ghosts: s.hideUnresolved === undefined ? true : !s.hideUnresolved,
      orphans: s.showOrphans === undefined ? true : !!s.showOrphans,
      arrows: !!s.showArrow,
      colors: true
    };
  }

  function renderFilters() {
    filtersEl.replaceChildren();
    for (const [key, text] of Object.entries(LABELS)) {
      const id = `opt-${key}`;
      const cb = UI.el("input", { type: "checkbox", id });
      cb.checked = !!options[key];
      cb.addEventListener("change", async () => {
        options[key] = cb.checked;
        if (!Vault.demo) await Store.set("graphOptions", { vault: Vault.name, ...options });
        build(false);
      });
      filtersEl.append(UI.el("label", { class: "filter", for: id }, cb, text));
    }
  }

  // ────────────────────────── building the graph ──────────────────────────

  function colorGroups(settings) {
    const groups = (Array.isArray(settings.colorGroups) ? settings.colorGroups : []).map((g) => {
      const q = String(g?.query || "").trim();
      const rgb = g?.color?.rgb;
      const col = typeof rgb === "number" ? `#${(rgb & 0xffffff).toString(16).padStart(6, "0")}` : null;
      return col && q ? { q, col } : null;
    }).filter(Boolean);
    return (note) => {
      for (const { q, col } of groups) {
        const m = q.match(/^(path|file|tag):\s*"?([^"]*)"?$/i);
        const type = m ? m[1].toLowerCase() : "text";
        const val = (m ? m[2] : q.replace(/"/g, "")).toLowerCase();
        if (type === "tag" && note.tags.includes(val.replace(/^#/, ""))) return col;
        if (type === "path" && note.path.toLowerCase().includes(val)) return col;
        if (type === "file" && Vault.title(note.path).toLowerCase().includes(val)) return col;
        if (type === "text" && note.path.toLowerCase().includes(val)) return col;
      }
      return null;
    };
  }

  function build(newVault) {
    const ind = Vault.index;
    if (!ind) return;
    const settings = ind.settings || {};
    const oldPos = new Map(nodes.map((n) => [n.id, n]));

    const nn = [], ll = [];
    const tmp = new Map();
    const add = (n) => { if (!tmp.has(n.id)) { tmp.set(n.id, n); nn.push(n); } return tmp.get(n.id); };
    const group = colorGroups(settings);
    const folders = [...new Set(ind.notes.map((n) => n.path.includes("/") ? n.path.split("/")[0] : ""))].filter(Boolean).sort();

    for (const n of ind.notes) {
      const top = n.path.includes("/") ? n.path.split("/")[0] : "";
      let col = group(n);
      if (!col && options.colors && top) col = PALETTE[folders.indexOf(top) % PALETTE.length];
      add({ id: n.path, label: Vault.title(n.path), type: "note", col: col || GREY, mtime: n.mtime });
    }
    for (const n of ind.notes) {
      for (const p of n.links) if (tmp.has(p)) ll.push({ source: n.path, target: p });
      if (options.ghosts) for (const u of n.unresolved || []) {
        add({ id: `?${u.toLowerCase()}`, label: u, type: "ghost", col: GHOST_COLOR });
        ll.push({ source: n.path, target: `?${u.toLowerCase()}` });
      }
      if (options.tags) for (const t of n.tags) {
        add({ id: `#${t}`, label: `#${t}`, type: "tag", col: TAG_COLOR });
        ll.push({ source: n.path, target: `#${t}` });
      }
    }
    // degrees and orphan filter
    const degree = new Map();
    const seen = new Set();
    const unique = ll.filter((l) => {
      const a = l.source < l.target ? l.source : l.target, b = a === l.source ? l.target : l.source;
      const key = `${a}\u0000${b}`;
      if (seen.has(key)) return false;
      seen.add(key);
      degree.set(l.source, (degree.get(l.source) || 0) + 1);
      degree.set(l.target, (degree.get(l.target) || 0) + 1);
      return true;
    });
    let kept = nn.filter((n) => options.orphans || degree.get(n.id));
    if (kept.length > C.maxNodes) {
      kept = kept.sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0)).slice(0, C.maxNodes);
    }
    const keptIds = new Set(kept.map((n) => n.id));
    links = unique.filter((l) => keptIds.has(l.source) && keptIds.has(l.target));
    nodes = kept;
    byId = new Map(nodes.map((n) => [n.id, n]));
    adj = new Map(nodes.map((n) => [n.id, new Set()]));
    for (const l of links) { adj.get(l.source).add(l.target); adj.get(l.target).add(l.source); }
    for (const n of nodes) {
      n.deg = adj.get(n.id).size;
      const v = oldPos.get(n.id) || savedPos.get(n.id);
      if (v) { n.x = v.x; n.y = v.y; }
    }
    if (hover && !byId.has(hover.id)) hover = null;
    startSimulation(settings, newVault);
  }

  function radius(n) {
    const m = Number(Vault.index?.settings?.nodeSizeMultiplier) || 1;
    const b = n.type === "ghost" ? 2.2 : 3;
    return (b + Math.min(13, Math.sqrt(n.deg || 0) * 2.1)) * m;
  }

  function startSimulation(settings, newVault) {
    const num = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);
    const repel = num(settings.repelStrength, 10);
    const center = num(settings.centerStrength, 0.52);
    const linkForce = num(settings.linkStrength, 1);
    const distance = num(settings.linkDistance, 250);
    if (sim) sim.stop();
    const placed = nodes.filter((n) => n.x != null).length;
    sim = d3.forceSimulation(nodes)
      .force("charge", d3.forceManyBody().strength(-repel * 26).distanceMax(520))
      .force("link", d3.forceLink(links).id((d) => d.id).distance(24 + distance * 0.15)
        .strength((l) => linkForce * 0.7 / Math.min(l.source.deg || 1, l.target.deg || 1)))
      .force("x", d3.forceX(0).strength(center * 0.08))
      .force("y", d3.forceY(0).strength(center * 0.08))
      .force("collide", d3.forceCollide((d) => radius(d) + 2))
      .velocityDecay(0.38)
      .alphaDecay(0.025)
      .on("tick", () => { if (!userMoved) fit(0.12); redraw(); })
      .on("end", () => { if (!userMoved) fit(1); redraw(); savePositions(); });
    if (placed === nodes.length && !newVault) sim.alpha(0.08);
    else if (placed > nodes.length * 0.6) sim.alpha(0.4);
    if (newVault) userMoved = false;
    if (sim.alpha() < 0.1) fit(1);
  }

  // ────────────────────────── view ──────────────────────────

  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = area.clientWidth; H = area.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    if (!userMoved) fit(1);
    draw();
  }

  function fit(s) {
    if (!nodes.length || !W) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of nodes) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
    const nk = Math.min(W / (x1 - x0 + 80), H / (y1 - y0 + 70), 2.4);
    const ntx = -((x0 + x1) / 2) * nk, nty = -((y0 + y1) / 2) * nk;
    k += (nk - k) * s; tx += (ntx - tx) * s; ty += (nty - ty) * s;
  }

  const toScreen = (n) => [W / 2 + tx + n.x * k, H / 2 + ty + n.y * k];
  const toWorld = (sx, sy) => [(sx - W / 2 - tx) / k, (sy - H / 2 - ty) / k];

  let requested = false;
  function redraw() {
    if (requested) return;
    requested = true;
    requestAnimationFrame(() => { requested = false; draw(); });
  }

  // smooth fade of the hover highlight
  let animating = false;
  function animateMix() {
    if (animating) return;
    animating = true;
    const step = () => {
      const goal = hover ? 1 : 0;
      mix += (goal - mix) * 0.22;
      if (Math.abs(goal - mix) < 0.01) mix = goal;
      draw();
      if (mix !== goal) requestAnimationFrame(step);
      else { animating = false; if (!hover) lastHover = null; }
    };
    requestAnimationFrame(step);
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!nodes.length) return;
    const acc = accent();
    const focus = hover || lastHover;
    const neighbours = focus ? adj.get(focus.id) : null;
    const inFocus = (n) => !focus || n === focus || neighbours.has(n.id);
    const lineMul = Number(Vault.index?.settings?.lineSizeMultiplier) || 1;

    ctx.save();
    ctx.translate(W / 2 + tx, H / 2 + ty);
    ctx.scale(k, k);

    // links
    for (const l of links) {
      const a = l.source, b = l.target;
      const lit = focus && (a === focus || b === focus);
      ctx.globalAlpha = lit ? 0.35 + 0.6 * mix : (focus ? 0.55 - 0.42 * mix : 0.55);
      ctx.strokeStyle = lit ? acc : "#4A4E60";
      ctx.lineWidth = ((lit ? 1.5 : 1) * lineMul) / k;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      if (options.arrows) {
        const ang = Math.atan2(b.y - a.y, b.x - a.x), r = radius(b) + 1.5, s = 5 / Math.sqrt(k);
        const px = b.x - Math.cos(ang) * r, py = b.y - Math.sin(ang) * r;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - Math.cos(ang - 0.45) * s, py - Math.sin(ang - 0.45) * s);
        ctx.lineTo(px - Math.cos(ang + 0.45) * s, py - Math.sin(ang + 0.45) * s);
        ctx.fill();
      }
    }

    // nodes
    for (const n of nodes) {
      const r = radius(n);
      const f = inFocus(n);
      ctx.globalAlpha = f ? (n.type === "ghost" ? 0.6 : 1) : 1 - 0.82 * mix;
      ctx.fillStyle = focus && n === focus && mix > 0.5 ? acc : n.col;
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
      if (n === selected) {
        ctx.globalAlpha = 0.9; ctx.strokeStyle = acc; ctx.lineWidth = 2 / k;
        ctx.beginPath(); ctx.arc(n.x, n.y, r + 4 / k, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();

    // labels fade in with zoom (bigger nodes first), as in Obsidian
    const fade = Number(Vault.index?.settings?.textFadeMultiplier) || 0;
    ctx.font = '11px "JetBrains Mono", Consolas, monospace';
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    for (const n of nodes) {
      const r = radius(n);
      const threshold = 1.3 - fade * 0.15 - (r - 3) * 0.12;
      let a = Math.max(0, Math.min(1, (k - threshold) / 0.45));
      if (focus) a = inFocus(n) ? a + (1 - a) * mix : a * (1 - mix);
      if (n === selected) a = 1;
      if (a < 0.03) continue;
      const [sx, sy] = toScreen(n);
      if (sx < -80 || sx > W + 80 || sy < -20 || sy > H + 20) continue;
      const text = n.label.length > 30 ? n.label.slice(0, 29) + "…" : n.label;
      ctx.globalAlpha = a;
      ctx.fillStyle = n === focus ? "#F2F0EA" : "#B4B6C2";
      ctx.fillText(text, sx, sy + r * k + 4);
    }
    ctx.globalAlpha = 1;
  }

  // ────────────────────────── interaction ──────────────────────────

  function nodeAt(sx, sy) {
    let best = null, dMin = Infinity;
    for (const n of nodes) {
      const [x, y] = toScreen(n);
      const d = Math.hypot(x - sx, y - sy);
      if (d < Math.max(7, radius(n) * k + 4) && d < dMin) { dMin = d; best = n; }
    }
    return best;
  }

  let down = null;
  function bindPointer() {
    canvas.addEventListener("pointerdown", (e) => {
      if (!nodes.length || placeholder) return;
      const r = canvas.getBoundingClientRect();
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      down = { x: e.clientX, y: e.clientY, node: nodeAt(sx, sy), moved: false, tx, ty, ctrl: e.ctrlKey || e.metaKey };
      canvas.setPointerCapture(e.pointerId);
      hidePreview();
    });

    canvas.addEventListener("pointermove", (e) => {
      if (!nodes.length || placeholder) return;
      const r = canvas.getBoundingClientRect();
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      if (down) {
        if (!down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) {
          down.moved = true;
          userMoved = true;
          if (down.node) sim.alphaTarget(0.3).restart();
          else canvas.classList.add("dragging");
        }
        if (!down.moved) return;
        if (down.node) {
          const [wx, wy] = toWorld(sx, sy);
          down.node.fx = wx; down.node.fy = wy;
        } else {
          tx = down.tx + (e.clientX - down.x); ty = down.ty + (e.clientY - down.y);
          redraw();
        }
        return;
      }
      const h = nodeAt(sx, sy);
      if (h !== hover) {
        hover = h;
        if (h) lastHover = h;
        canvas.classList.toggle("on-node", !!h);
        animateMix();
        schedulePreview(h);
      } else if (h) {
        placePreview(h);
      }
    });

    function release() {
      if (!down) return;
      const d = down;
      down = null;
      canvas.classList.remove("dragging");
      if (d.node && d.moved) {
        d.node.fx = d.node.fy = null;
        sim.alphaTarget(0);
      } else if (d.node && !d.moved) {
        openNode(d.node, d.ctrl);
      }
    }
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("pointerleave", () => {
      if (!down && hover) { hover = null; canvas.classList.remove("on-node"); animateMix(); }
      hidePreview();
    });

    canvas.addEventListener("wheel", (e) => {
      if (!nodes.length || placeholder) return;
      e.preventDefault();
      userMoved = true;
      const r = canvas.getBoundingClientRect();
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      const [wx, wy] = toWorld(sx, sy);
      k = Math.min(8, Math.max(0.12, k * Math.exp(-e.deltaY * 0.0015)));
      tx = sx - W / 2 - wx * k; ty = sy - H / 2 - wy * k;
      hidePreview();
      redraw();
    }, { passive: false });

    canvas.addEventListener("dblclick", (e) => {
      const r = canvas.getBoundingClientRect();
      if (nodeAt(e.clientX - r.left, e.clientY - r.top)) return;
      userMoved = false; fit(1); redraw();
    });
  }

  function openNode(n, inObsidian) {
    if (n.type === "tag") {
      if (!Vault.demo) location.href = `obsidian://search?vault=${encodeURIComponent(Vault.name)}&query=${encodeURIComponent("tag:" + n.label)}`;
      return;
    }
    if (n.type === "ghost") return;
    if (inObsidian && !Vault.demo) { location.href = Vault.obsidianUrl(n.id); return; }
    window.Reader?.open(n.id);
  }

  // ────────────────────────── hover preview ──────────────────────────

  let previewTimer = null;
  function hidePreview() {
    clearTimeout(previewTimer);
    preview.hidden = true;
  }
  function placePreview(n) {
    if (preview.hidden) return;
    const [sx, sy] = toScreen(n);
    const w = preview.offsetWidth, h = preview.offsetHeight;
    const off = radius(n) * k + 22;
    let x = sx + 14, y = sy + off;
    if (x + w > W - 8) x = sx - w - 14;
    if (y + h > H - 8) y = sy - h - 14;
    y = Math.max(8, y);
    preview.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
  function excerpt(text) {
    const { body } = Vault.frontmatter(text);
    return body
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/^#{1,6}\s+.*$/m, "")
      .replace(/!?\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
      .replace(/!?\[\[([^\]]+)\]\]/g, "$1")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/^>\s*\[![^\]]+\]\s*/gm, "")
      .replace(/[*_`>#=~|-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function schedulePreview(n) {
    hidePreview();
    if (!n || down) return;
    previewTimer = setTimeout(async () => {
      if (hover !== n) return;
      const title = UI.el("div", { class: "preview-title" }, n.label);
      const sub = UI.el("div", { class: "preview-path" },
        n.type === "note" ? `${n.id} · ${n.deg} link${n.deg === 1 ? "" : "s"}` : n.type === "tag" ? `tag · ${n.deg} notes` : "note not created yet");
      preview.replaceChildren(title, sub);
      if (n.type === "note" && !placeholder) {
        try {
          const t = await Vault.readNote(n.id, false);
          if (t != null && hover === n) {
            const e = excerpt(t);
            if (e) preview.append(UI.el("p", { class: "preview-text" }, e.length > 260 ? e.slice(0, 259) + "…" : e));
          }
        } catch (e) {}
      }
      if (hover !== n) return;
      preview.hidden = false;
      placePreview(n);
    }, 320);
  }

  // ────────────────────────── state, cache, buttons ──────────────────────────

  let savedPos = new Map();
  let saveTimer = null;
  function savePositions() {
    if (Vault.demo || placeholder || !Vault.name) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const pos = {};
      for (const n of nodes) pos[n.id] = [Math.round(n.x * 10) / 10, Math.round(n.y * 10) / 10];
      Store.set("graphPositions", { vault: Vault.name, pos });
    }, 400);
  }

  function updateInfo() {
    const ind = Vault.index;
    if (!ind || placeholder) { info.textContent = ""; return; }
    const min = Math.round((Date.now() - ind.ts) / 60000);
    const when = min < 1 ? "just now" : min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`;
    const nNotes = nodes.filter((n) => n.type === "note").length;
    info.textContent = `${nNotes} notes · ${links.length} links · read ${when}`;
  }

  function showVault() {
    placeholder = false;
    empty.hidden = true;
    vaultNameEl.textContent = Vault.name ? `Vault ${Vault.name}` : "";
    openObsidian.href = Vault.obsidianUrl();
    openObsidian.hidden = Vault.demo;
    btnRefresh.hidden = Vault.demo;
    btnChange.hidden = Vault.demo;
    recentEl.replaceChildren();
    const recent = [...Vault.index.notes].sort((a, b) => b.mtime - a.mtime).slice(0, C.recentNotes);
    if (recent.length) {
      recentEl.append(UI.el("span", { class: "recent-label" }, "Recent"));
      for (const r of recent) {
        const b = UI.el("button", { class: "note-chip", type: "button", title: r.path }, Vault.title(r.path));
        b.addEventListener("click", () => window.Reader?.open(r.path));
        recentEl.append(b);
      }
    }
    updateInfo();
  }

  async function loadOptions() {
    const settings = Vault.index?.settings || {};
    const saved = Vault.demo ? null : await Store.get("graphOptions");
    options = { ...optionsFromObsidian(settings), ...(saved && saved.vault === Vault.name ? saved : {}) };
    delete options.vault;
    renderFilters();
  }

  function showEmpty(text, label, action) {
    if (!Vault.index || placeholder || !nodes.length) {
      placeholder = true;
      const demoNodes = [];
      const demoLinks = [];
      let s = 7;
      const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 38; i++) demoNodes.push({ id: String(i), label: "", type: "note", col: i < 6 ? PALETTE[i] : GREY });
      for (let i = 1; i < 6; i++) demoLinks.push({ source: "0", target: String(i) });
      for (let i = 6; i < 38; i++) {
        demoLinks.push({ source: String(1 + Math.floor(rnd() * 5)), target: String(i) });
        if (rnd() < 0.3) demoLinks.push({ source: String(6 + Math.floor(rnd() * 32)), target: String(i) });
      }
      nodes = demoNodes;
      links = demoLinks.filter((l) => l.source !== l.target);
      adj = new Map(nodes.map((n) => [n.id, new Set()]));
      for (const l of links) { adj.get(l.source).add(l.target); adj.get(l.target).add(l.source); }
      nodes.forEach((n) => (n.deg = adj.get(n.id).size));
      options = options || optionsFromObsidian();
      startSimulation({}, true);
    }
    msg.textContent = text;
    btnConnect.textContent = label;
    btnConnect.onclick = action;
    btnConnect.disabled = !action;
    empty.hidden = false;
    info.textContent = "";
  }

  async function read() {
    btnRefresh.disabled = true;
    try {
      const ind = await Vault.scan((t) => (info.textContent = t));
      if (!ind.notes.length) {
        showEmpty(`No .md notes found in “${ind.vault}”. Did you pick the vault folder?`, "Choose another folder", choose);
        return;
      }
      const fresh = placeholder || !nodes.length;
      if (fresh) nodes = [];
      await loadOptions();
      build(fresh);
      showVault();
    } catch (e) {
      console.warn("[graph]", e);
      showEmpty("Can't read the vault: the folder may have been moved or renamed.", "Choose the folder again", choose);
    } finally {
      btnRefresh.disabled = false;
    }
  }

  async function choose() {
    if (!window.showDirectoryPicker) return;
    try {
      await Vault.choose();
      nodes = []; savedPos = new Map(); userMoved = false;
      window.Reader?.close();
      await read();
    } catch (e) {
      if (e.name !== "AbortError") console.warn("[graph]", e);
    }
  }

  window.Graph = {
    select(path) {
      selected = byId.get(path) || null;
      if (selected) {
        const [sx, sy] = toScreen(selected);
        if (sx < 40 || sx > W - 40 || sy < 40 || sy > H - 40) {
          userMoved = true;
          tx -= sx - W / 2; ty -= sy - H / 2;
        }
      }
      redraw();
    },
    deselect() { selected = null; redraw(); },

    async init() {
      C = App.config.graph;
      area = document.getElementById("graph-area");
      canvas = document.getElementById("graph");
      ctx = canvas.getContext("2d");
      empty = document.getElementById("graph-empty");
      msg = document.getElementById("graph-msg");
      btnConnect = document.getElementById("graph-connect");
      btnRefresh = document.getElementById("graph-refresh");
      btnChange = document.getElementById("graph-change");
      info = document.getElementById("graph-info");
      recentEl = document.getElementById("recent");
      vaultNameEl = document.getElementById("vault-name");
      openObsidian = document.getElementById("open-obsidian");
      filtersEl = document.getElementById("filter-options");
      preview = document.getElementById("preview");

      bindPointer();
      btnChange.addEventListener("click", choose);
      btnRefresh.addEventListener("click", async () => {
        if (!Vault.handle) return choose();
        if (await Vault.permission(true)) read();
      });
      new ResizeObserver(resize).observe(area);
      resize();
      setInterval(updateInfo, 60000);

      await Vault.load();
      const ps = Vault.demo ? null : await Store.get("graphPositions");
      if (ps && ps.vault === Vault.name && ps.pos && typeof ps.pos === "object") {
        savedPos = new Map(Object.entries(ps.pos).map(([id, [x, y]]) => [id, { x, y }]));
      }

      if (Vault.index) {
        await loadOptions();
        build(false);
        showVault();
      }
      if (Vault.demo) return;

      if (!window.showDirectoryPicker) {
        if (!Vault.index) showEmpty("This browser can't read local folders.", "Not available", null);
        return;
      }
      const h = Vault.handle;
      if (!h) {
        if (!Vault.index) showEmpty("Connect your Obsidian vault folder to see the graph of your notes. Access is read-only and stays on this computer.", "Connect vault", choose);
        return;
      }
      const stale = !Vault.index || Date.now() - Vault.index.ts > C.cacheMinutes * 60000;
      if (!stale) return;
      if (await Vault.permission(false)) {
        read();
      } else if (!Vault.index) {
        showEmpty(`The browser needs you to confirm access to the vault “${h.name}” again.`, "Allow access", async () => {
          if (await Vault.permission(true)) read();
        });
      }
    }
  };
})();
