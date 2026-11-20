/* Books: the PDF library, converted into native chapter pages. Routes: #lib, #lib/<book>, #lib/<book>/<chapter>[?p=<pdfPage>] */
(function () {
  "use strict";
  const LS = "faang-run-2027";
  const K = { read: LS + "-bk-read", marks: LS + "-bk-marks", last: LS + "-bk-last" };
  const root = document.getElementById("lb");
  if (!root) return;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const read = new Set(store.get(K.read, []));
  const marks = new Set(store.get(K.marks, []));
  const saveRead = () => store.set(K.read, [...read]);
  const saveMarks = () => store.set(K.marks, [...marks]);
  const mins = w => Math.max(1, Math.round(w / 220));

  /* ---------- data ---------- */
  let IX = null, ixP = null;
  const books = {}, bookP = {};
  function loadIndex() {
    return ixP || (ixP = fetch("lib/index.json").then(r => { if (!r.ok) throw new Error("index"); return r.json(); }).then(j => (IX = j)).catch(e => { ixP = null; throw e; }));
  }
  function loadBook(id) {
    return bookP[id] || (bookP[id] = fetch("lib/" + id + "/book.json").then(r => { if (!r.ok) throw new Error("book"); return r.json(); }).then(j => (books[id] = j)).catch(e => { delete bookP[id]; throw e; }));
  }
  const bookMeta = id => IX.books.find(b => b.id === id);
  const hue = b => `--hue:${b.color}`;
  const doneIn = (id, n) => { let c = 0; for (let i = 0; i < n; i++) if (read.has(id + "/" + i)) c++; return c; };

  /* ---------- code highlighting (reuses the study library highlighter) ---------- */
  function guess(t) {
    if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|WITH|EXPLAIN)\b/im.test(t) && /\b(FROM|INTO|TABLE|SET|VALUES|INDEX)\b/i.test(t)) return "sql";
    if (/^\s*[\{\[]\s*$/m.test(t) && /"[\w-]+"\s*:/.test(t)) return "json";
    if (/^\s*(\$ |mvn |docker |kubectl |helm |git |curl |sudo |npm )/m.test(t)) return "bash";
    if (/^\s*[\w.-]+:\s*(\S.*)?$/m.test(t) && !/[;{}]/.test(t) && t.split("\n").length > 2) return "yaml";
    if (/[;{}]/.test(t) || /\b(public|private|class|void|return|import|new|int|String)\b/.test(t)) return "java";
    return "text";
  }
  function enhance(scope) {
    scope.querySelectorAll(".cols[style*='--gt']").forEach(c => {
      const v = c.style.getPropertyValue("--gt").trim();
      if (v && !v.includes("minmax")) c.style.setProperty("--gt", v.split(/\s+/).map(x => "minmax(0," + x + ")").join(" "));
    });
    const hl = window.sxHl;
    scope.querySelectorAll("pre.code > code").forEach(c => {
      if (c.dataset.hl) return; c.dataset.hl = "1";
      const t = c.textContent, lang = guess(t);
      if (hl && lang !== "text" && t.length < 12000) { try { c.innerHTML = hl(t, lang); } catch (e) {} }
    });
  }

  /* ---------- routing ---------- */
  function parse() {
    const h = decodeURIComponent((location.hash || "").slice(1));
    if (h !== "lib" && !h.startsWith("lib/")) return null;
    const [path, qs] = h.slice(3).replace(/^\//, "").split("?");
    const [book, ch] = path.split("/");
    const sp = new URLSearchParams(qs || "");
    return { book: book || "", ch: ch === undefined || ch === "" ? null : +ch, p: sp.get("p") };
  }
  const go = h => { if (location.hash === h) route(); else location.hash = h; };
  const tabNow = () => { try { return tab; } catch (e) { return ""; } };
  window.addEventListener("hashchange", () => { if (parse()) { if (window.showTab && tabNow() !== "lib") window.showTab("lib"); route(); } });
  root.addEventListener("click", e => {
    const a = e.target.closest("a[href^='#lib']");
    if (a) { e.preventDefault(); go(a.getAttribute("href")); return; }
    const im = e.target.closest(".lbk figure.fig img");
    if (im) zoom(im);
  });
  function zoom(im) {
    const o = document.createElement("div"); o.className = "lb-zoom";
    const w = Math.min(parseInt(im.getAttribute("width") || "0", 10) / 2 || 900, 1800);
    o.innerHTML = `<b>Close ✕</b><img src="${im.currentSrc || im.src}" alt="" style="width:${Math.max(w, Math.min(innerWidth - 24, 900))}px">`;
    o.onclick = () => o.remove();
    document.body.appendChild(o);
  }

  /* ---------- chrome ---------- */
  function pill() {
    if (!IX) return "";
    let n = 0, d = 0;
    IX.books.forEach(b => { n += b.chapters; d += doneIn(b.id, b.chapters); });
    const p = n ? Math.round(d / n * 100) : 0;
    return `<span class="sx-pill"><b>${p}%</b> read</span>`;
  }
  function top() {
    return `<div class="sx-top"><a class="sx-home" href="#lib">Books</a>
      <div class="sx-search"><input id="lbQ" type="search" placeholder="Search all books" autocomplete="off" aria-label="Search all books"><div class="sx-results" id="lbRes" hidden></div></div>${pill()}</div>`;
  }

  /* ---------- search (loads each book's text on first use) ---------- */
  const texts = {}; let textsP = null;
  function loadTexts(onProg) {
    if (textsP) return textsP;
    let n = 0;
    return (textsP = Promise.all(IX.books.map(b => fetch("lib/" + b.id + "/search.json").then(r => r.json()).then(j => { texts[b.id] = j; if (onProg) onProg(++n, IX.books.length); }))).catch(e => { textsP = null; throw e; }));
  }
  function wireSearch() {
    const q = document.getElementById("lbQ"), res = document.getElementById("lbRes"); if (!q) return;
    let tmr;
    const run = async () => {
      const terms = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.length) { res.hidden = true; return; }
      res.hidden = false;
      if (!textsP) res.innerHTML = `<div class="sx-none">Loading the books for search…</div>`;
      try { await loadTexts(); } catch (e) { res.innerHTML = `<div class="sx-none">Search needs the books to be downloaded once. Check your connection.</div>`; return; }
      const hits = [];
      for (const b of IX.books) {
        const meta = books[b.id];
        for (const [k, txt] of texts[b.id]) {
          const low = txt.toLowerCase();
          if (!terms.every(t => low.includes(t))) continue;
          const title = meta ? meta.chapters[k].t : "";
          const tl = title.toLowerCase();
          const i = low.indexOf(terms[0]);
          hits.push({ b, k, title, score: terms.reduce((s, t) => s + (tl.includes(t) ? 5 : 0) + Math.min(5, low.split(t).length - 1) * .3, 0), i, txt });
        }
      }
      hits.sort((a, b) => b.score - a.score);
      const shown = hits.slice(0, 14);
      res.innerHTML = shown.length ? shown.map(h => {
        const from = Math.max(0, h.i - 50), sn = esc(h.txt.slice(from, h.i + 110)).replace(new RegExp("(" + terms[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>");
        return `<a href="#lib/${h.b.id}/${h.k}" class="sx-hit"><span class="sx-kind">${esc(h.b.short || h.b.title.split(" ").slice(0, 3).join(" "))}</span><b>${esc(h.title || "Chapter " + (h.k + 1))}</b><small>${h.b.chapters} ch</small><span class="lb-snip">${from ? "…" : ""}${sn}…</span></a>`;
      }).join("") + (hits.length > 14 ? `<div class="sx-none">${hits.length - 14} more chapters match. Add a word to narrow it down.</div>` : "") : `<div class="sx-none">No matches</div>`;
    };
    // make sure book titles are loaded so chapter names show in results
    q.addEventListener("focus", () => { Promise.all(IX.books.map(b => loadBook(b.id))).catch(() => {}); loadTexts().catch(() => {}); });
    q.addEventListener("input", () => { clearTimeout(tmr); tmr = setTimeout(run, 120); });
    q.addEventListener("keydown", e => { if (e.key === "Escape") { q.value = ""; res.hidden = true; } });
    res.addEventListener("click", () => { res.hidden = true; q.value = ""; });
  }

  /* ---------- views ---------- */
  function viewHome() {
    const last = store.get(K.last, null);
    const lb = last && bookMeta(last.b);
    const cont = lb ? `<a class="sx-cont" href="#lib/${last.b}/${last.k}"><small>Continue where you left off</small><b>${esc(last.t || "Chapter " + (last.k + 1))}</b><span>${esc(lb.title)}</span></a>` : "";
    const cats = [];
    IX.books.forEach(b => { let c = cats.find(x => x.n === b.cat); if (!c) cats.push(c = { n: b.cat, b: [] }); c.b.push(b); });
    const totalCh = IX.books.reduce((n, b) => n + b.chapters, 0), totalPg = IX.books.reduce((n, b) => n + b.pages, 0);
    const grid = cats.map(c => `<div class="sx-lib"><h3>${esc(c.n)}</h3><div class="sx-grid">` + c.b.map(b => {
      const d = doneIn(b.id, b.chapters);
      return `<a class="sx-card lb-card" href="#lib/${b.id}" style="${hue(b)}"><span class="tag">${b.pages} pages</span><b>${esc(b.title)}</b><span>${esc(b.sub)}</span><em>${b.chapters} chapters · ${Math.round(b.words / 220 / 60 * 10) / 10 || 1} h read</em><div class="bar"><i style="width:${b.chapters ? d / b.chapters * 100 : 0}%"></i></div></a>`;
    }).join("") + `</div></div>`).join("");
    return top() + `<div class="sx-page"><div class="phead"><div class="eyebrow">Your notes, as web pages</div><h2>Books</h2><p>${IX.books.length} books with ${totalCh} chapters and ${totalPg.toLocaleString()} pages: system design, architecture, DSA patterns, Java and Spring, databases, papers and interview prep. Everything is readable on any screen, searchable and works offline.</p></div>${cont}${grid}</div>`;
  }

  async function viewBook(id) {
    const m = bookMeta(id), b = await loadBook(id), n = b.chapters.length, d = doneIn(id, n);
    const last = store.get(K.last, null), resume = last && last.b === id ? last.k : null;
    let g = null, rows = "";
    b.chapters.forEach((c, i) => {
      if (c.g !== g) { g = c.g; if (g) rows += `<div class="lb-group">${esc(g)}</div>`; }
      rows += `<a class="sx-row${read.has(id + "/" + i) ? " is-done" : ""}" href="#lib/${id}/${i}"><span class="n">${String(i + 1).padStart(2, "0")}</span><span class="t">${esc(c.t)}</span><span class="m">p. ${c.p0}${c.p1 > c.p0 ? "–" + c.p1 : ""} · ${mins(c.w)} min</span><span class="ck" aria-hidden="true"></span></a>`;
    });
    const first = read.has(id + "/0") && resume == null ? 0 : (resume != null ? resume : 0);
    return top() + `<div class="sx-page" style="${hue(m)}"><nav class="sx-crumbs"><a href="#lib">Books</a><span>/</span><em>${esc(m.title)}</em></nav>
      <div class="lb-head"><div class="eyebrow" style="color:var(--hue)">${esc(m.cat)} · ${m.pages} pages</div><h1>${esc(m.title)}</h1><p>${esc(m.sub)}</p>
      <div class="sx-prog"><div class="bar"><i style="width:${n ? d / n * 100 : 0}%"></i></div><span>${d} of ${n} chapters read</span></div>
      <div class="lb-meta" style="margin-top:12px"><a class="sx-btn primary" href="#lib/${id}/${first}">${resume != null ? "Continue reading" : "Start reading"}</a><button class="sx-btn" id="lbOff" type="button">Save for offline</button><span id="lbOffMsg"></span></div></div>
      <div class="sx-rows" style="${hue(m)}">${rows}</div></div>`;
  }

  async function viewChapter(id, k, p) {
    const m = bookMeta(id), b = await loadBook(id), c = b.chapters[k];
    if (!c) return viewBook(id);
    const r = await fetch(`lib/${id}/${k}.html`); if (!r.ok) throw new Error("chapter");
    const body = await r.text();
    store.set(K.last, { b: id, k, t: c.t });
    const key = id + "/" + k, prev = b.chapters[k - 1], next = b.chapters[k + 1];
    const pager = `<nav class="pager sx-pager">${prev ? `<a class="pg prev" href="#lib/${id}/${k - 1}"><small>Previous</small><span>${esc(prev.t)}</span></a>` : "<span></span>"}${next ? `<a class="pg next" href="#lib/${id}/${k + 1}"><small>Next</small><span>${esc(next.t)}</span></a>` : "<span></span>"}</nav>`;
    return top() + `<article class="sx-doc" style="${hue(m)}"><nav class="sx-crumbs"><a href="#lib">Books</a><span>/</span><a href="#lib/${id}">${esc(m.title)}</a></nav>
      <header class="lb-head"><div class="eyebrow" style="color:var(--hue)">${esc(c.g || m.cat)} · ${k + 1} of ${b.chapters.length}</div><h1>${esc(c.t)}</h1>
      <div class="lb-meta"><span>${c.p1 > c.p0 ? `Pages ${c.p0}–${c.p1}` : `Page ${c.p0}`}</span><span>${mins(c.w)} min read</span>
        <button type="button" class="sx-toggle" id="lbDone" aria-pressed="${read.has(key)}">${read.has(key) ? "Read ✓" : "Mark as read"}</button>
        <button type="button" class="sx-toggle icon" id="lbMark" aria-pressed="${marks.has(key)}" aria-label="Bookmark">${marks.has(key) ? "★" : "☆"}</button></div></header>
      <div id="lbToc"></div><div class="lbk" id="lbBody">${body}</div>${pager}</article>`;
  }

  function afterChapter(id, k, p) {
    const body = document.getElementById("lbBody"); if (!body) return;
    enhance(body);
    // on-this-page list from headings
    const hs = [...body.querySelectorAll("h1,h2,h3")].filter(h => h.textContent.trim().length > 1);
    hs.forEach((h, i) => h.id = "h" + i);
    if (hs.length >= 4) {
      document.getElementById("lbToc").innerHTML = `<details class="lb-toc"><summary>On this page · ${hs.length}</summary><ol style="list-style:none;padding:0">${hs.map((h, i) => `<li class="${h.tagName === "H3" ? "l3" : ""}"><a href="#" data-h="h${i}">${esc(h.textContent.trim())}</a></li>`).join("")}</ol></details>`;
      document.getElementById("lbToc").onclick = e => { const a = e.target.closest("a[data-h]"); if (!a) return; e.preventDefault(); const t = document.getElementById(a.dataset.h); if (t) { t.scrollIntoView({ behavior: "smooth", block: "start" }); a.closest("details").open = false; } };
    }
    const key = id + "/" + k;
    const d = document.getElementById("lbDone"), mk = document.getElementById("lbMark");
    if (d) d.onclick = () => { read.has(key) ? read.delete(key) : read.add(key); saveRead(); d.setAttribute("aria-pressed", read.has(key)); d.textContent = read.has(key) ? "Read ✓" : "Mark as read"; };
    if (mk) mk.onclick = () => { marks.has(key) ? marks.delete(key) : marks.add(key); saveMarks(); mk.setAttribute("aria-pressed", marks.has(key)); mk.textContent = marks.has(key) ? "★" : "☆"; };
    if (p) { const t = document.getElementById("p" + p); if (t) setTimeout(() => t.scrollIntoView({ block: "start" }), 60); }
  }

  async function saveBook(id) {
    const btn = document.getElementById("lbOff"), msg = document.getElementById("lbOffMsg"); if (!btn) return;
    btn.disabled = true;
    try {
      const b = await loadBook(id), n = b.chapters.length, imgs = new Set();
      for (let i = 0; i < n; i++) {
        const t = await fetch(`lib/${id}/${i}.html`).then(r => r.text());
        for (const m of t.matchAll(/src="(lib\/[^"]+)"/g)) imgs.add(m[1]);
        msg.textContent = ` Chapters ${i + 1} of ${n}…`;
      }
      const list = [...imgs]; let done = 0;
      for (let i = 0; i < list.length; i += 6) {
        await Promise.all(list.slice(i, i + 6).map(u => fetch(u).then(r => r.blob()).catch(() => null)));
        done = Math.min(list.length, i + 6); msg.textContent = ` Diagrams ${done} of ${list.length}…`;
      }
      msg.textContent = " Saved on this device.";
    } catch (e) { msg.textContent = " Couldn't download everything. Check your connection."; btn.disabled = false; }
  }

  let busy = 0;
  function scrollTop() { const el = document.getElementById("tab-lib"); if (!el) return; const nav = document.querySelector("nav.tabs"), off = nav && nav.offsetHeight ? nav.offsetHeight : 0; const y = el.getBoundingClientRect().top + scrollY - off - 4; if (innerWidth <= 760 || scrollY > y) scrollTo(0, Math.max(0, y)); }
  async function route() {
    const r = parse() || { book: "", ch: null, p: null }, my = ++busy; root.dataset.ready = "1";
    root.innerHTML = `<div class="sx-loading">Loading…</div>`;
    try {
      await loadIndex();
      let html, after = null;
      if (!r.book || !bookMeta(r.book)) { html = viewHome(); }
      else if (r.ch == null || isNaN(r.ch)) { html = await viewBook(r.book); after = () => { const b = document.getElementById("lbOff"); if (b) b.onclick = () => saveBook(r.book); }; }
      else { html = await viewChapter(r.book, r.ch, r.p); after = () => afterChapter(r.book, r.ch, r.p); }
      if (my !== busy) return;
      root.innerHTML = html; wireSearch(); if (after) after();
      if (!r.p) scrollTop();
    } catch (e) {
      if (my !== busy) return;
      root.innerHTML = `<div class="sx-empty"><b>Couldn't load this page</b>Open it once while online so it can be saved for offline use.<div style="margin-top:12px"><button class="sx-btn" id="lbRetry">Try again</button></div></div>`;
      const b = document.getElementById("lbRetry"); if (b) b.onclick = () => { ixP = null; route(); };
    }
  }
  window.libRoute = route;
  if (tabNow() === "lib") route();
  window.libStats = () => IX ? { books: IX.books.length, read: read.size } : null;
})();
