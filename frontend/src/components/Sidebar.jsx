import React from "react";
import { useI18n } from "../lib/i18n.js";

export default function Sidebar({
  username,
  soundEnabled,
  onToggleSound,
  conversations,
  activeId,
  search,
  onSearch,
  onNewChat,
  onSelect,
  onDelete,
  onClose,
  className,
}) {
  const { t } = useI18n();
  const LONG_PRESS_MS = 2000;
  const pressTimerRef = React.useRef(null);
  const longPressFiredRef = React.useRef(false);

  function displayConvTitle(rawTitle) {
    const title = String(rawTitle || "").trim();
    if (!title) return "";
    if (title.toLowerCase() === "new chat") return "";
    return title;
  }

  function clearPressTimer() {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }

  return (
    <aside className={["panel h-full w-[300px] shrink-0 flex flex-col", className].filter(Boolean).join(" ")}>
      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-2xl border chip grid place-items-center shadow-float">
              <span className="text-[12px] font-semibold tracking-widest t1">Yaan</span>
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-semibold tracking-[0.18em] uppercase t1 truncate">
                Yaan
              </div>
              <div className="text-xs t2 truncate">{t("assistant")}</div>
            </div>
          </div>

          <button
            className="icon-btn"
            type="button"
            onClick={onNewChat}
            title={t("new_chat")}
            aria-label={t("new_chat")}
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="mt-4">
          <input
            className="sb-input"
            placeholder={t("search_chats_placeholder")}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="px-2 pb-2 flex-1 min-h-0">
        <div className="px-3 pb-2 text-[11px] tracking-[0.18em] uppercase t3">
          {t("chats")}
        </div>

        <div className="h-full overflow-auto px-2 space-y-1">
          {conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                // If a long-press just triggered, swallow the click that follows.
                if (longPressFiredRef.current) {
                  longPressFiredRef.current = false;
                  return;
                }
                onSelect(c.id);
                onClose?.();
              }}
              onPointerDown={(e) => {
                // Only left click / primary touch.
                if (typeof e.button === "number" && e.button !== 0) return;
                if (!onDelete) return;
                clearPressTimer();
                longPressFiredRef.current = false;
                pressTimerRef.current = window.setTimeout(() => {
                  longPressFiredRef.current = true;
                  onDelete?.(c.id);
                }, LONG_PRESS_MS);
              }}
              onPointerUp={clearPressTimer}
              onPointerCancel={clearPressTimer}
              onPointerLeave={clearPressTimer}
              onContextMenu={(e) => {
                // Desktop convenience: right-click offers the same delete action.
                if (!onDelete) return;
                e.preventDefault();
                onDelete?.(c.id);
              }}
              className={[
                "w-full text-left rounded-xl2 px-3 py-2 border transition",
                c.id === activeId
                  ? "chip border-accent/35 shadow-[0_14px_44px_rgba(0,0,0,0.18)]"
                  : "bg-transparent border-transparent hover:chip2 hover:border-[color:var(--border)]",
              ].join(" ")}
            >
              <div className="text-sm font-medium t1 truncate">
                {displayConvTitle(c.title) || t("new_chat")}
              </div>
              <div className="text-xs t2 truncate mt-0.5">
                {(c.last && c.last.preview) || ""}
              </div>
            </button>
          ))}

          {!conversations.length && (
            <div className="px-3 py-4 text-sm t2">{t("no_chats_yet")}</div>
          )}
        </div>
      </div>

      <div className="border-t p-4" style={{ borderColor: "var(--border)", background: "var(--chip2)" }}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium t1 truncate">{username || "User"}</div>
            <div className="text-xs t2 truncate">{t("premium_ui")}</div>
          </div>
          <label className="flex items-center gap-2 text-xs t2 select-none">
            <input
              type="checkbox"
              className="accent-accent"
              checked={!!soundEnabled}
              onChange={(e) => onToggleSound?.(e.target.checked)}
            />
            {t("sound")}
          </label>
        </div>
      </div>
    </aside>
  );
}
