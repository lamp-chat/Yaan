import React from "react";

export default function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      <span className="h-1.5 w-1.5 rounded-full bg-accent/80 animate-pulse-dot [animation-delay:-0.2s]" />
      <span className="h-1.5 w-1.5 rounded-full bg-accent/70 animate-pulse-dot [animation-delay:-0.1s]" />
      <span className="h-1.5 w-1.5 rounded-full bg-accent/60 animate-pulse-dot" />
    </div>
  );
}
