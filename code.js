/* Code tab: editor with syntax highlighting + runner.
   JavaScript runs in a Web Worker, Python runs in-browser via Pyodide (lazy-loaded from a CDN),
   Java / C++ / C# need a remote runner (Judge0 or Piston compatible) configured under "Runner settings". */
(function () {
  "use strict";
  const root = document.getElementById("cx");
  if (!root) return;
  const LS = "faang-run-2027-code";
  const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
  const esc = s => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  const KW = {
    javascript: "async await break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return static super switch this throw try typeof var void while with yield true false null undefined",
    python: "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None self",
    java: "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static super switch synchronized this throw throws try var void volatile while true false null record",
    cpp: "alignas auto bool break case catch char class const constexpr continue default delete do double else enum explicit extern false float for friend goto if inline int long namespace new noexcept nullptr operator private protected public return short signed sizeof static struct switch template this throw true try typedef typename union unsigned using virtual void volatile while",
    csharp: "abstract as async await base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using var virtual void volatile while record"
  };
  const LANGS = {
    javascript: { name: "JavaScript", tab: 2, hash: false, jid: 63, file: "main.js", code: `// Runs in your browser. Read input with readline().\nconst name = readline() || "world";\nconsole.log("Hello, " + name + "!");\n\nfunction twoSum(nums, target) {\n  const seen = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const j = seen.get(target - nums[i]);\n    if (j !== undefined) return [j, i];\n    seen.set(nums[i], i);\n  }\n  return [];\n}\nconsole.log(twoSum([2, 7, 11, 15], 9));\n` },
    python: { name: "Python", tab: 4, hash: true, jid: 71, file: "main.py", pist: "python", code: `# Runs in your browser (first run downloads Python, ~10 MB).\nname = input() or "world"\nprint(f"Hello, {name}!")\n\ndef two_sum(nums, target):\n    seen = {}\n    for i, x in enumerate(nums):\n        if target - x in seen:\n            return [seen[target - x], i]\n        seen[x] = i\n    return []\n\nprint(two_sum([2, 7, 11, 15], 9))\n` },
    java: { name: "Java", tab: 4, hash: false, jid: 62, file: "Main.java", pist: "java", code: `import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        String name = in.hasNextLine() ? in.nextLine() : "world";\n        System.out.println("Hello, " + name + "!");\n\n        Map<Integer, Integer> seen = new HashMap<>();\n        int[] nums = {2, 7, 11, 15};\n        for (int i = 0; i < nums.length; i++) {\n            Integer j = seen.get(9 - nums[i]);\n            if (j != null) { System.out.println(j + " " + i); break; }\n            seen.put(nums[i], i);\n        }\n    }\n}\n` },
    cpp: { name: "C++", tab: 4, hash: false, jid: 54, file: "main.cpp", pist: "c++", code: `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    string name;\n    if (!getline(cin, name) || name.empty()) name = "world";\n    cout << "Hello, " << name << "!\\n";\n\n    vector<int> nums = {2, 7, 11, 15};\n    unordered_map<int, int> seen;\n    for (int i = 0; i < (int)nums.size(); i++) {\n        auto it = seen.find(9 - nums[i]);\n        if (it != seen.end()) { cout << it->second << " " << i << "\\n"; break; }\n        seen[nums[i]] = i;\n    }\n    return 0;\n}\n` },
    csharp: { name: "C#", tab: 4, hash: false, jid: 51, file: "Program.cs", pist: "csharp", code: `using System;\nusing System.Collections.Generic;\n\nclass Program\n{\n    static void Main()\n    {\n        string name = Console.ReadLine();\n        if (string.IsNullOrEmpty(name)) name = "world";\n        Console.WriteLine($"Hello, {name}!");\n\n        var seen = new Dictionary<int, int>();\n        int[] nums = { 2, 7, 11, 15 };\n        for (int i = 0; i < nums.Length; i++)\n        {\n            if (seen.TryGetValue(9 - nums[i], out int j)) { Console.WriteLine(j + " " + i); break; }\n            seen[nums[i]] = i;\n        }\n    }\n}\n` }
  };
  const ORDER = ["javascript", "python", "java", "cpp", "csharp"];
  const REMOTE = new Set(["java", "cpp", "csharp"]);

  /* ---------- state ---------- */
  const load = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } };
  let st = load();
  st.src = st.src || {}; st.cfg = st.cfg || { type: "godbolt", url: "", hn: "", hv: "" };
  st.lang = LANGS[st.lang] ? st.lang : "javascript";
  const persist = () => { try { localStorage.setItem(LS, JSON.stringify(st)); } catch (e) {} };

  /* ---------- highlighting ---------- */
  const setCache = {};
  const kwSet = l => setCache[l] || (setCache[l] = new Set(KW[l].split(" ")));
  function highlight(src, lang) {
    const kws = kwSet(lang), hash = LANGS[lang].hash;
    const re = new RegExp([
      hash ? "(#[^\\n]*)" : "(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$))",
      lang === "python" ? "(\"\"\"[\\s\\S]*?(?:\"\"\"|$)|'''[\\s\\S]*?(?:'''|$)|\"(?:\\\\.|[^\"\\\\\\n])*\"?|'(?:\\\\.|[^'\\\\\\n])*'?)"
        : lang === "javascript" ? "(`(?:\\\\[\\s\\S]|[^`\\\\])*`?|\"(?:\\\\.|[^\"\\\\\\n])*\"?|'(?:\\\\.|[^'\\\\\\n])*'?)"
        : "(\"(?:\\\\.|[^\"\\\\\\n])*\"?|'(?:\\\\.|[^'\\\\\\n])*'?)",
      "(\\b0x[0-9a-fA-F]+\\b|\\b\\d[\\d_]*\\.?\\d*(?:[eE][+-]?\\d+)?[fFlLuU]*\\b)",
      "([A-Za-z_$][\\w$]*)"
    ].join("|") + (lang === "cpp" ? "|(^[ \\t]*#[^\\n]*)" : ""), "gm");
    let out = "", last = 0, m;
    while ((m = re.exec(src))) {
      out += esc(src.slice(last, m.index)); last = re.lastIndex;
      const t = m[0];
      if (m[1] !== undefined) out += `<i class="c">${esc(t)}</i>`;
      else if (m[2] !== undefined) out += `<i class="s">${esc(t)}</i>`;
      else if (m[3] !== undefined) out += `<i class="n">${esc(t)}</i>`;
      else if (m[4] !== undefined) out += kws.has(t) ? `<i class="k">${esc(t)}</i>` : /^[A-Z]/.test(t) && lang !== "python" ? `<i class="t">${esc(t)}</i>` : esc(t);
      else if (m[5] !== undefined) out += `<i class="k">${esc(t)}</i>`;
      if (re.lastIndex === m.index) re.lastIndex++;
    }
    return out + esc(src.slice(last));
  }

  /* ---------- UI ---------- */
  const css = document.createElement("style");
  css.textContent = `
.cx-bar{margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.cx-bar select,.cx-bar button{height:38px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--fg);padding:0 12px;font:600 .85rem var(--body);cursor:pointer}
.cx-bar button:hover,.cx-bar select:hover{border-color:var(--accent)}
.cx-bar .run{background:var(--accent);border-color:var(--accent);color:var(--bg)}
.cx-bar .run[disabled]{opacity:.6;cursor:progress}
.cx-bar .sp{flex:1}
.cx-ed{position:relative;display:grid;grid-template-columns:auto 1fr;border:1px solid var(--line);border-radius:12px;background:var(--surface);overflow:hidden;height:min(56vh,520px);min-height:260px}
.cx-gut,.cx-pre,.cx-ta{font:500 13.5px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;tab-size:4;white-space:pre;margin:0;padding:12px 0}
.cx-gut{padding:12px 10px;text-align:right;color:var(--muted);background:var(--surface-2);overflow:hidden;user-select:none;min-width:38px}
.cx-wrap{position:relative;overflow:hidden}
.cx-pre,.cx-ta{position:absolute;inset:0;padding:12px 14px;overflow:auto;border:0;width:100%;height:100%}
.cx-pre{pointer-events:none;color:var(--fg)}
.cx-ta{background:transparent;color:transparent;caret-color:var(--fg);resize:none;outline:none;-webkit-text-fill-color:transparent;word-wrap:normal}
.cx-ta::selection{background:color-mix(in srgb,var(--accent) 30%,transparent);-webkit-text-fill-color:transparent}
.cx-pre i{font-style:normal}.cx-pre .k{color:var(--p3);font-weight:600}.cx-pre .s{color:var(--p2)}.cx-pre .n{color:var(--p4)}.cx-pre .t{color:var(--p1)}.cx-pre .c{color:var(--muted);font-style:italic}
.cx-io{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:12px;margin-top:12px}
@media(max-width:760px){.cx-io{grid-template-columns:1fr}}
.cx-io label{display:block;font:600 .72rem var(--mono,ui-monospace,monospace);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.cx-in,.cx-out{width:100%;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--fg);font:500 13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;padding:10px 12px;min-height:130px;max-height:320px;overflow:auto;white-space:pre-wrap;word-break:break-word;margin:0}
.cx-out .e{color:#d6453d}.cx-out .m{color:var(--muted)}
.cx-set{margin-top:14px;border:1px solid var(--line);border-radius:12px;background:var(--surface);padding:10px 14px}
.cx-set summary{cursor:pointer;font-weight:600;font-size:.88rem}
.cx-set .row{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-top:10px}
.cx-set input,.cx-set select{height:36px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--fg);padding:0 10px;font:500 .85rem var(--body);width:100%}
.cx-set p{font-size:.8rem;color:var(--muted);margin:8px 0 0}`;
  document.head.appendChild(css);

  root.innerHTML = `
  <div class="phead"><div class="eyebrow">Practice</div><h2>Code editor</h2><p>Write and run code without leaving the app. JavaScript and Python run right in your browser; Java, C++ and C# are compiled on Compiler Explorer (free, no setup, needs internet). Your code is saved per language on this device.</p></div>
  <div class="cx-bar">
    <select id="cxLang" aria-label="Language">${ORDER.map(k => `<option value="${k}">${LANGS[k].name}</option>`).join("")}</select>
    <button id="cxRun" class="run" type="button">Run ▶</button>
    <button id="cxReset" type="button">Reset</button>
    <button id="cxCopy" type="button">Copy</button>
    <span class="sp"></span><span id="cxHint" class="note" style="margin:0;font-size:.78rem">Ctrl/⌘ + Enter to run</span>
  </div>
  <div class="cx-ed"><pre class="cx-gut" id="cxGut" aria-hidden="true">1</pre><div class="cx-wrap"><pre class="cx-pre" id="cxPre" aria-hidden="true"></pre><textarea class="cx-ta" id="cxTa" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" aria-label="Code editor"></textarea></div></div>
  <div class="cx-io"><div><label for="cxIn">Input (stdin)</label><textarea class="cx-in" id="cxIn" spellcheck="false" placeholder="Optional. One value per line."></textarea></div><div><label>Output</label><pre class="cx-out" id="cxOut" aria-live="polite"><span class="m">Press Run to execute.</span></pre></div></div>
  <details class="cx-set" id="cxSet"><summary>Runner settings (optional, for Java, C++, C#)</summary>
    <div class="row"><select id="cxType" aria-label="Runner type"><option value="godbolt">Compiler Explorer (default, no setup)</option><option value="judge0">Judge0 compatible</option><option value="piston">Piston compatible</option></select><input id="cxUrl" placeholder="Runner URL, e.g. https://your-judge0.example.com" aria-label="Runner URL"><input id="cxHn" placeholder="Auth header name (optional)" aria-label="Auth header name"><input id="cxHv" type="password" placeholder="Auth header value (optional)" aria-label="Auth header value"></div>
    <p>You can leave this alone. By default Java, C++ and C# are sent to the free public Compiler Explorer (godbolt.org) to compile and run, which is rate-limited and meant for short programs. JavaScript and Python never leave your browser. To use your own Judge0 or Piston server instead, pick its type and enter the URL (it must allow requests from this site). The header value is stored only in this browser.</p></details>`;

  const $ = id => document.getElementById(id);
  const ta = $("cxTa"), pre = $("cxPre"), gut = $("cxGut"), out = $("cxOut"), runBtn = $("cxRun");

  function paint() {
    pre.innerHTML = highlight(ta.value, st.lang) + "\n";
    const n = ta.value.split("\n").length; gut.textContent = Array.from({ length: n }, (_, i) => i + 1).join("\n");
    pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; gut.scrollTop = ta.scrollTop;
  }
  function setLang(l) {
    if (ta.value && st.lang) st.src[st.lang] = ta.value;
    st.lang = l; ta.value = st.src[l] != null ? st.src[l] : LANGS[l].code; ta.style.tabSize = pre.style.tabSize = LANGS[l].tab;
    $("cxLang").value = l; paint(); persist();
    $("cxHint").textContent = REMOTE.has(l) ? "Runs online · Ctrl/⌘ + Enter" : "Runs in your browser · Ctrl/⌘ + Enter";
  }
  ta.addEventListener("input", () => { st.src[st.lang] = ta.value; persist(); paint(); });
  ta.addEventListener("scroll", () => { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; gut.scrollTop = ta.scrollTop; });
  ta.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); run(); return; }
    const s = ta.selectionStart, en = ta.selectionEnd, v = ta.value, ind = " ".repeat(LANGS[st.lang].tab);
    const edit = (text, a, b, caret) => { ta.setRangeText(text, a, b, "end"); if (caret != null) ta.selectionStart = ta.selectionEnd = caret; ta.dispatchEvent(new Event("input")); };
    if (e.key === "Tab") {
      e.preventDefault();
      if (s === en && !e.shiftKey) return edit(ind, s, en);
      const a = v.lastIndexOf("\n", s - 1) + 1, blk = v.slice(a, en), lines = blk.split("\n");
      const nb = lines.map(l => e.shiftKey ? l.replace(new RegExp("^ {1," + ind.length + "}"), "") : ind + l).join("\n");
      ta.setRangeText(nb, a, en, "select"); ta.dispatchEvent(new Event("input"));
    } else if (e.key === "Enter" && s === en) {
      e.preventDefault();
      const a = v.lastIndexOf("\n", s - 1) + 1, line = v.slice(a, s), cur = line.match(/^\s*/)[0];
      const opens = /[{(\[:]\s*$/.test(line) && (st.lang === "python" ? /:\s*$/.test(line) : /[{(\[]\s*$/.test(line));
      const nxt = v[s], closes = opens && st.lang !== "python" && /[}\])]/.test(nxt || "");
      if (closes) { const t = "\n" + cur + ind + "\n" + cur; edit(t, s, en, s + 1 + cur.length + ind.length); }
      else edit("\n" + cur + (opens ? ind : ""), s, en);
    } else if (["{", "(", "[", '"', "'"].includes(e.key) && s === en) {
      const close = { "{": "}", "(": ")", "[": "]", '"': '"', "'": "'" }[e.key], prev = v[s - 1] || "", nxt = v[s] || "";
      if ((e.key === '"' || e.key === "'") && (/\w/.test(prev) || nxt === e.key)) { if (nxt === e.key) { e.preventDefault(); ta.selectionStart = ta.selectionEnd = s + 1; } return; }
      if (nxt && /\w/.test(nxt)) return;
      e.preventDefault(); edit(e.key + close, s, en, s + 1);
    } else if ([")", "]", "}"].includes(e.key) && s === en && v[s] === e.key) { e.preventDefault(); ta.selectionStart = ta.selectionEnd = s + 1; }
  });
  $("cxLang").onchange = e => setLang(e.target.value);
  $("cxReset").onclick = () => { if (confirm("Replace the editor with the " + LANGS[st.lang].name + " starter code?")) { delete st.src[st.lang]; ta.value = LANGS[st.lang].code; ta.dispatchEvent(new Event("input")); } };
  $("cxCopy").onclick = async () => { try { await navigator.clipboard.writeText(ta.value); $("cxCopy").textContent = "Copied"; } catch (e) { ta.select(); document.execCommand && document.execCommand("copy"); $("cxCopy").textContent = "Copied"; } setTimeout(() => $("cxCopy").textContent = "Copy", 1200); };

  /* settings */
  const cfgEls = { type: $("cxType"), url: $("cxUrl"), hn: $("cxHn"), hv: $("cxHv") };
  Object.entries(cfgEls).forEach(([k, el]) => { el.value = st.cfg[k] || ""; el.oninput = el.onchange = () => { st.cfg[k] = el.value.trim(); persist(); }; });

  /* ---------- output ---------- */
  let buf = "";
  const show = (txt, cls) => { const sp = document.createElement("span"); if (cls) sp.className = cls; sp.textContent = txt; out.appendChild(sp); out.scrollTop = out.scrollHeight; };
  const clearOut = () => { out.textContent = ""; };
  const busy = (b, label) => { runBtn.disabled = b; runBtn.textContent = b ? (label || "Running…") : "Run ▶"; };

  /* ---------- runners ---------- */
  const JS_WORKER = `
    const AF = Object.getPrototypeOf(async function(){}).constructor;
    onmessage = async e => {
      const { code, stdin } = e.data, lines = stdin.split("\\n"); let i = 0;
      const fmt = a => a.map(x => { if (typeof x === "string") return x; try { return typeof x === "object" && x !== null ? JSON.stringify(x) : String(x); } catch (_) { return String(x); } }).join(" ");
      const log = (...a) => postMessage({ t: "out", s: fmt(a) + "\\n" });
      self.console = { log, info: log, debug: log, warn: (...a) => postMessage({ t: "err", s: fmt(a) + "\\n" }), error: (...a) => postMessage({ t: "err", s: fmt(a) + "\\n" }) };
      self.readline = () => i < lines.length ? lines[i++] : null;
      try { await new AF(code)(); } catch (err) { postMessage({ t: "err", s: String(err && err.stack || err) + "\\n" }); }
      postMessage({ t: "done" });
    };`;
  const PY_WORKER = `
    let py = null;
    onmessage = async e => {
      const { code, stdin, base } = e.data, lines = stdin.split("\\n"); let i = 0;
      try {
        if (!py) { postMessage({ t: "status", s: "Loading Python (first run only)…" }); importScripts(base + "pyodide.js"); py = await loadPyodide({ indexURL: base }); }
        postMessage({ t: "ready" });
        py.setStdout({ batched: s => postMessage({ t: "out", s: s + "\\n" }) });
        py.setStderr({ batched: s => postMessage({ t: "err", s: s + "\\n" }) });
        py.setStdin({ stdin: () => i < lines.length ? lines[i++] : null });
        await py.runPythonAsync(code);
      } catch (err) { postMessage({ t: "err", s: String(err && err.message || err) + "\\n" }); }
      postMessage({ t: "done" });
    };`;
  let worker = null, workerLang = null;
  function killWorker() { if (worker) { worker.terminate(); worker = null; } }
  function runLocal(lang, code, stdin) {
    return new Promise(resolve => {
      if (!worker || workerLang !== lang) { killWorker(); worker = new Worker(URL.createObjectURL(new Blob([lang === "python" ? PY_WORKER : JS_WORKER], { type: "text/javascript" }))); workerLang = lang; }
      const w = worker, limit = lang === "python" ? 20000 : 6000; let timer = null, any = false;
      const arm = () => { clearTimeout(timer); timer = setTimeout(() => { killWorker(); show("\nStopped: ran longer than " + limit / 1000 + " s.\n", "e"); resolve(); }, limit); };
      if (lang === "javascript") arm();
      w.onmessage = ev => {
        const m = ev.data;
        if (m.t === "status") busy(true, "Loading…"), show(m.s + "\n", "m");
        else if (m.t === "ready") { busy(true); arm(); }
        else if (m.t === "out") { any = true; show(m.s); }
        else if (m.t === "err") { any = true; show(m.s, "e"); }
        else if (m.t === "done") { clearTimeout(timer); if (!any) show("(no output)", "m"); resolve(); }
      };
      w.onerror = ev => { clearTimeout(timer); show((ev.message || "Worker error") + "\n", "e"); if (lang === "python") show("Could not load Python. Check your internet connection and try again.\n", "m"); killWorker(); resolve(); };
      w.postMessage({ code, stdin, base: PYODIDE });
    });
  }
  const GB = "https://godbolt.org/api", GB_LANG = { java: "java", cpp: "c++", csharp: "csharp" }, gbPick = {};
  const txt = a => Array.isArray(a) ? a.map(x => (x && x.text != null ? x.text : String(x))).join("\n") + (a.length ? "\n" : "") : "";
  async function gbCompiler(lang, signal) {
    if (gbPick[lang]) return gbPick[lang];
    const r = await fetch(`${GB}/compilers/${encodeURIComponent(GB_LANG[lang])}?fields=id,name`, { headers: { Accept: "application/json" }, signal });
    if (!r.ok) throw new Error("Compiler Explorer replied " + r.status);
    const list = await r.json(), ver = n => ((n.match(/\d+(?:\.\d+)*/g) || ["0"]).pop()).split(".").map(x => +x || 0);
    const cmp = (a, b) => { const x = ver(a.name), y = ver(b.name); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; };
    const stable = n => !/trunk|snapshot|nightly|assertions|main|master|experimental|preview|rc|beta|clang|msvc|icc|zapcc|arm|riscv|mips|power|sparc|s390|avr|msp|cross|wasm|gccgo|djgpp|elf|ppc|loongarch|sh|bpf|kvx|m68k|hexagon|vax/i.test(n);
    const pool = list.filter(c => lang === "cpp" ? /^x86-64 gcc \d/.test(c.name) : lang === "java" ? /^(java|openjdk)\b/i.test(c.name) || /jdk/i.test(c.name) : /\.NET|dotnet|csharp/i.test(c.name)).filter(c => stable(c.name));
    const best = (pool.length ? pool : list).sort(cmp)[0];
    if (!best) throw new Error("No compiler available for " + L(lang).name);
    return gbPick[lang] = best.id;
  }
  const L = k => LANGS[k];
  async function runGodbolt(lang, code, stdin) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 40000);
    try {
      const id = await gbCompiler(lang, ctl.signal);
      const r = await fetch(`${GB}/compiler/${encodeURIComponent(id)}/compile`, {
        method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ source: code, lang: GB_LANG[lang], options: { userArguments: lang === "cpp" ? "-O1 -std=c++17" : "", executeParameters: { args: [], stdin }, compilerOptions: { executorRequest: true }, filters: { execute: true }, tools: [], libraries: [] } })
      });
      if (!r.ok) throw new Error("Compiler Explorer replied " + r.status + (r.status === 429 ? " (too many requests, wait a moment)" : ""));
      const j = await r.json(), b = j.buildResult || {};
      const build = txt(b.stdout) + txt(b.stderr), o = txt(j.stdout), e = txt(j.stderr);
      if (j.didExecute === false || (b.code && b.code !== 0)) { show(build || "Compilation failed.\n", "e"); return; }
      if (o) show(o); if (e) show(e, "e");
      if (j.code) show("\nExit code " + j.code + "\n", "m");
      if (!o && !e && !j.code) show("(no output)", "m");
      if (build.trim() && /warning/i.test(build) && !o && !e) show("\n" + build, "m");
    } catch (e) {
      show((e.name === "AbortError" ? "Timed out after 40 s." : "Could not reach Compiler Explorer: " + e.message) + "\nYou need internet access. If this keeps failing, set your own runner under Runner settings.\n", "e");
    } finally { clearTimeout(t); }
  }
  async function runRemote(lang, code, stdin) {
    if (st.cfg.type === "godbolt" || !st.cfg.url) return runGodbolt(lang, code, stdin);
    const c = st.cfg, base = (c.url || "").replace(/\/+$/, "");
    const headers = { "Content-Type": "application/json" }; if (c.hn && c.hv) headers[c.hn] = c.hv;
    const L = LANGS[lang]; let res;
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 30000);
    try {
      if (c.type === "piston") {
        const r = await fetch(base + "/execute", { method: "POST", headers, signal: ctl.signal, body: JSON.stringify({ language: L.pist, version: "*", files: [{ name: L.file, content: code }], stdin }) });
        if (!r.ok) throw new Error("Runner replied " + r.status + " " + (await r.text()).slice(0, 200));
        const j = await r.json(); res = { out: j.run && j.run.stdout, err: (j.compile && j.compile.code ? j.compile.output : "") + ((j.run && j.run.stderr) || ""), status: j.run && j.run.code ? "Exit code " + j.run.code : "" };
      } else {
        const r = await fetch(base + "/submissions?base64_encoded=false&wait=true", { method: "POST", headers, signal: ctl.signal, body: JSON.stringify({ source_code: code, language_id: L.jid, stdin }) });
        if (!r.ok) throw new Error("Runner replied " + r.status + " " + (await r.text()).slice(0, 200));
        const j = await r.json(); res = { out: j.stdout, err: (j.compile_output || "") + (j.stderr || "") + (j.message || ""), status: j.status && j.status.id > 3 ? j.status.description : "" };
      }
    } catch (e) { show((e.name === "AbortError" ? "Runner timed out after 30 s." : "Could not reach the runner: " + e.message) + "\nCheck the URL, your connection, and that the runner allows requests from this site (CORS).\n", "e"); return; }
    finally { clearTimeout(t); }
    if (res.out) show(res.out); if (res.err) show(res.err, "e"); if (res.status) show("\n" + res.status + "\n", "m");
    if (!res.out && !res.err && !res.status) show("(no output)", "m");
  }
  async function run() {
    if (runBtn.disabled) return;
    const lang = st.lang; clearOut(); busy(true);
    try { await (REMOTE.has(lang) ? runRemote : runLocal)(lang, ta.value, $("cxIn").value); }
    catch (e) { show(String(e) + "\n", "e"); }
    busy(false);
  }
  runBtn.onclick = run;
  setLang(st.lang);
  window.cxHighlight = highlight; // for tests
})();
