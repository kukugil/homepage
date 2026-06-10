"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { BluetoothScreenshotHint } from "./bluetooth-screenshot-hint"

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
    const original = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = original }
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

    // Clone modal for animation
    const clone = modal.cloneNode(true) as HTMLElement
    clone.style.position = "fixed"
    clone.style.left = `${mRect.left}px`
    clone.style.top = `${mRect.top}px`
    clone.style.width = `${mRect.width}px`
    clone.style.height = `${mRect.height}px`
    clone.style.margin = "0"
    clone.style.pointerEvents = "none"
    clone.style.zIndex = "99999"
    clone.style.transformOrigin = "center center"
    clone.style.maxHeight = "none"
    clone.style.overflow = "hidden"
    document.body.appendChild(clone)

    // Hide real modal + overlay
    modal.style.opacity = "0"
    if (overlayRef.current) overlayRef.current.style.opacity = "0"

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
            使用帮助
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
          <Section num="0" title="前置准备">
            <ul className="space-y-1" style={{ listStyle: "none", padding: 0 }}>
              <Li>MCU 阅读器已开机，蓝牙正常</Li>
              <Li>智能手机（Android / iOS，浏览器建议 Chrome）</Li>
              <Li>手机能正常上网（首次加载网页，之后 PWA 缓存可离线）</Li>
            </ul>
          </Section>

          <Section num="1" title="开启蓝牙共享网络">
            <p className="mb-1">在手机蓝牙设置中连接 MCU，并开启蓝牙共享网络：</p>
            <ul className="space-y-1" style={{ paddingLeft: "1.3em" }}>
              <li><b>Android</b>：打开设置 → 顶部搜索栏输入「蓝牙共享网络」→ 进入并开启蓝牙网络共享</li>
            </ul>
            <BluetoothScreenshotHint />
            <Note>开启后 MCU 与手机保持在 3 米以内，蓝牙信号过远会导致传书中断。</Note>
          </Section>

          <Section num="2" title="手机蓝牙配对 MCU">
            <ol className="space-y-1" style={{ paddingLeft: "1.3em" }}>
              <li>打开手机「设置 → 蓝牙」</li>
              <li>扫描附近设备，找到 MCU 设备（名称 E6S-XX-XX-XX-XX-XX-XX）</li>
              <li>点击配对</li>
            </ol>
            <Note>部分 Android 机型首次配对后需在蓝牙设备设置中勾选「互联网访问」。</Note>
          </Section>

          <Section num="3" title="扫码进入传书主页">
            <ol className="space-y-1" style={{ paddingLeft: "1.3em" }}>
              <li>打开 MCU 上的「传书」功能，屏幕显示二维码</li>
              <li>用手机扫描二维码，浏览器自动跳转到传书主页</li>
              <li>页面顶部 SN 号自动填充，状态显示「已连接」</li>
            </ol>
            <Note>如果 SN 未自动填充，可手动输入。格式：字母或数字开头，1-64 位，仅允许字母、数字和连字符(-)。</Note>
          </Section>

          <Section num="4" title="上传文件">
            <ol className="space-y-1" style={{ paddingLeft: "1.3em" }}>
              <li>在「上传文件」标签页点击上传区域</li>
              <li>选择要传输的文件（支持多选）</li>
              <li>等待进度条走完，文件名旁出现 ✓ 即上传成功</li>
            </ol>
            <table className="w-full my-2.5" style={{ borderCollapse: "collapse", fontSize: "11px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--secondary)" }}>
                  <th style={{ padding: "4px 8px", textAlign: "left", fontWeight: 600, color: "var(--muted-foreground)", fontSize: "11px", fontFamily: "system-ui, -apple-system, sans-serif" }}>格式</th>
                  <th style={{ padding: "4px 8px", textAlign: "left", fontWeight: 600, color: "var(--muted-foreground)", fontSize: "11px", fontFamily: "system-ui, -apple-system, sans-serif" }}>扩展名</th>
                  <th style={{ padding: "4px 8px", textAlign: "left", fontWeight: 600, color: "var(--muted-foreground)", fontSize: "11px", fontFamily: "system-ui, -apple-system, sans-serif" }}>说明</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["纯文本", ".txt", "文本文件"],
                  ["电子书", ".epub", "EPUB 标准格式"],
                  ["固件", ".bin", "二进制固件/波形"],
                ].map(([type, ext, desc], i) => (
                  <tr key={ext} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "var(--card)" : "color-mix(in srgb, var(--secondary), transparent 50%)" }}>
                    <td style={{ padding: "4px 8px" }}>{type}</td>
                    <td style={{ padding: "4px 8px", fontFamily: "var(--font-mono)", fontSize: "10.5px" }}>{ext}</td>
                    <td style={{ padding: "4px 8px", color: "var(--muted-foreground)", fontSize: "11px" }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Note>单文件最大 500 MB。超过 512 KB 自动分片上传。上传区域灰色不可点击表示 SN 未验证通过，请先完成前三步。</Note>
          </Section>

          <Section num="5" title="推送文件到 MCU">
            <ol className="space-y-1" style={{ paddingLeft: "1.3em" }}>
              <li>切换到「文件列表」标签页</li>
              <li>勾选想要推送的文件（可多选）</li>
              <li>点击「推送选中 (N)」按钮</li>
              <li>等待顶部提示「已推送 N 个文件，请在阅读器上进行同步」</li>
            </ol>
            <Note>拖拽文件左侧手柄可调整排序，拖拽后自动保存。删除文件有确认弹窗，删除不可恢复。</Note>
          </Section>

          <Section num="6" title="MCU 端同步">
            <ol className="space-y-1" style={{ paddingLeft: "1.3em" }}>
              <li>在 MCU 二维码界面下方点击「开始同步」按钮</li>
              <li>MCU 自动下载已推送的文件到本地存储</li>
              <li>同步完成后，重新进入阅读器刷新书架</li>
              <li>书籍出现在书架中，固件（.bin）在固件管理区</li>
            </ol>
            <Note>同步过程中请保持手机蓝牙共享网络开启，且 MCU 在 3 米范围内。</Note>
          </Section>

          {/* ===== FAQ ===== */}
          <div style={{ marginTop: "18px", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
            <h3 className="mb-2" style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted-foreground)", fontFamily: "system-ui, -apple-system, sans-serif" }}>常见问题 FAQ</h3>
            <div className="space-y-0">
              {[
                { q: "上传区域灰色不能点？", a: "SN 号未输入或格式不正确。确认顶部状态为「已连接」。" },
                { q: "扫码后 SN 没有自动填充？", a: "确认二维码包含 SN 信息。如没有，请在 MCU 设置中查看 SN 后手动输入。" },
                { q: "扫描二维码失败？", a: "检查浏览器摄像头权限。推荐使用 Chrome（支持原生扫码）。仍失败可手动输入 SN。" },
                { q: "上传文件失败？", a: "检查文件不超过 500 MB，网络通畅。刷新重试，文件名建议用英文或数字。" },
                { q: "推送后 MCU 同步不到？", a: "确认手机蓝牙共享网络仍开启，MCU 在蓝牙范围内。点击「开始同步」后重新进入阅读器刷新书架。" },
                { q: "SN 格式有什么要求？", a: "字母或数字开头，1-64 位，仅允许字母、数字、连字符(-)。示例：SN001、Reader-Pro-2024。" },
              ].map(({ q, a }, i) => (
                <div key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <button onClick={() => setFaqOpen(faqOpen === i ? null : i)} className="w-full flex items-center gap-2 py-2.5 text-left" style={{ fontSize: "12px", color: "var(--foreground)", background: "none", border: "none", cursor: "pointer", padding: "10px 0" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, border: "1px solid var(--border)", fontSize: "10px", color: "var(--muted-foreground)", flexShrink: 0 }}>{faqOpen === i ? "−" : "+"}</span>
                    <span>{q}</span>
                  </button>
                  {faqOpen === i && <p className="pl-6 pr-2 pb-2.5" style={{ fontSize: "11px", color: "var(--muted-foreground)", lineHeight: "1.6" }}>{a}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 底部关闭按钮 */}
        <div className="flex-shrink-0" style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
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
