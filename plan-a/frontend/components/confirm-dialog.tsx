"use client"

import { useEffect } from "react"

interface ConfirmDialogProps {
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
  cancelLabel?: string
}

export function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  confirmLabel,
  cancelLabel,
}: ConfirmDialogProps) {
  // Lock body scroll when dialog is open
  useEffect(() => {
    const original = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = original
    }
  }, [])

  // Handle Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel()
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.40)" }}
      onClick={onCancel}
    >
      <div
        className="pixel-confirm-dialog"
        style={{
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 0,
          boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
          maxWidth: 320,
          width: "100%",
          animation: "pixel-confirm-in 0.2s ease-out both",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <h3
            className="font-pixel"
            style={{
              fontSize: 12,
              color: "var(--muted-foreground)",
              letterSpacing: "0.08em",
              lineHeight: 1,
              margin: 0,
            }}
          >
            确认删除
          </h3>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 16px" }}>
          <p
            style={{
              fontSize: 14,
              color: "var(--foreground)",
              lineHeight: 1.6,
              margin: 0,
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            {message}
          </p>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            borderTop: "1px solid var(--border)",
          }}
        >
          <button
            onClick={onCancel}
            className="pixel-confirm-btn pixel-confirm-btn-cancel"
          >
            {cancelLabel || "取消"}
          </button>
          <button
            onClick={onConfirm}
            className="pixel-confirm-btn pixel-confirm-btn-delete"
          >
            {confirmLabel || "删除"}
          </button>
        </div>
      </div>
    </div>
  )
}
