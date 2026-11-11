// 沙盒專用：只由 sandbox_app.py 夾進首頁，正式 server 不會載入。
// 正式版 game.js 不動；這支包住 fetch，登入後看到階段是「交換禮物遊戲」，
// 就把登入 token 交給聚光燈頁（sessionStorage，對方讀完即刪）並跳過去。
(function () {
  "use strict";

  const EXCHANGE_STAGE = "exchange";
  const HANDOFF_KEY = "sandbox_handoff_token";
  const origFetch = window.fetch.bind(window);
  let leaving = false;

  window.fetch = async function (input, init) {
    const res = await origFetch(input, init);
    const url = typeof input === "string" ? input : input.url;
    if (leaving || !url.includes("/api/state")) return res;
    const headers = (init && init.headers) || {};
    const token = headers["X-Token"];
    if (!token) return res;
    try {
      const data = await res.clone().json();
      if (data.stage === EXCHANGE_STAGE && data.me) {
        leaving = true;
        sessionStorage.setItem(HANDOFF_KEY, token);
        console.log("[sandbox_bridge] stage is exchange, go to spotlight page");
        location.href = "/sandbox/exchange.html";
      }
    } catch (e) {
      /* 讀不到 JSON 或 storage 就留在原頁 */
    }
    return res;
  };
})();
