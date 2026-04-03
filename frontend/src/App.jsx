import React, { useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import MessageBubble from "./components/MessageBubble.jsx";
import TypingDots from "./components/TypingDots.jsx";
import { api, tzName } from "./lib/api.js";
import { useI18n } from "./lib/i18n.js";
import * as sfx from "./lib/sfx.js";

const REACT_KEY_PREFIX = "yaan_react_";

function reactKey(messageId) {
  return REACT_KEY_PREFIX + String(messageId || "");
}

function getReaction(messageId) {
  if (!messageId) return "";
  try { return window.localStorage.getItem(reactKey(messageId)) || ""; } catch { return ""; }
}

function setReaction(messageId, val) {
  if (!messageId) return;
  const v = String(val || "");
  try {
    if (!v) window.localStorage.removeItem(reactKey(messageId));
    else window.localStorage.setItem(reactKey(messageId), v);
  } catch {}
}

function useLocalStorageBool(key, fallback = false) {
  const [v, setV] = useState(() => {
    try { return window.localStorage.getItem(key) === "1"; } catch { return fallback; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(key, v ? "1" : "0"); } catch {}
  }, [key, v]);
  return [v, setV];
}

export default function App() {
  const { t } = useI18n();
  const username = (window.__yaan__ && window.__yaan__.displayName) || "User";
  const csrfToken = (window.__yaan__ && window.__yaan__.csrfToken) || "";

  const [introVisible, setIntroVisible] = useState(() => {
    try { return window.sessionStorage.getItem("yaan_intro_seen") !== "1"; } catch { return true; }
  });
  const [introLeaving, setIntroLeaving] = useState(false);

  const [soundEnabled, setSoundEnabled] = useLocalStorageBool("yaan_sound_enabled", false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [phonePanelOpen, setPhonePanelOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [deleteSheet, setDeleteSheet] = useState(null); // { id, title }
  const [deleting, setDeleting] = useState(false);
  const [quotaSheet, setQuotaSheet] = useState(null); // { error, quota }
  const [quotaState, setQuotaState] = useState(null); // { plan, used, limit, resetAtIso, resetAtMs }
  const [quotaRemaining, setQuotaRemaining] = useState("");
  const [mode, setMode] = useState(() => {
    try { return (window.localStorage.getItem("yaan_mode_default") || "normal").trim().toLowerCase() || "normal"; } catch { return "normal"; }
  });

  const threadRef = useRef(null);
  const aborterRef = useRef(null);
  const loadSeqRef = useRef(0);
  const optimisticSendRef = useRef({ convId: null, untilMs: 0 });

  const empty = !loadingMsgs && !streaming && (!messages || messages.length === 0);

  const quotaLocked = !!(quotaState &&
    String(quotaState.plan || "").toLowerCase() === "free" &&
    typeof quotaState.used === "number" &&
    typeof quotaState.limit === "number" &&
    quotaState.limit > 0 &&
    quotaState.used >= quotaState.limit);

  function applyQuotaPayload(q) {
    if (!q || typeof q !== "object") return;
    const plan = String(q.plan || "free").trim().toLowerCase() || "free";
    const used = (typeof q.used === "number") ? q.used : (typeof q.messages_used_today === "number" ? q.messages_used_today : null);
    const limit = (typeof q.limit === "number") ? q.limit : (typeof q.free_daily_limit === "number" ? q.free_daily_limit : null);
    const resetAtIso = String(q.reset_at || q.resetAt || q.resetAtIso || "").trim();
    let resetAtMs = 0;
    if (resetAtIso) {
      const d = new Date(resetAtIso);
      resetAtMs = Number.isNaN(d.getTime()) ? 0 : d.getTime();
    }

    if (typeof used !== "number" || typeof limit !== "number") return;
    const next = { plan, used, limit, resetAtIso, resetAtMs };
    setQuotaState(next);
    if (plan === "free" && limit > 0 && used >= limit) {
      setDraft("");
    }
  }

  async function refreshBilling() {
    try {
      const tz = tzName();
      const data = await api(`/api/billing/status?tz=${encodeURIComponent(tz || "")}`, { method: "GET" });
      const b = (data && data.billing) ? data.billing : null;
      if (!b) return;
      applyQuotaPayload({
        plan: (b.plan || "free"),
        used: (b.messages_used_today ?? 0),
        limit: (b.free_daily_limit ?? 0),
        reset_at: (b.reset_at || ""),
      });
    } catch {
      // Best-effort only.
    }
  }

  // Theme toggling lives in Settings. We still ensure the attribute is applied in SPA.
  useEffect(() => {
    const KEY = "yaan_theme";
    try {
      const t = (window.localStorage.getItem(KEY) || "").trim().toLowerCase();
      const val = (t === "light" || t === "dark") ? t : "dark";
      document.documentElement.dataset.theme = val;
    } catch {}
  }, []);

  useEffect(() => {
    refreshBilling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!quotaLocked) {
      setQuotaRemaining("");
      return;
    }

    const resetAtMs = quotaState && typeof quotaState.resetAtMs === "number" ? quotaState.resetAtMs : 0;
    function fmt(ms) {
      const total = Math.max(0, Math.floor(ms / 1000));
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      const pad = (n) => String(n).padStart(2, "0");
      return (h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`);
    }

    function tick() {
      if (!resetAtMs) {
        setQuotaRemaining("");
        return;
      }
      const left = resetAtMs - Date.now();
      if (left <= 0) {
        setQuotaRemaining("00:00");
        // When the timer hits zero, refresh quota and unlock if possible.
        refreshBilling();
        return;
      }
      setQuotaRemaining(fmt(left));
    }

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotaLocked, quotaState && quotaState.resetAtMs]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoadingList(true);
        const data = await api(`/api/ai/conversations?q=&limit=120`, { method: "GET" });
        if (!alive) return;
        const list = data.conversations || [];
        setConversations(list);
        setActiveId(list[0] ? list[0].id : null);
      } catch (e) {
        setToast(e.message || t("failed_load_chats"));
      } finally {
        if (alive) setLoadingList(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!activeId) return;
    let alive = true;
    const seq = (loadSeqRef.current += 1);
    (async () => {
      try {
        setLoadingMsgs(true);
        const optimistic = (() => {
          const v = optimisticSendRef.current || { convId: null, untilMs: 0 };
          return (v.convId === activeId) && (Date.now() < Number(v.untilMs || 0));
        })();
        // Avoid clobbering an in-flight optimistic first message for a brand new conversation.
        if (!optimistic) setMessages([]);
        const data = await api(`/api/ai/conversations/${activeId}/messages?limit=500`, { method: "GET" });
        if (!alive) return;
        if (seq !== loadSeqRef.current) return;
        const next = data.messages || [];
        const optimisticNow = (() => {
          const v = optimisticSendRef.current || { convId: null, untilMs: 0 };
          return (v.convId === activeId) && (Date.now() < Number(v.untilMs || 0));
        })();
        // If we raced a first-send, the conversation may still be empty on the server.
        // Keep the optimistic UI rather than overwriting it with [].
        if (!(optimisticNow && next.length === 0)) {
          setMessages(next);
        }
        requestAnimationFrame(() => scrollToBottom());
      } catch (e) {
        setToast(e.message || t("failed_load_messages"));
      } finally {
        if (alive) setLoadingMsgs(false);
      }
    })();
    return () => { alive = false; };
  }, [activeId]);

  function scrollToBottom() {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  async function createConversation(opts = {}) {
    const title = (opts && typeof opts.title === "string") ? opts.title : "";
    const clearDraft = (opts && Object.prototype.hasOwnProperty.call(opts, "clearDraft")) ? !!opts.clearDraft : true;
    const markOptimistic = (opts && Object.prototype.hasOwnProperty.call(opts, "markOptimistic")) ? !!opts.markOptimistic : false;

    // Store an empty title in DB; UI renders localized fallback for "New chat".
    const data = await api("/api/ai/conversations", { method: "POST", body: JSON.stringify({ title, mode }) });
    const c = data.conversation;
    const list = await api(`/api/ai/conversations?q=&limit=120`, { method: "GET" });
    setConversations(list.conversations || []);
    if (markOptimistic && c && c.id) {
      optimisticSendRef.current = { convId: c.id, untilMs: Date.now() + 15000 };
    }
    setActiveId(c.id);
    if (clearDraft) setDraft("");
    return c.id;
  }

  function requestDeleteConversation(conversationId) {
    const id = Number(conversationId);
    if (!id) return;
    const title = conversations.find((c) => c.id === id)?.title || "New chat";
    setDeleteSheet({ id, title });
  }

  async function confirmDeleteConversation() {
    const id = Number(deleteSheet && deleteSheet.id);
    if (!id || deleting) return;
    setDeleting(true);
    try {
      if (aborterRef.current) aborterRef.current.abort();
      await api(`/api/ai/conversations/${id}`, { method: "DELETE" });

      // Refresh list and keep the active conversation if it still exists.
      const data = await api(`/api/ai/conversations?q=&limit=120`, { method: "GET" });
      const list = data.conversations || [];
      setConversations(list);

      setActiveId((cur) => {
        const keep = list.some((c) => c.id === cur);
        return keep ? cur : (list[0]?.id ?? null);
      });

      setDeleteSheet(null);
      setToast(t("deleted"));
    } catch (e) {
      setToast(e.message || t("delete_failed"));
    } finally {
      setDeleting(false);
    }
  }

  async function send() {
    const text = String(draft || "").trim();
    if (!text) return;
    if (quotaLocked) {
      setQuotaSheet({ error: t("daily_limit_reached"), quota: quotaState });
      return;
    }
    let convId = activeId || null;
    const firstTurn = !messages || messages.length === 0;
    if (!convId) {
      try {
        convId = await createConversation({ title: "", clearDraft: false, markOptimistic: true });
      } catch (e) {
        setToast((e && e.message) || t("send_failed"));
        return;
      }
    }

    if (aborterRef.current) aborterRef.current.abort();
    const aborter = new AbortController();
    aborterRef.current = aborter;

    const tmpUser = { id: "tmp-u-" + Math.random().toString(16).slice(2), role: "user", content: text, created_at_utc: new Date().toISOString(), edited_at_utc: "" };
    const tmpAsst = { id: "tmp-a-" + Math.random().toString(16).slice(2), role: "assistant", content: "", created_at_utc: new Date().toISOString(), edited_at_utc: "" };
    setMessages((m) => [...m, tmpUser, tmpAsst]);
    setDraft("");
    setStreaming(true);
    requestAnimationFrame(() => scrollToBottom());
    sfx.play("send");

    try {
      // Streaming can be flaky on some first-load cases. Use a simple non-stream fallback for the first turn.
      if (firstTurn) {
        const res = await fetch(`/api/ai/conversations/${convId}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          signal: aborter.signal,
          body: JSON.stringify({ message: text, mode, regenerate: false, tz: tzName() }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = (data && data.error) ? data.error : `Request failed (${res.status})`;
          throw Object.assign(new Error(msg), { status: res.status, data });
        }
        const assistant = data.assistant;
        setMessages((m) => m.map((x) => (x.id === tmpAsst.id ? assistant : x)));
        if (data.conversation) {
          setConversations((prev) => prev.map((c) => (c.id === data.conversation.id ? { ...c, ...data.conversation } : c)));
        }
        sfx.play("receive");
      } else {
        const res = await fetch(`/api/ai/conversations/${convId}/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          signal: aborter.signal,
          body: JSON.stringify({ message: text, mode, regenerate: false, tz: tzName() }),
        });

        if (!res.ok) {
          let err = null;
          try { err = await res.json(); } catch {}
          const msg = (err && err.error) ? err.error : `Request failed (${res.status})`;
          throw Object.assign(new Error(msg), { status: res.status, data: err });
        }

        if (!res.body) throw new Error("Streaming not supported in this browser context.");

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let acc = "";

        const updateAssistant = (val) => {
          acc = val;
          setMessages((m) => {
            const copy = m.slice();
            const i = copy.findIndex((x) => x.id === tmpAsst.id);
            if (i >= 0) copy[i] = { ...copy[i], content: acc };
            return copy;
          });
        };

        let doneObj = null;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line) continue;
            let obj = null;
            try { obj = JSON.parse(line); } catch { continue; }
            if (obj.type === "delta") {
              updateAssistant(acc + String(obj.delta || ""));
            } else if (obj.type === "done") {
              doneObj = obj;
            } else if (obj.type === "error") {
              throw new Error(String(obj.error || "Stream error"));
            }
          }
        }

        if (doneObj && doneObj.assistant) {
          const assistant = doneObj.assistant;
          setMessages((m) => m.map((x) => (x.id === tmpAsst.id ? assistant : x)));
          if (doneObj.conversation) {
            setConversations((prev) => prev.map((c) => (c.id === doneObj.conversation.id ? { ...c, ...doneObj.conversation } : c)));
          }
          sfx.play("receive");
        }
      }
    } catch (e) {
      const status = e && typeof e.status === "number" ? e.status : 0;
      const quota = e && e.data && e.data.quota ? e.data.quota : null;
      if (status === 429 && quota) {
        setQuotaSheet({ error: e.message || t("daily_limit_reached"), quota });
        applyQuotaPayload(quota);
        sfx.play("error");
      } else {
        setToast((e && e.message) || t("send_failed"));
      }
      setMessages((m) => m.filter((x) => x.id !== tmpUser.id && x.id !== tmpAsst.id));
    } finally {
      setStreaming(false);
      aborterRef.current = null;
    }
  }

  const filtered = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => String(c.title || "").toLowerCase().includes(q));
  }, [conversations, search]);

  async function onCopy(msg) {
    try {
      await navigator.clipboard.writeText(msg.content || "");
      setToast(t("copied"));
    } catch {
      setToast(t("copy_failed"));
    }
  }

  function onReact(msg, val) {
    const cur = getReaction(msg.id);
    setReaction(msg.id, cur === val ? "" : val);
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 1600);
    return () => clearTimeout(t);
  }, [toast]);

  function dismissIntro(userInitiated = false) {
    if (!introVisible) return;
    if (introLeaving) return;
    setIntroLeaving(true);
    try { window.sessionStorage.setItem("yaan_intro_seen", "1"); } catch {}
    window.setTimeout(() => {
      setIntroVisible(false);
      setIntroLeaving(false);
    }, 420);
  }

  useEffect(() => {
    if (!introVisible) return;
    let ms = 3600;
    try {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) ms = 0;
    } catch {}
    const t = window.setTimeout(() => dismissIntro(false), ms);
    const onKey = (e) => {
      if (e.key === "Escape") dismissIntro(true);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introVisible]);

  // Global gentle SFX: cover most interactions in one place (mobile + desktop).
  useEffect(() => {
    const isInteractive = (el) => {
      if (!el) return false;
      if (el.getAttribute && el.getAttribute("data-sfx") === "none") return false;
      if (el.closest && el.closest("[data-sfx=\"none\"]")) return false;
      if (el.disabled) return false;
      const tag = (el.tagName || "").toLowerCase();
      if (tag === "a") {
        const href = el.getAttribute("href") || "";
        if (!href) return false;
        if (href.startsWith("javascript:")) return false;
        return true;
      }
      if (tag === "button" || tag === "select" || tag === "summary") return true;
      if (tag === "input") {
        const t = (el.getAttribute("type") || "text").toLowerCase();
        return ["button", "submit", "reset", "checkbox", "radio"].includes(t);
      }
      if (el.getAttribute && el.getAttribute("role") === "button") return true;
      return false;
    };

    const isTextEntry = (el) => {
      if (!el) return false;
      const tag = (el.tagName || "").toLowerCase();
      if (tag === "textarea") return true;
      if (tag === "input") {
        const t = (el.getAttribute("type") || "text").toLowerCase();
        return !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file"].includes(t);
      }
      try { if (el.isContentEditable) return true; } catch {}
      return false;
    };

    const onPointerDown = (e) => {
      if (!e || e.defaultPrevented) return;
      if (e.pointerType === "mouse" && typeof e.button === "number" && e.button !== 0) return;
      const target = e.target;
      const el = target && target.closest ? target.closest("button,a,input,select,summary,[role=\"button\"]") : null;
      if (!isInteractive(el)) return;
      const tag = (el.tagName || "").toLowerCase();
      const type = tag === "input" ? ((el.getAttribute("type") || "") + "").toLowerCase() : "";
      const kind = (tag === "input" && (type === "checkbox" || type === "radio")) ? "toggle" : "click";
      sfx.play(kind);
    };

    const onKeyDown = (e) => {
      if (!e || e.defaultPrevented) return;
      if (e.isComposing) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const target = e.target;
      if (isTextEntry(target)) {
        const k = e.key;
        const printable = (typeof k === "string" && k.length === 1);
        if (printable || k === "Backspace" || k === "Delete") {
          if (k !== "Enter") sfx.play("key");
        }
        return;
      }

      const el = target && target.closest ? target.closest("button,a,[role=\"button\"]") : null;
      if (!isInteractive(el)) return;
      if (e.key === "Enter" || e.key === " ") sfx.play("click");
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  function doLogout() {
    // Use real form POST so server can enforce CSRF and then redirect.
    try { window.sessionStorage.removeItem("yaan_intro_seen"); } catch {}
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/logout";

    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "csrf_token";
    input.value = String(csrfToken || "");
    form.appendChild(input);

    document.body.appendChild(form);
    form.submit();
  }

  const quick = [
    { key: "qp_plan_next_steps", text: t("qp_plan_next_steps") },
    { key: "qp_summarize_chat_5", text: t("qp_summarize_chat_5") },
    { key: "qp_translate_to_armenian", text: t("qp_translate_to_armenian") },
    { key: "qp_generate_code_edge", text: t("qp_generate_code_edge") },
  ];

  function displayConvTitle(rawTitle) {
    const title = String(rawTitle || "").trim();
    if (!title) return "";
    // Normalize legacy default title stored in DB.
    if (title.toLowerCase() === "new chat") return "";
    return title;
  }

  return (
    <div className="app-shell">
      {introVisible && (
        <div
          className={["intro", introLeaving ? "intro--leave" : ""].join(" ")}
          role="presentation"
        >
          <div className="intro__card" onClick={(e) => e.stopPropagation()} role="presentation">
            <div className="intro__top">
              <div className="intro__brand">
                <div className="intro__logo">
                  <img src="/static/brand/logo.png" alt="Yaan" />
                </div>
                <div className="intro__meta">
                  <div className="intro__name">Yaan</div>
                  <div className="intro__sub">{t("minimal_ai_workspace")}</div>
                </div>
              </div>
                <button className="intro__skip" type="button" onClick={() => dismissIntro(true)}>
                  {t("skip")}
                </button>
              </div>

            <div className="intro__mid">
              <div className="intro__headline">{t("intro_ready")}</div>
              <div className="intro__hint">
                {t("intro_hint_enter")}
              </div>
            </div>

            <div className="intro__bar" aria-hidden="true">
              <div className="intro__barFill" />
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 left-[46%] h-[640px] w-[640px] -translate-x-1/2 rounded-full bg-accent/10 blur-[90px]" />
        <div className="absolute -bottom-40 left-[18%] h-[520px] w-[520px] rounded-full bg-glow/10 blur-[100px]" />
        <div className="absolute top-[30%] right-[-12%] h-[560px] w-[560px] rounded-full bg-white/5 blur-[110px]" />
      </div>

      <div className="app-frame app-frame--cap">
        <div className="hidden md:block">
          <Sidebar
            username={username}
            soundEnabled={soundEnabled}
            onToggleSound={setSoundEnabled}
            conversations={loadingList ? [] : filtered}
            activeId={activeId}
            search={search}
            onSearch={setSearch}
            onNewChat={createConversation}
            onSelect={setActiveId}
            onDelete={requestDeleteConversation}
          />
        </div>

        {/* Mobile sidebar drawer */}
        {sidebarOpen && (
          <div className="md:hidden fixed inset-0 z-50">
            <button
              type="button"
              className="absolute inset-0 bg-black/60"
              aria-label="Close menu"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="absolute left-0 top-0 bottom-0 w-[86vw] max-w-[320px] shadow-soft">
              <Sidebar
                username={username}
                soundEnabled={soundEnabled}
                onToggleSound={setSoundEnabled}
                conversations={loadingList ? [] : filtered}
                activeId={activeId}
                search={search}
                onSearch={setSearch}
                onNewChat={createConversation}
                onSelect={setActiveId}
                onDelete={requestDeleteConversation}
                onClose={() => setSidebarOpen(false)}
              />
            </div>
          </div>
        )}

        <main className="panel panel-main relative">
          <div className="h-full grid grid-rows-[auto_minmax(0,1fr)_auto]">
            <header className="topbar">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  className="md:hidden icon-btn"
                  onClick={() => setSidebarOpen(true)}
                  aria-label={t("open_menu")}
                  title={t("menu")}
                >
                  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                    <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
                <div className="text-sm font-semibold t1 tracking-tight truncate">
                  {displayConvTitle(conversations.find((c) => c.id === activeId)?.title) || t("chat")}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="md:hidden icon-btn"
                  onClick={() => setPhonePanelOpen(true)}
                  aria-label={t("phone")}
                  title={t("phone")}
                >
                  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                    <path d="M16 2H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" stroke="currentColor" strokeWidth="2" />
                    <path d="M10 19h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
                <select
                  className="pill outline-none focus:border-white/15 max-w-[132px] md:max-w-none"
                  value={mode}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMode(v);
                    try { window.localStorage.setItem("yaan_mode_default", v); } catch {}
                  }}
                  title={t("mode")}
                >
                  <option value="normal">{t("mode_opt_normal")}</option>
                  <option value="creative">{t("mode_opt_creative")}</option>
                  <option value="coding">{t("mode_opt_coding")}</option>
                  <option value="research">{t("mode_opt_research")}</option>
                  <option value="learning">{t("mode_opt_learning")}</option>
                  <option value="business">{t("mode_opt_business")}</option>
                  <option value="translator">{t("mode_opt_translator")}</option>
                </select>
                <a className="hidden md:inline-flex btn" href="/settings">{t("settings")}</a>
                <a className="hidden md:inline-flex btn btn-primary" href="/upgrade">{t("upgrade")}</a>
                <button className="hidden md:inline-flex btn" type="button" onClick={doLogout} title={t("logout")}>
                  {t("logout")}
                </button>
              </div>
            </header>

            <section
              ref={threadRef}
              className="relative overflow-auto min-h-0"
              style={{ scrollBehavior: "smooth" }}
            >
              <div className="mx-auto w-full max-w-3xl px-3 sm:px-6 py-5 sm:py-8 space-y-4 sm:space-y-6">
                {empty && (
                  <div className="min-h-[52vh] grid place-items-center">
                    <div className="text-center max-w-[720px]">
                      <div className="text-[28px] sm:text-[36px] font-semibold tracking-tight t1">
                        {t("empty_headline")}
                      </div>
                      <div className="mt-3 text-sm t2">
                        {t("empty_subtitle")}
                      </div>

                      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                        {quick.map((qp) => (
                          <button
                            key={qp.key}
                            type="button"
                            className="btn"
                            onClick={() => setDraft((prev) => (prev ? prev : qp.text))}
                          >
                            {qp.text}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {loadingMsgs && (
                  <div className="space-y-4">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="glass rounded-2xl p-4 border bdr">
                        <div className="h-3 w-[70%] rounded-full bg-white/10 animate-shimmer [background-size:220%_100%] [background-image:linear-gradient(90deg,rgba(255,255,255,0.06),rgba(255,255,255,0.10),rgba(255,255,255,0.06))]" />
                        <div className="mt-3 h-3 w-[92%] rounded-full bg-white/10 animate-shimmer [background-size:220%_100%] [background-image:linear-gradient(90deg,rgba(255,255,255,0.06),rgba(255,255,255,0.10),rgba(255,255,255,0.06))]" />
                        <div className="mt-3 h-3 w-[60%] rounded-full bg-white/10 animate-shimmer [background-size:220%_100%] [background-image:linear-gradient(90deg,rgba(255,255,255,0.06),rgba(255,255,255,0.10),rgba(255,255,255,0.06))]" />
                      </div>
                    ))}
                  </div>
                )}

                {!loadingMsgs && messages.map((m) => (
                  <MessageBubble key={m.id} msg={m} onCopy={onCopy} onReact={onReact} />
                ))}

                {streaming && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl border bdr chip2 px-4 py-3">
                      <TypingDots />
                    </div>
                  </div>
                )}
              </div>
            </section>

            <footer className="composer">
              <div className="mx-auto w-full max-w-3xl px-3 sm:px-6 py-3 sm:py-4">
                <div className="rounded-xl2 p-[1px] composer__rim">
                  <div className="glass rounded-xl2 p-3 border bdr">
                    <div className="flex items-end gap-3">
                    <textarea
                      className="field min-h-[52px] max-h-[180px] resize-none"
                      placeholder={t("message_placeholder")}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        // Enter sends, Shift+Enter inserts a newline.
                        // Avoid interfering with IME composition.
                        if (quotaLocked) return;
                        if (e.isComposing) return;
                        if (e.key !== "Enter") return;
                        if (e.shiftKey) return;
                        e.preventDefault();
                        send();
                      }}
                      disabled={streaming || quotaLocked}
                    />
                      <button className="btn btn-primary h-[52px] px-5" type="button" onClick={send} disabled={streaming || quotaLocked} data-sfx="none">
                        {t("send")}
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs t2 px-1">
                      <div>
                        {quotaLocked ? (
                          <span className="quotaLockInline">
                            {t("daily_limit_reached")}
                            {quotaRemaining ? ` · ${t("try_again_in")} ${quotaRemaining}` : ""}
                          </span>
                        ) : (
                          t("composer_hint")
                        )}
                      </div>
                      <div className="t3">{t("premium_ui")}</div>
                    </div>
                  </div>
                </div>
              </div>
            </footer>
          </div>
        </main>
      </div>

      {phonePanelOpen && (
        <div className="phonePanel" role="presentation">
          <button
            type="button"
            className="phonePanel__backdrop"
            aria-label={t("close")}
            onClick={() => setPhonePanelOpen(false)}
          />
          <div className="phonePanel__sheet" role="presentation">
            <div className="phonePanel__head">
              <div className="phonePanel__title">{t("phone")}</div>
              <button className="icon-btn" type="button" onClick={() => setPhonePanelOpen(false)} aria-label={t("close")}>
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="phonePanel__grid">
              <button className="btn phonePanel__big" type="button" onClick={() => { setSidebarOpen(true); setPhonePanelOpen(false); }}>
                {t("chats")}
              </button>
              <button className="btn btn-primary phonePanel__big" type="button" onClick={() => { createConversation(); setPhonePanelOpen(false); }}>
                {t("new_chat")}
              </button>
              <a className="btn phonePanel__big" href="/settings" onClick={() => setPhonePanelOpen(false)}>
                {t("settings")}
              </a>
              <a className="btn phonePanel__big" href="/upgrade" onClick={() => setPhonePanelOpen(false)}>
                {t("upgrade")}
              </a>
              <a className="btn phonePanel__big" href="/feedback" onClick={() => setPhonePanelOpen(false)}>
                {t("feedback")}
              </a>
              <button className="btn phonePanel__big" type="button" onClick={() => { setSoundEnabled((v) => !v); }}>
                {t("sound")}: {soundEnabled ? t("on") : t("off")}
              </button>
              <button className="btn phonePanel__big" type="button" onClick={doLogout}>
                {t("logout")}
              </button>
            </div>

            <div className="phonePanel__prompts">
              <div className="phonePanel__label">{t("quick_prompts")}</div>
              <div className="phonePanel__pills">
                {quick.map((qp) => (
                  <button key={qp.key} className="btn" type="button" onClick={() => { setDraft((prev) => (prev ? prev : qp.text)); setPhonePanelOpen(false); }}>
                    {qp.text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 glass rounded-xl2 px-4 py-2 text-sm t1 border bdr shadow-float">
          {toast}
        </div>
      )}

      {deleteSheet && (
        <div className="actionSheet" role="presentation">
          <button
            type="button"
            className="actionSheet__backdrop"
            aria-label={t("cancel")}
            disabled={deleting}
            onClick={() => setDeleteSheet(null)}
          />
          <div className="actionSheet__sheet" role="dialog" aria-modal="true" aria-label={t("delete_chat_title")}>
            <div className="actionSheet__title">{t("delete_chat_title")}</div>
            <div className="actionSheet__subtitle">
              {deleteSheet.title}
            </div>
            <div className="actionSheet__actions">
              <button
                type="button"
                className="btn btn-danger actionSheet__btn"
                onClick={confirmDeleteConversation}
                disabled={deleting}
              >
                {t("delete")}
              </button>
              <button
                type="button"
                className="btn actionSheet__btn"
                onClick={() => setDeleteSheet(null)}
                disabled={deleting}
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {quotaSheet && (
        <div className="quotaModal" role="presentation">
          <button
            type="button"
            className="quotaModal__backdrop"
            aria-label={t("close")}
            onClick={() => setQuotaSheet(null)}
          />
          <div className="quotaModal__card" role="dialog" aria-modal="true" aria-label={t("daily_limit_reached")}>
            <div className="quotaModal__top">
              <div className="quotaModal__badge">{t("daily_limit_reached")}</div>
              <button type="button" className="icon-btn" onClick={() => setQuotaSheet(null)} aria-label={t("close")} title={t("close")}>
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="quotaModal__title">{quotaSheet.error || t("daily_limit_reached")}</div>

            {quotaSheet.quota && (
              <div className="quotaModal__meta">
                <div className="quotaModal__kv">
                  <span className="k">{t("used_today")}</span>
                  <span className="v mono">
                    {typeof quotaSheet.quota.used === "number" ? quotaSheet.quota.used : "?"}
                    {" / "}
                    {typeof quotaSheet.quota.limit === "number" ? quotaSheet.quota.limit : "?"}
                  </span>
                </div>
                <div className="quotaModal__kv">
                  <span className="k">{t("resets_at")}</span>
                  <span className="v">
                    {quotaSheet.quota.reset_at ? new Date(quotaSheet.quota.reset_at).toLocaleString() : ""}
                  </span>
                </div>
              </div>
            )}

            <div className="quotaModal__bar" aria-hidden="true">
              <div className="quotaModal__barFill" />
            </div>

            <div className="quotaModal__actions">
              <a className="btn btn-primary quotaModal__btn" href="/upgrade" onClick={() => setQuotaSheet(null)}>
                {t("upgrade_to_pro")}
              </a>
              <button className="btn quotaModal__btn" type="button" onClick={() => setQuotaSheet(null)}>
                {t("ok")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
