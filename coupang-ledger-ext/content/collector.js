// coupang.com 페이지에서 실행. 두 가지 명령: PROBE(구조 점검), COLLECT(전체 수집).
const mask = (s) => String(s).replace(/\d{9,}/g, (m) => "#".repeat(m.length));
let ctrl = null;

function probe() {
  const res = performance.getEntriesByType("resource")
    .filter((e) => ["fetch", "xmlhttprequest"].includes(e.initiatorType))
    .map((e) => { const u = new URL(e.name); return { host: u.host, path: mask(u.pathname), queryKeys: [...u.searchParams.keys()] }; });
  const yearish = [...document.querySelectorAll("select, button, a, li, option, [role=tab], [role=option]")]
    .filter((el) => /20\d\d\s*년?/.test(el.textContent || "") && (el.textContent || "").length < 20)
    .slice(0, 30).map((el) => ({ tag: el.tagName, cls: String(el.className).slice(0, 80), text: el.textContent.trim(), role: el.getAttribute("role") }));
  const pager = [...document.querySelectorAll("a, button")]
    .filter((el) => /^(다음|이전|next|prev|\d{1,3})$/i.test((el.textContent || "").trim()) || /next|prev|paging|pagination/i.test(String(el.className)))
    .slice(0, 20).map((el) => ({ tag: el.tagName, cls: String(el.className).slice(0, 80), text: el.textContent.trim().slice(0, 10) }));
  const orderNodes = [...document.querySelectorAll("*")].filter((el) => !el.children.length && /\b\d{13}\b/.test(el.textContent || "")).length;
  return { url: { host: location.host, path: mask(location.pathname), queryKeys: [...new URLSearchParams(location.search).keys()] },
    requests: res, yearCandidates: yearish, pagerCandidates: pager, leafNodesWithOrderNo: orderNodes,
    note: "주문번호·쿠키·토큰은 포함하지 않음(숫자 9자리 이상은 # 처리)" };
}

chrome.runtime.onMessage.addListener((msg, _s, send) => {
  if (msg?.type === "PROBE") { send({ ok: true, data: probe() }); return; }
  if (msg?.type === "ABORT") { ctrl?.abort(); send({ ok: true }); return; }
  if (msg?.type === "COLLECT") {
    ctrl = new AbortController();
    (async () => {
      const [{ collectAll }, { adapter }] = await Promise.all([
        import(chrome.runtime.getURL("lib/collect.js")), import(chrome.runtime.getURL("lib/adapter.js"))]);
      const out = await collectAll(adapter, { signal: ctrl.signal, onProgress: (p) => chrome.runtime.sendMessage({ type: "PROGRESS", ...p }) });
      await chrome.runtime.sendMessage({ type: "ROWS", rows: out.rows });
      chrome.runtime.sendMessage({ type: "DONE", perYear: out.perYear, aborted: out.aborted });
    })().catch((e) => chrome.runtime.sendMessage({ type: "ERROR", message: String(e.message || e) }));
    send({ ok: true });
  }
});
