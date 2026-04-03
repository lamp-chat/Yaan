import React from "react";
import { useI18n } from "../lib/i18n.js";

function fmtTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function IconCopy(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M9 9h10v10H9V9Z" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5 15H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconThumbUp(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M7 11v10H3V11h4Z" stroke="currentColor" strokeWidth="2" />
      <path
        d="M7 11 12 3a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2l-1 8a2 2 0 0 1-2 2H7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconThumbDown(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M7 13V3H3v10h4Z" stroke="currentColor" strokeWidth="2" />
      <path
        d="M7 13 12 21a2 2 0 0 0 2-2v-4h5a2 2 0 0 0 2-2l-1-8a2 2 0 0 0-2-2H7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function MessageBubble({ msg, onCopy, onReact }) {
  const { t } = useI18n();
  const isUser = msg.role === "user";
  const meta = [
    isUser ? t("you") : "Yaan",
    msg.created_at_utc ? fmtTime(msg.created_at_utc) : "",
    msg.edited_at_utc ? t("edited") : "",
  ].filter(Boolean).join(" - ");

  return (
    <div className={`group flex ${isUser ? "justify-end" : "justify-start"} animate-fade-up`}>
      <div className="max-w-[92vw] sm:max-w-[760px] w-fit">
        <div
          className={[
            "rounded-2xl px-4 py-3 border",
            "transition duration-200 ease-out",
            isUser
              ? "chip shadow-[0_18px_60px_rgba(0,0,0,0.20)]"
              : "chip2 shadow-[0_18px_60px_rgba(0,0,0,0.14)]",
          ].join(" ")}
        >
          <div className="whitespace-pre-wrap leading-relaxed text-[15px] t1">
            {msg.content || ""}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 px-1 text-xs t2">
          <div className="truncate">{meta}</div>

          <div className="msg-actions flex items-center gap-2 transition duration-200">
            <button
              type="button"
              className="inline-flex items-center gap-2 px-2 py-1 rounded-full border chip2 hover:bg-[color:var(--chip)] transition"
              onClick={() => onCopy?.(msg)}
              title={t("copy")}
            >
              <IconCopy className="h-4 w-4" />
              <span>{t("copy")}</span>
            </button>

            {!isUser && (
              <>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 px-2 py-1 rounded-full border chip2 hover:bg-[color:var(--chip)] transition"
                  onClick={() => onReact?.(msg, "up")}
                  title={t("helpful")}
                >
                  <IconThumbUp className="h-4 w-4" />
                  <span>{t("good")}</span>
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 px-2 py-1 rounded-full border chip2 hover:bg-[color:var(--chip)] transition"
                  onClick={() => onReact?.(msg, "down")}
                  title={t("not_helpful")}
                >
                  <IconThumbDown className="h-4 w-4" />
                  <span>{t("nope")}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
