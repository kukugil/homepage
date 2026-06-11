"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { BluetoothScreenshotHint } from "./bluetooth-screenshot-hint"
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock"

interface GuideModalProps {
  onClose: () => void
  guideButtonRef?: React.RefObject<{ guideButtonRect: () => DOMRect | null } | null>
}

function maybeReduceMotion(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function GuideModal({ onClose, guideButtonRef }: GuideModalProps) {
  const [visible, setVisible] = useState(false)
  const [faqOpen, setFaqOpen] = useState<number | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const closingRef = useRef(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
  useBodyScrollLock(true)
  }, [])

  // FLIP close: clone + Web Animations API
  const handleClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true

    const finishClose = () => {
      onClose()
    }

    const modal = modalRef.current
    const target = guideButtonRef?.current?.guideButtonRect() ?? null
    const reduce = maybeReduceMotion()

    // Fallback: simple fade
    if (!modal || !target || reduce) {
      if (overlayRef.current) {
        const fade = overlayRef.current.animate(
          [{ opacity: 1 }, { opacity: 0 }],
          { duration: 180, easing: "ease-in", fill: "forwards" }
        )
        fade.onfinish = finishClose
        fade.oncancel = finishClose
      } else {
        finishClose()
      }
      return
    }

    const mRect = modal.getBoundingClientRect()
    const modalCenterX = mRect.left + mRect.width / 2
    const modalCenterY = mRect.top + mRect.height / 2
    const targetCenterX = target.left + target.width / 2
    const targetCenterY = target.top + target.height / 2
    const scale = Math.max(0.06, Math.min(0.14, target.width / mRect.width))
    const dx = targetCenterX - modalCenterX
    const dy = targetCenterY - modalCenterY

    // Lightweight snapshot — avoid deep-cloning heavy DOM
    const clone = document.createElement("div")
    clone.style.position = "fixed"
    clone.style.left = `${mRect.left}px`
    clone.style.top = `${mRect.top}px`
    clone.style.width = `${mRect.width}px`
    clone.style.height = `${mRect.height}px`
    clone.style.background = "var(--card)"
    clone.style.border = "1px solid var(--border)"
    clone.style.borderRadius = "0px"
    clone.style.boxShadow = "0 4px 24px rgba(0,0,0,0.15)"
    clone.style.pointerEvents = "none"
    clone.style.zIndex = "99999"
    clone.style.transformOrigin = "center center"
    clone.style.willChange = "transform, opacity"
    clone.style.backfaceVisibility = "hidden"
    document.body.appendChild(clone)

    // Hide real modal + overlay — GPU-promote to avoid flicker
    modal.style.willChange = "opacity"
    modal.style.opacity = "0"
    modal.style.pointerEvents = "none"
    if (overlayRef.current) {
      overlayRef.current.style.willChange = "opacity"
      overlayRef.current.style.opacity = "0"
    }

    // Web Animations API
    const anim = clone.animate(
      [
        { transform: "translate(0px, 0px) scale(1)", opacity: 1, borderRadius: "0px" },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0, borderRadius: "12px" },
      ],
      { duration: 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" }
    )

    const cleanup = () => {
      clone.remove()
      finishClose()
    }
    anim.onfinish = cleanup
    anim.oncancel = cleanup
  }, [onClose, guideButtonRef])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose() }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [handleClose])

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      style={{ backgroundColor: visible ? "rgba(0,0,0,0.40)" : "rgba(0,0,0,0)", transition: "background-color 0.2s ease" }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div
        ref={modalRef}
        className="bg-card w-full sm:max-w-lg relative flex flex-col"
        style={{
          border: "1px solid var(--border)",
          borderRadius: 0,
          boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
          maxHeight: "90vh",
          transform: visible ? "scale(1)" : "scale(0.95)",
          transformOrigin: "center center",
          opacity: visible ? 1 : 0,
          transition: "transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ===== 标题栏 ===== */}
        <div className="flex items-center gap-3 flex-shrink-0" style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--card)" }}>
          <h3 className="flex-1 select-none" style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", fontFamily: "system-ui, -apple-system, sans-serif", lineHeight: 1, margin: 0 }}>
            首次传书，只需 3 步
          </h3>
          <button onClick={handleClose} style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer", padding: 0 }} aria-label="关闭">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="1.5" y="2.5" width="1.5" height="8" fill="currentColor" transform="rotate(45 2.25 6.5)" />
              <rect x="9" y="2.5" width="1.5" height="8" fill="currentColor" transform="rotate(-45 9.75 6.5)" />
            </svg>
          </button>
        </div>

        {/* ===== 可滚动内容区 ===== */}
        <div className="overflow-y-auto flex-1" style={{ padding: "16px 20px", fontSize: "13px", lineHeight: "1.7" }}>

          {/* 步骤 1：连接阅读器 */}
          <Section num="1" title="连接阅读器">
            <p style={{ margin: "2px 0" }}>
              在手机蓝牙设置中连接 MCU，并开启蓝牙共享网络。
            </p>
            <BluetoothScreenshotHint compact />
          </Section>

          {/* 步骤 2：扫码进入页面 */}
          <Section num="2" title="扫码进入页面">
            <p style={{ margin: "2px 0" }}>
              扫描阅读器上的二维码，SN 会自动填入页面顶部。
            </p>
          </Section>

          {/* 步骤 3：上传并推送 */}
          <Section num="3" title="上传并推送">
            <p style={{ margin: "2px 0" }}>
              选择文件上传，上传完成后到文件列表勾选并推送。
            </p>
          </Section>

        </div>

        {/* 底部按钮 */}
        <div className="flex-shrink-0" style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
          <a href="https://ereader.fun" target="_blank" rel="noopener noreferrer"
            className="block text-center select-none"
            style={{ padding: "10px 0", background: "var(--secondary)", color: "var(--foreground)", border: "1px solid var(--border)", fontSize: "14px", borderRadius: 0, fontFamily: "system-ui, -apple-system, sans-serif", cursor: "pointer", textDecoration: "none" }}>
            查看完整指南
          </a>
          <button onClick={handleClose} className="w-full select-none" style={{ padding: "10px 0", background: "var(--card)", color: "var(--foreground)", border: "1px solid var(--border)", fontSize: "14px", borderRadius: 0, fontFamily: "system-ui, -apple-system, sans-serif", cursor: "pointer" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--secondary)" }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--card)" }}>
            知道了
          </button>
        </div>
      </div>
    </div>
  )
}

