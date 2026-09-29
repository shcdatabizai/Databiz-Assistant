"use client";

import { useEffect, useRef, useState } from "react";

/** 경량 팝오버 (Radix 의존성 없이 매핑사유 등 짧은 텍스트 노출용) */
export function MiniPopover({
  trigger,
  children,
  side = "top",
  width = 280,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <span
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {trigger}
      </span>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            [side === "top" ? "bottom" : "top"]: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 300,
            marginBottom: side === "top" ? 8 : 0,
            marginTop: side === "bottom" ? 8 : 0,
            background: "#fff",
            border: "1px solid #ebe9f1",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            padding: 12,
            width,
            fontSize: "0.8125rem",
            whiteSpace: "pre-wrap",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
