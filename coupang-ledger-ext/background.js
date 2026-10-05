import { addOrders } from "./lib/store.js";
// 콘텐츠 스크립트가 보낸 수집 행을 저장하고, 진행 상황을 대시보드/팝업에 중계한다.
chrome.runtime.onMessage.addListener((msg, _s, send) => {
  if (msg?.type === "ROWS") { addOrders(msg.rows).then((n) => send({ ok: true, total: n })); return true; }
});