// ===== 子组件 =====

function Section({ num, title, tbd, children }: { num: string; title: string; tbd?: boolean; children: React.ReactNode }) {
  const borderColor = tbd ? "var(--muted-foreground)" : "var(--primary)"
  const textColor = tbd ? "var(--muted-foreground)" : "var(--foreground)"
  return (
    <div className="mb-4" style={{ borderLeft: `2px solid ${borderColor}`, paddingLeft: "10px" }}>
      <h3 className="mb-1.5" style={{ fontSize: "13px", fontWeight: 600, color: textColor, fontFamily: "system-ui, -apple-system, sans-serif", lineHeight: 1.3 }}>
        第{num}步 · {title}{tbd ? " [待定]" : ""}
      </h3>
      <div style={{ fontSize: "13px", lineHeight: "1.7", color: "var(--foreground)" }}>{children}</div>
    </div>
  )
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ display: "flex", gap: "6px", alignItems: "baseline" }}>
      <span style={{ color: "var(--muted-foreground)", flexShrink: 0, fontSize: "10px" }}>&#x2023;</span>
      <span>{children}</span>
    </li>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2" style={{ padding: "10px 12px", borderLeft: "2px solid var(--border)", background: "var(--secondary)", fontSize: "11px", color: "var(--muted-foreground)", lineHeight: "1.55" }}>
      {children}
    </div>
  )
}
