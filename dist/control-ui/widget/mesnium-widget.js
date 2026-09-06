/*!
 * MESNIUM EMBEDDABLE WEBSITE CHAT WIDGET (PHASE 1 INTEGRATION)
 *
 * Add AI Receptionist to any website with a single script tag:
 *   <script src="https://<your-mesnium-host>/widget/mesnium-widget.js"
 *           data-org="<public_id>"
 *           defer></script>
 *
 * Architecture & Constraints:
 *  - Zero external dependencies, zero build step, pure vanilla JavaScript.
 *  - Enclosed in a closed Shadow DOM for absolute CSS and DOM isolation from host page.
 *  - Communicates exclusively with public unauthenticated inbound chat endpoints.
 *  - Never exposes internal tenant IDs, database keys, or agent credentials.
 *  - Preserves visitor conversation continuity using local storage tokens.
 *  - Fails silently if chat is disabled for the public ID, never breaking host page.
 *  - Styled in Mesnium's locked crimson & deep black aesthetic.
 */
(function () {
  "use strict";

  var CURRENT_SCRIPT = document.currentScript;
  if (!CURRENT_SCRIPT) return;

  var ORG_ID = CURRENT_SCRIPT.getAttribute("data-org");
  if (!ORG_ID) return;

  // Auto-resolve API base URL from the script src if data-api is omitted
  var API_URL = (CURRENT_SCRIPT.getAttribute("data-api") || "").replace(/\/+$/, "");
  if (!API_URL && CURRENT_SCRIPT.src) {
    try {
      var scriptUrl = new URL(CURRENT_SCRIPT.src);
      API_URL = scriptUrl.origin;
    } catch (_) {
      API_URL = "";
    }
  }
  if (!API_URL) return;

  var STORAGE_KEY = "mesnium_widget_token_" + ORG_ID;
  var GREETING = "Hello! How can we help you today?";
  var SEND_ERROR = "Sorry, that message could not be sent. Please try again.";

  function storageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (_) {}
  }

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        if (key === "style") Object.assign(node.style, props[key]);
        else if (key.indexOf("on") === 0) node.addEventListener(key.slice(2).toLowerCase(), props[key]);
        else node.setAttribute(key, props[key]);
      });
    }
    (children || []).forEach(function (child) {
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }

  function svgChat() {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    var path = document.createElementNS(ns, "path");
    path.setAttribute("d", "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
    return svg;
  }

  function svgSend() {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("fill", "none");
    var path = document.createElementNS(ns, "path");
    path.setAttribute("d", "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
    return svg;
  }

  function mount() {
    var host = el("div", { id: "mesnium-widget-host" });
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.zIndex = "2147483640";
    host.style.bottom = "0";
    host.style.right = "0";
    document.body.appendChild(host);

    var shadow = host.attachShadow({ mode: "closed" });

    var style = document.createElement("style");
    style.textContent = [
      ":host, *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;}",
      ".wrap{position:fixed;bottom:24px;right:24px;display:flex;flex-direction:column;align-items:flex-end;gap:14px;z-index:2147483640;}",
      ".bubble{width:60px;height:60px;border-radius:999px;background:linear-gradient(135deg,#a81b24,#780e14);color:#ffffff;border:1px solid rgba(255,255,255,0.18);cursor:pointer;box-shadow:0 10px 30px rgba(168,27,36,0.45),0 4px 12px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;transition:transform .2s ease,box-shadow .2s ease;outline:none;}",
      ".bubble:hover{transform:scale(1.06);box-shadow:0 14px 38px rgba(168,27,36,0.6),0 6px 16px rgba(0,0,0,0.6);}",
      ".bubble:active{transform:scale(0.96);}",
      ".bubble svg{width:28px;height:28px;}",
      ".panel{width:360px;max-width:calc(100vw - 36px);height:500px;max-height:calc(100vh - 110px);background:#0d0d12;border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,0.75),0 0 0 1px #22222e;display:none;flex-direction:column;overflow:hidden;}",
      ".panel.open{display:flex;animation:fadeInUp .2s cubic-bezier(0.16,1,0.3,1);}",
      "@keyframes fadeInUp{from{opacity:0;transform:translateY(12px) scale(0.98);}to{opacity:1;transform:translateY(0) scale(1);}}",
      ".header{background:linear-gradient(180deg,#15151e 0%,#0f0f16 100%);color:#f4f4f7;padding:16px 18px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #20202c;}",
      ".header-info{display:flex;align-items:center;gap:10px;}",
      ".header-status{width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 8px #10b981;}",
      ".header-title{font-size:14.5px;font-weight:600;letter-spacing:-0.01em;}",
      ".close-btn{background:transparent;border:none;color:#9ca3af;cursor:pointer;font-size:20px;line-height:1;padding:4px 6px;border-radius:6px;transition:color .15s,background .15s;outline:none;}",
      ".close-btn:hover{color:#ffffff;background:rgba(255,255,255,0.08);}",
      ".messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;background:#09090d;scrollbar-width:thin;scrollbar-color:#2a2a38 transparent;}",
      ".messages::-webkit-scrollbar{width:5px;}",
      ".messages::-webkit-scrollbar-thumb{background:#2a2a38;border-radius:4px;}",
      ".msg{max-width:84%;padding:10px 14px;border-radius:14px;font-size:13.5px;line-height:1.5;word-break:break-word;white-space:pre-wrap;}",
      ".msg.bot{align-self:flex-start;background:#14141d;border:1px solid #222232;color:#ededf2;border-bottom-left-radius:3px;}",
      ".msg.user{align-self:flex-end;background:linear-gradient(135deg,#9b151e,#780e14);color:#ffffff;border:1px solid rgba(255,255,255,0.1);border-bottom-right-radius:3px;box-shadow:0 2px 8px rgba(0,0,0,0.35);}",
      ".msg.pending{display:flex;align-items:center;gap:4px;padding:12px 16px;}",
      ".dot{width:6px;height:6px;background:#8e8e9c;border-radius:50%;animation:pulse 1.4s infinite ease-in-out both;}",
      ".dot:nth-child(1){animation-delay:-0.32s;}",
      ".dot:nth-child(2){animation-delay:-0.16s;}",
      "@keyframes pulse{0%,80%,100%{transform:scale(0.6);opacity:0.4;}40%{transform:scale(1);opacity:1;}}",
      ".composer{padding:12px 14px;background:#121219;border-top:1px solid #1f1f2c;display:flex;align-items:flex-end;gap:10px;}",
      ".composer textarea{flex:1;background:#09090d;color:#ffffff;border:1px solid #262636;border-radius:10px;padding:10px 12px;font-size:13.5px;line-height:1.4;resize:none;max-height:90px;outline:none;transition:border-color .15s;}",
      ".composer textarea:focus{border-color:#a81b24;}",
      ".composer textarea::placeholder{color:#6b7280;}",
      ".send-btn{width:38px;height:38px;border-radius:10px;background:#a81b24;color:#ffffff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s,opacity .15s;outline:none;flex-shrink:0;}",
      ".send-btn:hover:not(:disabled){background:#c5222d;}",
      ".send-btn:disabled{background:#2a2a3a;color:#6b7280;cursor:not-allowed;}",
      ".footer{text-align:center;font-size:10px;color:#52525e;padding:6px 0 8px;background:#121219;letter-spacing:0.02em;}",
      ".footer a{color:#717182;text-decoration:none;font-weight:500;}",
      ".footer a:hover{color:#a81b24;}"
    ].join("\n");
    shadow.appendChild(style);

    var messagesEl = el("div", { class: "messages" });
    var textarea = el("textarea", { rows: "1", placeholder: "Type a message..." });
    var sendBtn = el("button", { type: "button", "aria-label": "Send", class: "send-btn" }, [svgSend()]);

    var panel = el("div", { class: "panel" }, [
      el("div", { class: "header" }, [
        el("div", { class: "header-info" }, [
          el("span", { class: "header-status" }),
          el("span", { class: "header-title" }, ["Chat with Receptionist"])
        ]),
        el("button", { class: "close-btn", "aria-label": "Close chat", onClick: togglePanel }, ["\u00D7"])
      ]),
      messagesEl,
      el("div", { class: "composer" }, [textarea, sendBtn]),
      el("div", { class: "footer" }, ["Powered by Mesnium"])
    ]);

    var bubble = el("button", { class: "bubble", type: "button", "aria-label": "Open chat", onClick: togglePanel }, [
      svgChat()
    ]);

    var wrap = el("div", { class: "wrap" }, [panel, bubble]);
    shadow.appendChild(wrap);

    var opened = false;
    var conversationToken = storageGet(STORAGE_KEY) || null;
    var greeted = false;

    function togglePanel() {
      opened = !opened;
      panel.classList.toggle("open", opened);
      if (opened && !greeted) {
        greeted = true;
        addMessage(GREETING, "bot");
      }
      if (opened) {
        setTimeout(function () { textarea.focus(); }, 50);
      }
    }

    function addMessage(text, kind) {
      var node = el("div", { class: "msg " + kind }, [text]);
      messagesEl.appendChild(node);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return node;
    }

    function addPending() {
      var node = el("div", { class: "msg bot pending" }, [
        el("span", { class: "dot" }),
        el("span", { class: "dot" }),
        el("span", { class: "dot" })
      ]);
      messagesEl.appendChild(node);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return node;
    }

    function exchange(text) {
      addMessage(text, "user");
      sendBtn.disabled = true;
      textarea.disabled = true;
      var pendingNode = addPending();

      var payload = {
        message: text,
        conversation_token: conversationToken
      };

      fetch(API_URL + "/public/chat/" + encodeURIComponent(ORG_ID), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          return res.json().then(function (body) {
            return { ok: res.ok, status: res.status, body: body };
          });
        })
        .then(function (result) {
          pendingNode.remove();
          sendBtn.disabled = false;
          textarea.disabled = false;
          textarea.focus();

          if (!result.ok) {
            var errMsg = (result.body && result.body.error) || SEND_ERROR;
            addMessage(errMsg, "bot");
            return;
          }

          if (result.body.conversation_token) {
            conversationToken = result.body.conversation_token;
            storageSet(STORAGE_KEY, conversationToken);
          }

          var replyText = result.body.reply || GREETING;
          addMessage(replyText, "bot");
        })
        .catch(function () {
          pendingNode.remove();
          sendBtn.disabled = false;
          textarea.disabled = false;
          textarea.focus();
          addMessage(SEND_ERROR, "bot");
        });
    }

    function send() {
      var text = textarea.value.trim();
      if (!text) return;
      textarea.value = "";
      textarea.style.height = "auto";
      exchange(text);
    }

    sendBtn.addEventListener("click", send);
    textarea.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
    textarea.addEventListener("input", function () {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 90) + "px";
    });
  }

  function init() {
    fetch(API_URL + "/public/chat/" + encodeURIComponent(ORG_ID) + "/status")
      .then(function (res) {
        return res.ok ? res.json() : { available: false };
      })
      .then(function (status) {
        if (status && status.available) {
          mount();
        }
      })
      .catch(function () {
        // Fail silently if unreachable to never break host page
      });
  }

  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
