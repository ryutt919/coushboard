const $ = (id) => document.getElementById(id), st = $("status");
async function tab() { const [t] = await chrome.tabs.query({ active: true, currentWindow: true }); return t; }
const onCoupang = (t) => t?.url && /^https?:\/\/([^/]+\.)?coupang\.com\//.test(t.url);
$("open").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
$("probe").onclick = async () => {
  const t = await tab(); if (!onCoupang(t)) return (st.textContent = "쿠팡 페이지에서 눌러주세요.");
  const r = await chrome.tabs.sendMessage(t.id, { type: "PROBE" }).catch((e) => ({ error: e.message }));
  const el = $("log"); el.hidden = false; el.textContent = JSON.stringify(r?.data ?? r, null, 1);
  await navigator.clipboard.writeText(el.textContent).then(() => (st.textContent = "점검 결과를 복사했습니다. 대화창에 붙여넣어 주세요."), () => (st.textContent = "아래 내용을 직접 복사해주세요."));
};
$("collect").onclick = async () => {
  const t = await tab(); if (!onCoupang(t)) return (st.textContent = "쿠팡 주문목록 탭에서 눌러주세요.");
  $("abort").hidden = false; st.textContent = "수집 시작…";
  chrome.tabs.sendMessage(t.id, { type: "COLLECT" }).catch((e) => (st.textContent = "수집 불가: " + e.message));
};
$("abort").onclick = async () => { const t = await tab(); chrome.tabs.sendMessage(t.id, { type: "ABORT" }); };
chrome.runtime.onMessage.addListener((m) => {
  if (m.type === "PROGRESS") st.textContent = `${m.year}년 (${m.yearIndex}/${m.years}) ${m.page}페이지 · 누적 ${m.total}행`;
  if (m.type === "DONE") { $("abort").hidden = true; st.textContent = (m.aborted ? "중단됨. " : "완료. ") + Object.entries(m.perYear).map(([y, n]) => `${y}:${n}`).join(" "); }
  if (m.type === "ERROR") { $("abort").hidden = true; st.textContent = "오류: " + m.message; }
});
