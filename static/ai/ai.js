(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const elApp = $("app");
  const elSidebar = $("sidebar");
  const elToggleSidebarBtn = $("toggleSidebarBtn");
  const elOpenToolsBtn = $("openToolsBtn");
  const elNewChatBtn = $("newChatBtn");
  const elChatSearch = $("chatSearch");
  const elChatList = $("chatList");
  const elChatTitle = $("chatTitle");
  const elChatMeta = $("chatMeta");
  const elModeSelect = $("modeSelect");
  const elPinBtn = $("pinBtn");
  const elBookmarkBtn = $("bookmarkBtn");
  const elShareBtn = $("shareBtn");
  const elExportBtn = $("exportBtn");
  const elRenameBtn = $("renameBtn");
  const elDeleteBtn = $("deleteBtn");
  const elThread = $("thread");
  const elMessages = $("messages");
  const elJumpBtn = $("jumpBtn");
  const elAttachBtn = $("attachBtn");
  const elInput = $("input");
  const elImproveBtn = $("improveBtn");
  const elSendBtn = $("sendBtn");
  const elToast = $("toast");
  const elPaywall = $("paywall");
  const elPaywallText = $("paywallText");
  const elPaywallFine = $("paywallFine");
  const elRight = $("right");
  const elToggleRightBtn = $("toggleRightBtn");
  const elSummarizeConvBtn = $("summarizeConvBtn");
  const elTaskifyBtn = $("taskifyBtn");
  const elSoundToggle = $("soundToggle");
  const elSystemPrompt = $("systemPrompt");
  const elSaveSystemBtn = $("saveSystemBtn");
  const elShareUrl = $("shareUrl");
  const elCreateShareBtn = $("createShareBtn");
  const elRevokeShareBtn = $("revokeShareBtn");
  const elPromptList = $("promptList");
  const elPromptTitle = $("promptTitle");
  const elPromptBody = $("promptBody");
  const elSavePromptBtn = $("savePromptBtn");
  const elNotesBody = $("notesBody");
  const elNotesMeta = $("notesMeta");
  const elMemoryList = $("memoryList");
  const elMemoryText = $("memoryText");
  const elSaveMemoryBtn = $("saveMemoryBtn");
  const elFileInput = $("fileInput");
  const elUploadBtn = $("uploadBtn");
  const elFileList = $("fileList");
  const elAnalyzeFileSelect = $("analyzeFileSelect");
  const elAnalyzeQuestion = $("analyzeQuestion");
  const elAppendAnalysis = $("appendAnalysis");
  const elAnalyzeBtn = $("analyzeBtn");
  const elQuickPrompts = $("quickPrompts");
  const elFocusToggle = $("focusToggle");

  const state = {
    conversations: [],
    activeConversationId: null,
    messages: [],
    prompts: [],
    memories: [],
    files: [],
    streaming: false,
    aborter: null,
    lastSearch: "",
    soundEnabled: false,
    focusMode: false,
  };

  const SOUND_KEY = "lamp_sound_enabled";
  const FOCUS_KEY = "lamp_focus_mode";
  const DRAFT_KEY_PREFIX = "lamp_draft_";
  const REACT_KEY_PREFIX = "lamp_react_";
  let audioCtx = null;

  function isReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) {
      return false;
    }
  }

  function loadSoundPref() {
    try {
      state.soundEnabled = window.localStorage.getItem(SOUND_KEY) === "1";
    } catch (e) {
      state.soundEnabled = false;
    }
    if (elSoundToggle) elSoundToggle.checked = state.soundEnabled;
  }

  function loadFocusPref() {
    try {
      state.focusMode = window.localStorage.getItem(FOCUS_KEY) === "1";
    } catch (e) {
      state.focusMode = false;
    }
    setFocusMode(state.focusMode);
    if (elFocusToggle) elFocusToggle.checked = state.focusMode;
  }

  function setFocusMode(on) {
    state.focusMode = !!on;
    if (elApp) elApp.classList.toggle("focus", state.focusMode);
    if (state.focusMode) {
      if (elSidebar) elSidebar.classList.remove("open");
      if (elRight) elRight.classList.remove("open");
    }
  }

  function draftKey(conversationId) {
    return DRAFT_KEY_PREFIX + String(conversationId || "");
  }

  function saveDraft(conversationId, text) {
    if (!conversationId) return;
    const key = draftKey(conversationId);
    const t = String(text || "");
    try {
      if (!t.trim()) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, t);
    } catch (e) {}
  }

  function loadDraft(conversationId) {
    if (!conversationId) return "";
    try {
      return window.localStorage.getItem(draftKey(conversationId)) || "";
    } catch (e) {
      return "";
    }
  }

  function reactKey(messageId) {
    return REACT_KEY_PREFIX + String(messageId || "");
  }

  function getReaction(messageId) {
    if (!messageId) return "";
    try { return window.localStorage.getItem(reactKey(messageId)) || ""; } catch (e) { return ""; }
  }

  function setReaction(messageId, val) {
    if (!messageId) return;
    const key = reactKey(messageId);
    const v = String(val || "");
    try {
      if (!v) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, v);
    } catch (e) {}
  }

  async function ensureAudio() {
    if (audioCtx) return audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    if (audioCtx.state === "suspended") {
      try { await audioCtx.resume(); } catch (e) {}
    }
    return audioCtx;
  }

  async function playSound(kind) {
    if (!state.soundEnabled) return;
    if (isReducedMotion()) return;
    const ctx = await ensureAudio();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Master volume (keep subtle).
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.12, now);
    master.connect(ctx.destination);

    const mkEnv = (attack, decay, peak) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
      g.connect(master);
      return g;
    };

    const mkOsc = (type, freq, env) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, now);
      o.connect(env);
      return o;
    };

    // Tiny noise burst generator (for "whoosh/pop").
    const mkNoise = (env, hp = 800, lp = 6000) => {
      const dur = 0.08;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;

      const hi = ctx.createBiquadFilter();
      hi.type = "highpass";
      hi.frequency.setValueAtTime(hp, now);

      const lo = ctx.createBiquadFilter();
      lo.type = "lowpass";
      lo.frequency.setValueAtTime(lp, now);

      src.connect(hi);
      hi.connect(lo);
      lo.connect(env);
      return src;
    };

    if (kind === "toggle") {
      const env = mkEnv(0.006, 0.06, 0.10);
      const o = mkOsc("triangle", 1150, env);
      o.start(now);
      o.stop(now + 0.08);
      return;
    }

    if (kind === "send") {
      const envA = mkEnv(0.008, 0.12, 0.10);
      const envN = mkEnv(0.002, 0.08, 0.06);
      const o1 = mkOsc("sine", 940, envA);
      const o2 = mkOsc("sine", 620, envA);
      o1.frequency.exponentialRampToValueAtTime(680, now + 0.10);
      o2.frequency.exponentialRampToValueAtTime(420, now + 0.10);
      const n = mkNoise(envN, 900, 5200);
      o1.start(now); o2.start(now); n.start(now);
      o1.stop(now + 0.14); o2.stop(now + 0.14); n.stop(now + 0.09);
      return;
    }

    if (kind === "receive") {
      const envA = mkEnv(0.010, 0.20, 0.10);
      const o1 = mkOsc("sine", 640, envA);
      const o2 = mkOsc("sine", 960, envA);
      o1.frequency.exponentialRampToValueAtTime(860, now + 0.14);
      o2.frequency.exponentialRampToValueAtTime(1280, now + 0.14);
      o1.start(now);
      o2.start(now + 0.012);
      o1.stop(now + 0.24);
      o2.stop(now + 0.22);
      return;
    }

    if (kind === "error") {
      const env = mkEnv(0.006, 0.16, 0.12);
      const o = mkOsc("sawtooth", 260, env);
      o.frequency.exponentialRampToValueAtTime(190, now + 0.12);
      o.start(now);
      o.stop(now + 0.20);
    }
  }

  function toast(text, ms = 2400) {
    elToast.textContent = text;
    elToast.hidden = false;
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => (elToast.hidden = true), ms);
  }

  function showPaywall(errText, quota) {
    if (!elPaywall) return;
    const q = quota || {};
    const used = (typeof q.used === "number") ? q.used : null;
    const limit = (typeof q.limit === "number") ? q.limit : null;
    const resetAt = q.reset_at ? String(q.reset_at) : "";
    const day = q.day ? String(q.day) : "";
    const plan = q.plan ? String(q.plan) : "free";

    if (elPaywallText) {
      if (used != null && limit != null) elPaywallText.textContent = `You've used ${used} of ${limit} messages today on the Free plan.`;
      else elPaywallText.textContent = errText || "Upgrade to Pro to continue chatting.";
    }

    if (elPaywallFine) {
      const parts = [];
      if (plan) parts.push(`Plan: ${plan}`);
      if (day) parts.push(`Day: ${day}`);
      if (resetAt) {
        const d = new Date(resetAt);
        parts.push(`Resets: ${Number.isNaN(d.getTime()) ? resetAt : d.toLocaleString()}`);
      }
      elPaywallFine.textContent = parts.join(" · ");
    }

    elPaywall.hidden = false;
    elPaywall.setAttribute("aria-hidden", "false");
  }

  function hidePaywall() {
    if (!elPaywall) return;
    elPaywall.hidden = true;
    elPaywall.setAttribute("aria-hidden", "true");
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      ...opts,
    });
    let data = null;
    try {
      data = await res.json();
    } catch (e) {}
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function apiForm(path, formData, method = "POST") {
    const res = await fetch(path, { method, body: formData, credentials: "same-origin" });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  function escapeHtml(s) {
    return (s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function fmtTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function nearBottom() {
    const pad = 160;
    return elThread.scrollHeight - elThread.scrollTop - elThread.clientHeight < pad;
  }

  function scrollToBottom(opts = {}) {
    const prefersReduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const behavior = opts.behavior || (prefersReduced ? "auto" : "auto");
    try {
      elThread.scrollTo({ top: elThread.scrollHeight, behavior });
    } catch (e) {
      elThread.scrollTop = elThread.scrollHeight;
    }
  }

  function updateJump() {
    elJumpBtn.hidden = nearBottom();
  }

  function autosize() {
    elInput.style.height = "auto";
    elInput.style.height = Math.min(elInput.scrollHeight, 160) + "px";
  }

  function simpleHighlight(code, lang) {
    const esc = escapeHtml(code);
    const kwPy = "\\b(def|class|return|import|from|as|for|while|if|elif|else|try|except|finally|with|lambda|yield|True|False|None)\\b";
    const kwJs = "\\b(function|const|let|var|return|if|else|for|while|import|from|export|async|await|try|catch|new|class|this|true|false|null|undefined)\\b";
    const kw = (lang || "").startsWith("py") ? kwPy : (lang || "").startsWith("js") ? kwJs : "\\b\\b";
    // Very light heuristic: strings, numbers, then keywords.
    let out = esc
      .replace(/("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*')/g, '<span class="str">$1</span>')
      .replace(/\b(\d+(\.\d+)?)\b/g, '<span class="num">$1</span>');
    if (kw !== "\\b\\b") out = out.replace(new RegExp(kw, "g"), '<span class="kw">$1</span>');
    out = out.replace(/(^|\n)(\s*(#|\/\/).*)/g, '$1<span class="com">$2</span>');
    return out;
  }

  function renderMarkdown(md) {
    const src = (md || "").replace(/\r\n/g, "\n");
    const parts = src.split(/```/);
    let html = "";
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        // code fence: "lang\ncode..."
        const block = parts[i];
        const nl = block.indexOf("\n");
        let lang = "";
        let code = block;
        if (nl !== -1) {
          lang = block.slice(0, nl).trim().toLowerCase();
          code = block.slice(nl + 1);
        }
        html += `<pre><code class="lang-${escapeHtml(lang)}">${simpleHighlight(code, lang)}</code></pre>`;
        continue;
      }
      let t = escapeHtml(parts[i]);
      // inline code
      t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
      // bold
      t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      // links
      t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
      // lists (very basic)
      const lines = t.split("\n");
      let inUl = false;
      let inOl = false;
      for (const line of lines) {
        const mUl = line.match(/^\s*[-*]\s+(.*)$/);
        const mOl = line.match(/^\s*\d+\.\s+(.*)$/);
        if (mUl) {
          if (inOl) {
            html += "</ol>";
            inOl = false;
          }
          if (!inUl) {
            html += "<ul>";
            inUl = true;
          }
          html += `<li>${mUl[1]}</li>`;
          continue;
        }
        if (mOl) {
          if (inUl) {
            html += "</ul>";
            inUl = false;
          }
          if (!inOl) {
            html += "<ol>";
            inOl = true;
          }
          html += `<li>${mOl[1]}</li>`;
          continue;
        }
        if (inUl) {
          html += "</ul>";
          inUl = false;
        }
        if (inOl) {
          html += "</ol>";
          inOl = false;
        }
        if (line.trim() === "") {
          html += "<p></p>";
        } else {
          html += `<p>${line}</p>`;
        }
      }
      if (inUl) html += "</ul>";
      if (inOl) html += "</ol>";
    }
    return html;
  }

  function mkChip(label, title, onClick, opts = {}) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (opts.active ? " active" : "") + (opts.className ? " " + opts.className : "");
    b.textContent = label;
    if (title) b.title = title;
    if (opts.active != null) b.setAttribute("aria-pressed", opts.active ? "true" : "false");
    b.addEventListener("click", onClick);
    return b;
  }

  function enhanceCodeBlocks(root) {
    if (!root) return;
    root.querySelectorAll("pre").forEach((pre) => {
      if (pre.querySelector(".codecopy")) return;
      const code = pre.querySelector("code");
      if (!code) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "codecopy";
      btn.textContent = "Copy";
      btn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(code.textContent || "");
          toast("Code copied");
          playSound("toggle");
        } catch (e) {
          toast("Copy failed");
          playSound("error");
        }
      });
      pre.appendChild(btn);
    });
  }

  async function sendText(text, { allowEmpty = false } = {}) {
    if (state.streaming) return;
    const t = String(text || "");
    if (!allowEmpty && !t.trim()) return;
    const conversationId = state.activeConversationId;
    if (conversationId) saveDraft(conversationId, "");
    elInput.value = "";
    autosize();
    elInput.disabled = true;
    elSendBtn.disabled = true;
    await stream({ message: t, regenerate: false });
  }

  function getSelectionInInput() {
    try {
      const s = elInput.selectionStart;
      const e = elInput.selectionEnd;
      if (typeof s !== "number" || typeof e !== "number") return "";
      if (e <= s) return "";
      return (elInput.value || "").slice(s, e);
    } catch (e) {
      return "";
    }
  }

  function insertIntoInput(text) {
    const next = String(text || "");
    const cur = String(elInput.value || "");
    const sel = getSelectionInInput();
    if (sel) {
      // Replace selection with the prompt including the selection if present.
      const s = elInput.selectionStart;
      const e = elInput.selectionEnd;
      elInput.value = cur.slice(0, s) + next + cur.slice(e);
    } else if (!cur.trim()) {
      elInput.value = next;
    } else {
      elInput.value = cur + "\n\n" + next;
    }
    autosize();
    elInput.focus();
  }

  function renderQuickPrompts() {
    if (!elQuickPrompts) return;
    elQuickPrompts.innerHTML = "";

    const items = [
      { label: "Summarize", text: "Summarize our conversation so far in 8 bullet points." },
      { label: "Explain Simple", text: "Explain this in simple terms:\n\n" },
      { label: "Plan", text: "Make a step-by-step plan for this:\n\n" },
      { label: "Ideas", text: "Give me 10 practical ideas for:\n\n" },
      { label: "Rewrite", text: "Rewrite this to be clearer and more professional:\n\n" },
      { label: "Surprise", text: "Surprise me with a creative, useful answer to my last message." },
    ];

    for (const it of items) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "qp";
      b.textContent = it.label;
      b.addEventListener("click", async (ev) => {
        const sel = getSelectionInInput();
        const t = (it.text || "") + (sel ? sel : "");
        if (ev && ev.shiftKey) return sendText(t);
        insertIntoInput(t);
        playSound("toggle");
      });
      elQuickPrompts.appendChild(b);
    }
  }

  function renderMessages() {
    const prevTop = elThread ? elThread.scrollTop : 0;
    const wasNear = elThread ? nearBottom() : true;
    elMessages.innerHTML = "";
    for (const m of state.messages) {
      const wrap = document.createElement("div");
      wrap.className = `msg ${m.role === "user" ? "user" : "assistant"}`;
      wrap.dataset.id = String(m.id || "");

      const bubble = document.createElement("div");
      bubble.className = "bubble";

      const md = document.createElement("div");
      md.className = "md";
      const isLast = state.messages.length && state.messages[state.messages.length - 1].id === m.id;
      const isTyping = m.role !== "user" && !String(m.content || "") && state.streaming && isLast;
      if (isTyping) {
        md.classList.add("typing");
        md.innerHTML = '<span class="dots" aria-label="Typing"><i></i><i></i><i></i></span>';
      } else {
        md.innerHTML = renderMarkdown(m.content || "");
        enhanceCodeBlocks(md);
      }
      bubble.appendChild(md);

      const meta = document.createElement("div");
      meta.className = "meta";
      const left = document.createElement("div");
      left.textContent = `${m.role === "user" ? "You" : "Lamp"} - ${fmtTime(m.created_at_utc)}${m.edited_at_utc ? " - edited" : ""}`;
      const actions = document.createElement("div");
      actions.className = "actions";

      actions.appendChild(
        mkChip("Copy", "Copy message", async () => {
          try {
            await navigator.clipboard.writeText(m.content || "");
            toast("Copied");
          } catch (e) {
            toast("Copy failed");
          }
        }),
      );

      if (m.role === "user") {
        actions.appendChild(
          mkChip("Edit", "Edit message", async () => {
            const next = prompt("Edit your message:", m.content || "");
            if (next == null) return;
            const trimmed = (next || "").trim();
            if (!trimmed) return toast("Message can't be empty");
            try {
              await api(`/api/ai/messages/${m.id}`, { method: "PATCH", body: JSON.stringify({ content: trimmed }) });
              await loadMessages(state.activeConversationId);
              await stream({ regenerate: true });
            } catch (err) {
              toast(err.message || "Edit failed");
            }
          }),
        );
      } else {
        if (isLast) {
          actions.appendChild(
            mkChip("Regenerate", "Regenerate last answer", async () => {
              await stream({ regenerate: true });
            }),
          );
        }
        const r = getReaction(m.id);
        actions.appendChild(
          mkChip("Like", "Mark as helpful", async () => {
            const cur = getReaction(m.id);
            setReaction(m.id, cur === "up" ? "" : "up");
            renderMessages();
          }, { active: r === "up" }),
        );
        actions.appendChild(
          mkChip("Dislike", "Mark as not helpful", async () => {
            const cur = getReaction(m.id);
            setReaction(m.id, cur === "down" ? "" : "down");
            renderMessages();
          }, { active: r === "down" }),
        );
        actions.appendChild(
          mkChip("Remember", "Save as memory", async () => {
            try {
              await api("/api/ai/memories", {
                method: "POST",
                body: JSON.stringify({ text: (m.content || "").slice(0, 600), source_conversation_id: state.activeConversationId || 0 }),
              });
              toast("Saved to memory");
              await loadMemories();
            } catch (err) {
              toast(err.message || "Failed");
            }
          }),
        );
      }

      meta.appendChild(left);
      meta.appendChild(actions);

      wrap.appendChild(bubble);
      wrap.appendChild(meta);
      elMessages.appendChild(wrap);
    }
    if (elThread) {
      if (wasNear) requestAnimationFrame(() => scrollToBottom());
      else elThread.scrollTop = prevTop;
    }
    updateJump();
  }

  function renderChatList() {
    elChatList.innerHTML = "";
    for (const c of state.conversations) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chat-item" + (c.id === state.activeConversationId ? " active" : "");
      btn.dataset.id = String(c.id);

      const left = document.createElement("div");
      const title = document.createElement("div");
      title.className = "chat-item__title";
      title.textContent = c.title || "New chat";
      const preview = document.createElement("div");
      preview.className = "chat-item__preview";
      preview.textContent = (c.last && (c.last.preview || "")) || "";
      left.appendChild(title);
      left.appendChild(preview);

      const right = document.createElement("div");
      if (c.is_pinned) {
        const pill = document.createElement("div");
        pill.className = "pill";
        pill.textContent = "Pinned";
        right.appendChild(pill);
      }
      if (c.is_bookmarked) {
        const pill = document.createElement("div");
        pill.className = "pill";
        pill.textContent = "Saved";
        right.appendChild(pill);
      }

      btn.appendChild(left);
      btn.appendChild(right);
      btn.addEventListener("click", () => selectConversation(c.id));
      elChatList.appendChild(btn);
    }
  }

  async function loadConversations(q = "") {
    state.lastSearch = q;
    const data = await api(`/api/ai/conversations?q=${encodeURIComponent(q)}&limit=120`, { method: "GET" });
    state.conversations = data.conversations || [];
    renderChatList();
  }

  async function loadMessages(conversationId) {
    if (!conversationId) return;
    const data = await api(`/api/ai/conversations/${conversationId}/messages?limit=500`, { method: "GET" });
    state.messages = data.messages || [];
    renderMessages();
    elChatMeta.textContent = "Ready";
    requestAnimationFrame(() => scrollToBottom());
  }

  function setActivePane(name) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.getAttribute("data-tab") === name));
    document.querySelectorAll(".pane").forEach((p) => p.classList.toggle("active", p.getAttribute("data-pane") === name));
  }

  function openRightPane(name) {
    setActivePane(name);
    if (window.innerWidth <= 980) elRight.classList.add("open");
  }

  async function selectConversation(conversationId) {
    const prevId = state.activeConversationId;
    if (prevId && prevId !== conversationId) saveDraft(prevId, elInput ? elInput.value : "");
    state.activeConversationId = conversationId;
    const c = state.conversations.find((x) => x.id === conversationId) || null;
    elChatTitle.textContent = (c && c.title) || "New chat";
    {
      const m = (c && c.mode) || "normal";
      const ok = Array.from(elModeSelect.options || []).some((o) => o.value === m);
      elModeSelect.value = ok ? m : "normal";
    }
    elPinBtn.textContent = c && c.is_pinned ? "Unpin" : "Pin";
    elBookmarkBtn.textContent = c && c.is_bookmarked ? "Unsave" : "Bookmark";
    elSystemPrompt.value = (c && c.system_prompt) || "";
    elShareUrl.value = "";
    renderChatList();
    await loadMessages(conversationId);
    await loadNotes(conversationId);
    await loadFiles(conversationId);
    if (elInput) {
      elInput.value = loadDraft(conversationId) || "";
      autosize();
    }
    if (window.innerWidth <= 980) elSidebar.classList.remove("open");
  }

  async function createConversation() {
    const data = await api("/api/ai/conversations", { method: "POST", body: JSON.stringify({ title: "New chat", mode: elModeSelect.value }) });
    const c = data.conversation;
    await loadConversations(state.lastSearch);
    await selectConversation(c.id);
  }

  function buildSlashCommand(text) {
    const t = (text || "").trim();
    if (!t.startsWith("/")) return null;
    const parts = t.split(/\s+/);
    const cmd = (parts[0] || "").toLowerCase();
    const rest = t.slice(parts[0].length).trim();
    if (cmd === "/summarize") return `Summarize the following:\n\n${rest}`;
    if (cmd === "/explain") return `Explain the following in simple terms:\n\n${rest}`;
    if (cmd === "/translate") return `Translate the following (keep meaning, improve naturalness):\n\n${rest}`;
    return null;
  }

  async function stream({ message = "", regenerate = false } = {}) {
    if (!state.activeConversationId) await createConversation();
    const conversationId = state.activeConversationId;

    if (state.aborter) state.aborter.abort();
    state.aborter = new AbortController();

    const sending = (message || "").trim();
    if (!regenerate && !sending) return;

    let promptText = sending;
    const slash = buildSlashCommand(sending);
    if (slash) promptText = slash;

    if (!regenerate) {
      // optimistic UI for user message
      state.messages.push({
        id: "tmp-" + Math.random().toString(16).slice(2),
        role: "user",
        content: promptText,
        created_at_utc: new Date().toISOString(),
        edited_at_utc: "",
      });
    }

    const assistantTmp = {
      id: "tmp-a-" + Math.random().toString(16).slice(2),
      role: "assistant",
      content: "",
      created_at_utc: new Date().toISOString(),
      edited_at_utc: "",
    };
    state.messages.push(assistantTmp);
    state.streaming = true;
    renderMessages();
    try {
      const kids = elMessages ? elMessages.children : null;
      if (kids && kids.length) {
        const last = kids[kids.length - 1];
        if (last) last.classList.add("new");
        if (!regenerate && kids.length >= 2) kids[kids.length - 2].classList.add("new");
      }
    } catch (e) {}
    requestAnimationFrame(() => scrollToBottom());
    playSound(regenerate ? "toggle" : "send");

    elChatMeta.textContent = "Lamp is thinking...";

    try {
      const res = await fetch(`/api/ai/conversations/${conversationId}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        signal: state.aborter.signal,
        body: JSON.stringify({
          message: promptText,
          mode: elModeSelect.value,
          regenerate,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
        }),
      });

      if (!res.ok) {
        let err = null;
        try { err = await res.json(); } catch (e) {}
        if (res.status === 429) {
          showPaywall((err && err.error) || "Daily limit reached.", err && err.quota ? err.quota : null);
        }
        throw new Error((err && err.error) || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let acc = "";
      let sawDone = false;

      const applyDelta = (d) => {
        acc += d;
        assistantTmp.content = acc;
        // Fast path during streaming: plain text. We'll re-render markdown after done.
        const last = elMessages.lastElementChild;
        if (last) {
          const md = last.querySelector(".md");
          if (md) md.textContent = acc;
        }
        if (nearBottom()) scrollToBottom();
        updateJump();
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let obj = null;
          try { obj = JSON.parse(trimmed); } catch (e) { continue; }
          if (obj.type === "meta") {
            if (obj.quota && obj.quota.plan === "free" && typeof obj.quota.used === "number") {
              elChatMeta.textContent = `thinking... (${obj.quota.used}/${obj.quota.limit || "?"})`;
            }
          } else if (obj.type === "delta") {
            applyDelta(obj.delta || "");
          } else if (obj.type === "error") {
            throw new Error(obj.error || "AI error");
          } else if (obj.type === "done") {
            sawDone = true;
            elChatMeta.textContent = "Ready";
          }
        }
      }
      if (sawDone) playSound("receive");
    } catch (err) {
      const msg = err && err.message ? err.message : "Send failed";
      toast(msg);
      elChatMeta.textContent = "Error";
      playSound("error");
    } finally {
      state.streaming = false;
      elInput.disabled = false;
      elSendBtn.disabled = false;
      // Refresh canonical messages with IDs + markdown rendering.
      await loadConversations(state.lastSearch);
      await loadMessages(state.activeConversationId);
      updateJump();
    }
  }

  async function loadPrompts() {
    const data = await api("/api/ai/prompts?limit=200", { method: "GET" });
    state.prompts = data.prompts || [];
    renderPrompts();
  }

  function renderPrompts() {
    elPromptList.innerHTML = "";
    if (!state.prompts.length) {
      const empty = document.createElement("div");
      empty.className = "fine";
      empty.textContent = "No saved prompts yet.";
      elPromptList.appendChild(empty);
      return;
    }
    for (const p of state.prompts) {
      const item = document.createElement("div");
      item.className = "item";
      const t = document.createElement("div");
      t.className = "item__title";
      t.textContent = p.title || "Untitled";
      const b = document.createElement("div");
      b.className = "item__body";
      b.textContent = (p.body || "").slice(0, 260);
      const row = document.createElement("div");
      row.className = "item__row";
      const ins = document.createElement("button");
      ins.className = "btn ghost small";
      ins.type = "button";
      ins.textContent = "Insert";
      ins.addEventListener("click", () => {
        elInput.value = (p.body || "") + (elInput.value ? "\n\n" + elInput.value : "");
        autosize();
        toast("Inserted prompt");
      });
      const del = document.createElement("button");
      del.className = "btn ghost small";
      del.type = "button";
      del.textContent = "Delete";
      del.addEventListener("click", async () => {
        if (!confirm("Delete this prompt?")) return;
        try {
          await api(`/api/ai/prompts/${p.id}`, { method: "DELETE" });
          await loadPrompts();
        } catch (e) {
          toast(e.message || "Delete failed");
        }
      });
      row.appendChild(ins);
      row.appendChild(del);
      item.appendChild(t);
      item.appendChild(b);
      item.appendChild(row);
      elPromptList.appendChild(item);
    }
  }

  async function loadMemories() {
    const data = await api("/api/ai/memories?limit=80", { method: "GET" });
    state.memories = data.memories || [];
    renderMemories();
  }

  function renderMemories() {
    elMemoryList.innerHTML = "";
    if (!state.memories.length) {
      const empty = document.createElement("div");
      empty.className = "fine";
      empty.textContent = "No memories saved.";
      elMemoryList.appendChild(empty);
      return;
    }
    for (const m of state.memories) {
      const item = document.createElement("div");
      item.className = "item";
      const b = document.createElement("div");
      b.className = "item__body";
      b.textContent = m.text || "";
      const row = document.createElement("div");
      row.className = "item__row";
      const del = document.createElement("button");
      del.className = "btn ghost small";
      del.type = "button";
      del.textContent = "Delete";
      del.addEventListener("click", async () => {
        try {
          await api(`/api/ai/memories/${m.id}`, { method: "DELETE" });
          await loadMemories();
        } catch (e) {
          toast(e.message || "Delete failed");
        }
      });
      row.appendChild(del);
      item.appendChild(b);
      item.appendChild(row);
      elMemoryList.appendChild(item);
    }
  }

  async function loadNotes(conversationId) {
    if (!conversationId) return;
    try {
      const data = await api(`/api/ai/conversations/${conversationId}/notes`, { method: "GET" });
      elNotesBody.value = (data.note && data.note.body) || "";
      elNotesMeta.textContent = (data.note && data.note.updated_at_utc) ? `Saved ${new Date(data.note.updated_at_utc).toLocaleString()}` : "Not saved yet";
    } catch (e) {
      elNotesBody.value = "";
      elNotesMeta.textContent = "Not loaded";
    }
  }

  async function saveNotesDebounced() {
    const conversationId = state.activeConversationId;
    if (!conversationId) return;
    window.clearTimeout(saveNotesDebounced._t);
    saveNotesDebounced._t = window.setTimeout(async () => {
      try {
        const data = await api(`/api/ai/conversations/${conversationId}/notes`, {
          method: "PUT",
          body: JSON.stringify({ body: elNotesBody.value || "" }),
        });
        elNotesMeta.textContent = `Saved ${new Date((data.note && data.note.updated_at_utc) || Date.now()).toLocaleString()}`;
      } catch (e) {
        elNotesMeta.textContent = "Save failed";
      }
    }, 450);
  }

  async function loadFiles(conversationId) {
    if (!conversationId) return;
    const data = await api(`/api/ai/conversations/${conversationId}/files`, { method: "GET" });
    state.files = data.files || [];
    renderFiles();
  }

  function renderFiles() {
    elFileList.innerHTML = "";
    elAnalyzeFileSelect.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "Select a file";
    elAnalyzeFileSelect.appendChild(opt0);
    for (const f of state.files) {
      const item = document.createElement("div");
      item.className = "item";
      const t = document.createElement("div");
      t.className = "item__title";
      t.textContent = f.filename || "file";
      const b = document.createElement("div");
      b.className = "item__body";
      b.textContent = `${f.mime || ""} - ${Math.round((f.size_bytes || 0) / 1024)} KB`;
      const row = document.createElement("div");
      row.className = "item__row";
      const open = document.createElement("a");
      open.className = "btn ghost small";
      open.textContent = "Open";
      open.href = f.url || "#";
      open.target = "_blank";
      open.rel = "noreferrer";
      const del = document.createElement("button");
      del.className = "btn ghost small";
      del.type = "button";
      del.textContent = "Delete";
      del.addEventListener("click", async () => {
        if (!confirm("Delete this file?")) return;
        try {
          await api(`/api/ai/files/${f.id}`, { method: "DELETE" });
          await loadFiles(state.activeConversationId);
        } catch (e) {
          toast(e.message || "Delete failed");
        }
      });
      row.appendChild(open);
      row.appendChild(del);
      item.appendChild(t);
      item.appendChild(b);
      item.appendChild(row);
      elFileList.appendChild(item);

      const opt = document.createElement("option");
      opt.value = String(f.id);
      opt.textContent = f.filename || String(f.id);
      elAnalyzeFileSelect.appendChild(opt);
    }
    if (!state.files.length) {
      const empty = document.createElement("div");
      empty.className = "fine";
      empty.textContent = "No files uploaded.";
      elFileList.appendChild(empty);
    }
  }

  function attach() {
  elThread.addEventListener("scroll", updateJump);
  elJumpBtn.addEventListener("click", () => scrollToBottom({ behavior: "smooth" }));

  loadSoundPref();
  loadFocusPref();
  renderQuickPrompts();
  if (elSoundToggle) {
    elSoundToggle.addEventListener("change", () => {
      state.soundEnabled = !!elSoundToggle.checked;
      try { window.localStorage.setItem(SOUND_KEY, state.soundEnabled ? "1" : "0"); } catch (e) {}
      if (state.soundEnabled) {
        ensureAudio();
        playSound("toggle");
      }
    });
  }

  if (elFocusToggle) {
    elFocusToggle.addEventListener("change", () => {
      setFocusMode(!!elFocusToggle.checked);
      try { window.localStorage.setItem(FOCUS_KEY, state.focusMode ? "1" : "0"); } catch (e) {}
      playSound("toggle");
    });
  }

    elToggleSidebarBtn.addEventListener("click", () => {
      elSidebar.classList.toggle("open");
    });

    if (elOpenToolsBtn) {
      elOpenToolsBtn.addEventListener("click", () => openRightPane("tools"));
    }

    if (elToggleRightBtn) {
      elToggleRightBtn.addEventListener("click", () => elRight.classList.toggle("open"));
    }

    document.querySelectorAll(".tab").forEach((t) => {
      t.addEventListener("click", () => setActivePane(t.getAttribute("data-tab") || "tools"));
    });

    document.addEventListener("keydown", (ev) => {
      if (ev.ctrlKey && ev.shiftKey && (ev.key === "F" || ev.key === "f")) {
        ev.preventDefault();
        const next = !state.focusMode;
        setFocusMode(next);
        if (elFocusToggle) elFocusToggle.checked = next;
        try { window.localStorage.setItem(FOCUS_KEY, next ? "1" : "0"); } catch (e) {}
        playSound("toggle");
      }
    });

    elNewChatBtn.addEventListener("click", async () => {
      try { await createConversation(); } catch (e) { toast(e.message || "Failed"); }
    });

    elChatSearch.addEventListener("input", async () => {
      const q = (elChatSearch.value || "").trim();
      try { await loadConversations(q); } catch (e) {}
    });

    elSendBtn.addEventListener("click", async () => {
      const t = (elInput.value || "").trim();
      if (!t) return;
      await sendText(t);
    });

    elInput.addEventListener("input", () => {
      const conversationId = state.activeConversationId;
      if (!conversationId) return;
      window.clearTimeout(elInput._draftT);
      elInput._draftT = window.setTimeout(() => {
        saveDraft(conversationId, elInput.value || "");
      }, 220);
    });

    elAttachBtn.addEventListener("click", () => {
      openRightPane("files");
      elFileInput.click();
    });

    elUploadBtn.addEventListener("click", () => {
      openRightPane("files");
      elFileInput.click();
    });

    elFileInput.addEventListener("change", async () => {
      const conversationId = state.activeConversationId;
      const f = elFileInput.files && elFileInput.files[0];
      elFileInput.value = "";
      if (!conversationId || !f) return;
      try {
        const fd = new FormData();
        fd.append("file", f);
        await apiForm(`/api/ai/conversations/${conversationId}/files`, fd, "POST");
        toast("Uploaded");
        await loadFiles(conversationId);
      } catch (e) {
        toast(e.message || "Upload failed");
      }
    });

    elAnalyzeBtn.addEventListener("click", async () => {
      const fileId = parseInt(elAnalyzeFileSelect.value || "0", 10) || 0;
      if (!fileId) return toast("Select a file");
      const q = (elAnalyzeQuestion.value || "").trim() || "Summarize this file.";
      try {
        const data = await api("/api/ai/tools/analyze-file", {
          method: "POST",
          body: JSON.stringify({
            file_id: fileId,
            question: q,
            append_to_chat: !!elAppendAnalysis.checked,
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
          }),
        });
        toast("Analysis ready");
        if (elAppendAnalysis.checked) {
          await loadMessages(state.activeConversationId);
        } else {
          openRightPane("notes");
          elNotesBody.value = `# File analysis\n\n${data.result}\n\n` + (elNotesBody.value || "");
          saveNotesDebounced();
        }
      } catch (e) {
        toast(e.message || "Analyze failed");
      }
    });

    elImproveBtn.addEventListener("click", async () => {
      const draft = (elInput.value || "").trim();
      if (!draft) return toast("Write a draft first");
      try {
        const data = await api("/api/ai/tools/improve-prompt", {
          method: "POST",
          body: JSON.stringify({ draft, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "" }),
        });
        elInput.value = data.prompt || draft;
        autosize();
        toast("Improved");
      } catch (e) {
        toast(e.message || "Improve failed");
      }
    });

    elSummarizeConvBtn.addEventListener("click", async () => {
      const conversationId = state.activeConversationId;
      if (!conversationId) return;
      try {
        const data = await api(`/api/ai/tools/summarize-conversation/${conversationId}`, {
          method: "POST",
          body: JSON.stringify({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "" }),
        });
        toast("Summary saved");
        await loadConversations(state.lastSearch);
        // Put summary into notes for visibility.
        if (data.summary) {
          elNotesBody.value = `# Summary\n\n${data.summary}\n\n` + (elNotesBody.value || "");
          saveNotesDebounced();
          openRightPane("notes");
        }
      } catch (e) {
        toast(e.message || "Summarize failed");
      }
    });

    elTaskifyBtn.addEventListener("click", async () => {
      openRightPane("tools");
      await stream({ message: "Turn our conversation into a prioritized task list with next actions. Use checkboxes.", regenerate: false });
    });

    elSaveSystemBtn.addEventListener("click", async () => {
      const conversationId = state.activeConversationId;
      if (!conversationId) return;
      try {
        await api(`/api/ai/conversations/${conversationId}`, {
          method: "PATCH",
          body: JSON.stringify({ system_prompt: elSystemPrompt.value || "" }),
        });
        toast("Saved");
        await loadConversations(state.lastSearch);
      } catch (e) {
        toast(e.message || "Save failed");
      }
    });

    elShareBtn.addEventListener("click", () => openRightPane("tools"));
    elCreateShareBtn.addEventListener("click", async () => {
      const conversationId = state.activeConversationId;
      if (!conversationId) return;
      try {
        const data = await api(`/api/ai/conversations/${conversationId}/share`, { method: "POST", body: "{}" });
        elShareUrl.value = (data.share && data.share.url) || "";
        if (elShareUrl.value) {
          try { await navigator.clipboard.writeText(elShareUrl.value); toast("Share link copied"); } catch (e) { toast("Share link created"); }
        } else {
          toast("Share link created");
        }
      } catch (e) {
        toast(e.message || "Share failed");
      }
    });
    elRevokeShareBtn.addEventListener("click", async () => {
      const conversationId = state.activeConversationId;
      if (!conversationId) return;
      try {
        await api(`/api/ai/conversations/${conversationId}/share`, { method: "DELETE" });
        elShareUrl.value = "";
        toast("Revoked");
      } catch (e) {
        toast(e.message || "Revoke failed");
      }
    });

    elInput.addEventListener("input", autosize);
    elInput.addEventListener("keydown", async (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        elSendBtn.click();
      }
    });

    elRenameBtn.addEventListener("click", async () => {
      const id = state.activeConversationId;
      if (!id) return;
      const cur = (state.conversations.find((c) => c.id === id) || {}).title || "New chat";
      const next = prompt("Rename chat:", cur);
      if (next == null) return;
      const title = (next || "").trim();
      if (!title) return;
      try {
        await api(`/api/ai/conversations/${id}`, { method: "PATCH", body: JSON.stringify({ title }) });
        await loadConversations(state.lastSearch);
        elChatTitle.textContent = title;
      } catch (e) {
        toast(e.message || "Rename failed");
      }
    });

    elSavePromptBtn.addEventListener("click", async () => {
      const title = (elPromptTitle.value || "").trim();
      const body = (elPromptBody.value || "").trim();
      if (!title || !body) return toast("Title and body required");
      try {
        await api("/api/ai/prompts", { method: "POST", body: JSON.stringify({ title, body }) });
        elPromptTitle.value = "";
        elPromptBody.value = "";
        toast("Saved");
        await loadPrompts();
      } catch (e) {
        toast(e.message || "Save failed");
      }
    });

    elSaveMemoryBtn.addEventListener("click", async () => {
      const text = (elMemoryText.value || "").trim();
      if (!text) return toast("Memory is empty");
      try {
        await api("/api/ai/memories", { method: "POST", body: JSON.stringify({ text, source_conversation_id: state.activeConversationId || 0 }) });
        elMemoryText.value = "";
        toast("Saved");
        await loadMemories();
      } catch (e) {
        toast(e.message || "Save failed");
      }
    });

    elNotesBody.addEventListener("input", saveNotesDebounced);

    elPinBtn.addEventListener("click", async () => {
      const id = state.activeConversationId;
      if (!id) return;
      const c = state.conversations.find((x) => x.id === id) || {};
      const next = !c.is_pinned;
      try {
        await api(`/api/ai/conversations/${id}`, { method: "PATCH", body: JSON.stringify({ is_pinned: next }) });
        await loadConversations(state.lastSearch);
        await selectConversation(id);
      } catch (e) {
        toast(e.message || "Pin failed");
      }
    });

    elBookmarkBtn.addEventListener("click", async () => {
      const id = state.activeConversationId;
      if (!id) return;
      const c = state.conversations.find((x) => x.id === id) || {};
      const next = !c.is_bookmarked;
      try {
        await api(`/api/ai/conversations/${id}`, { method: "PATCH", body: JSON.stringify({ is_bookmarked: next }) });
        await loadConversations(state.lastSearch);
        await selectConversation(id);
      } catch (e) {
        toast(e.message || "Bookmark failed");
      }
    });

    elDeleteBtn.addEventListener("click", async () => {
      const id = state.activeConversationId;
      if (!id) return;
      if (!confirm("Delete this chat? This cannot be undone.")) return;
      try {
        await api(`/api/ai/conversations/${id}`, { method: "DELETE" });
        state.activeConversationId = null;
        state.messages = [];
        renderMessages();
        await loadConversations(state.lastSearch);
        if (state.conversations[0]) await selectConversation(state.conversations[0].id);
        else await createConversation();
      } catch (e) {
        toast(e.message || "Delete failed");
      }
    });

    elExportBtn.addEventListener("click", () => {
      const id = state.activeConversationId;
      if (!id) return;
      const fmt = prompt("Export format: md, txt, or json", "md");
      if (!fmt) return;
      const f = fmt.trim().toLowerCase();
      const title = (elChatTitle.textContent || "chat").replace(/[^\w\- ]+/g, "").trim() || "chat";
      if (f === "json") {
        download(`${title}.json`, JSON.stringify({ conversation_id: id, messages: state.messages }, null, 2), "application/json");
        return;
      }
      if (f === "txt") {
        download(`${title}.txt`, toTxt(state.messages), "text/plain");
        return;
      }
      download(`${title}.md`, toMd(state.messages), "text/markdown");
    });

    document.addEventListener("keydown", async (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        elChatSearch.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        try { await createConversation(); } catch (err) {}
      }
      if (e.key === "Escape") {
        if (window.innerWidth <= 980) elSidebar.classList.remove("open");
        if (window.innerWidth <= 980) elRight.classList.remove("open");
      }
    });
  }

  function toTxt(msgs) {
    return msgs
      .map((m) => `${m.role === "user" ? "You" : "Lamp"} (${fmtTime(m.created_at_utc)}):\n${m.content}\n`)
      .join("\n");
  }

  function toMd(msgs) {
    return msgs
      .map((m) => `### ${m.role === "user" ? "You" : "Lamp"}\n\n${m.content}\n`)
      .join("\n");
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Exported");
  }

  async function boot() {
    if (elPaywall) {
      elPaywall.addEventListener("click", (ev) => {
        const t = ev.target;
        const close = t && t.closest ? t.closest("[data-close]") : null;
        if (close) hidePaywall();
      });
      document.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") hidePaywall();
      });
    }

    attach();
    autosize();
    updateJump();

    // Prime audio on first user gesture (required by some browsers).
    const primeAudio = () => {
      if (!state.soundEnabled) return;
      ensureAudio();
      window.removeEventListener("pointerdown", primeAudio, { capture: true });
      window.removeEventListener("keydown", primeAudio, { capture: true });
    };
    window.addEventListener("pointerdown", primeAudio, { capture: true, passive: true });
    window.addEventListener("keydown", primeAudio, { capture: true });

    try {
      await loadPrompts();
      await loadMemories();
      await loadConversations("");
      if (state.conversations[0]) await selectConversation(state.conversations[0].id);
      else await createConversation();
    } catch (e) {
      toast(e.message || "Failed to load");
    }
  }

  boot();
})();
