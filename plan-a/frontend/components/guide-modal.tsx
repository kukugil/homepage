"use client"

import { useEffect, useState } from "react"

interface GuideModalProps {
  onClose: () => void
}

export function GuideModal({ onClose }: GuideModalProps) {
  const [visible, setVisible] = useState(false)
  const [faqOpen, setFaqOpen] = useState<number | null>(null)

  // 入场动画
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  // Body 滚动锁定
  useEffect(() => {
    const original = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = original
    }
  }, [])

  // Esc 键关闭
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      style={{
        backgroundColor: visible ? "rgba(0,0,0,0.40)" : "rgba(0,0,0,0)",
        transition: "background-color 0.2s ease",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-card w-full sm:max-w-lg relative flex flex-col"
        style={{
          border: "1px solid var(--border)",
          borderRadius: 0,
          boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
          maxHeight: "90vh",
          transform: visible ? "scale(1)" : "scale(0.95)",
          opacity: visible ? 1 : 0,
          transition: "transform 0.2s ease-out, opacity 0.2s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ===== 标题栏 ===== */}
        <div
          className="flex items-center gap-3 flex-shrink-0"
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
            background: "var(--card)",
          }}
        >
          <h3
            className="flex-1 select-none"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--foreground)",
              fontFamily: "system-ui, -apple-system, sans-serif",
              lineHeight: 1,
              margin: 0,
            }}
          >
            使用帮助
          </h3>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--muted-foreground)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
            aria-label="关闭"
          >
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="1.5" y="2.5" width="1.5" height="8" fill="currentColor" transform="rotate(45 2.25 6.5)" />
              <rect x="9" y="2.5" width="1.5" height="8" fill="currentColor" transform="rotate(-45 9.75 6.5)" />
            </svg>
          </button>
        </div>

        {/* ===== 可滚动内容区 ===== */}
        <div className="overflow-y-auto flex-1" style={{ padding: "16px 20px", fontSize: "13px", lineHeight: "1.7" }}>
          {/* 前置准备 */}
          <Section num="0" title="前置准备">
            <ul className="space-y-1" style={{ listStyle: "none", padding: 0 }}>
              <Li>MCU 阅读器已开机，蓝牙正常</Li>
              <Li>智能手机（Android / iOS，浏览器建议 Chrome）</Li>
              <Li>手机能正常上网（首次加载网页，之后 PWA 缓存可离线）</Li>
            </ul>
          </Section>

          {/* 第一步 */}
          <Section num="1" title="手机蓝牙配对 MCU">
            <ol className="space-y-1" style={{ paddingLeft: "1.3em" }}>
              <li>打开手机「设置 → 蓝牙」</li>
              <li>扫描附近设备，找到 MCU 设备（名称类似 E-Reader-XXXX）</li>
              <li>点击配对</li>
            </ol>
            <Note>部分 Android 机型首次配对后需在蓝牙设备设置中勾选「互联网访问」，否则下一步无法联网。</Note>
          </Section>

          {/* 第二步 */}
          <Section num="2" title="开启蓝牙共享网络">
            <p className="mb-1">让 MCU 通过手机蓝牙访问网络：</p>
            <ul className="space-y-1" style={{ paddingLeft: "1.3em" }}>
              <li><b>Android</b>：设置 → 连接与共享 → 蓝牙网络共享 → 开启</li>
              <li><b>iOS</b>：设置 → 蓝牙 → 已配对设备 → 开启网络共享</li>
            </ul>
            <Note>开启后 MCU 与手机保持在 3 米以内，蓝牙信号过远会导致传书中断。</Note>
          </Section>

          {/* 第三步 */}
          <Section num="3" title="扫码进入传书主页">
            <ol className="space-y-1" style={{ paddingLeft: "1.3em" }}>
              <li>打开 MCU 上的「传书」功能，屏幕显示二维码</li>
              <li>用手机扫描二维码，浏览器自动跳转到传书主页</li>
              <li>页面顶部 SN 号自动填充，状态显示「已连接」</li>
            </ol>
            <Note>如果 SN 未自动填充，可手动输入。格式：字母或数字开头，1-64 位，仅允许字母、数字和连字符(-)。</Note>
          </Section>

          {/* 第四步 */}
          <Section num="4" title="上传文件">
            <ol className="space-y-1" style={{ paddingLeft: "1.3em" }}>
              <li>在「上传文件」标签页点击上传区域</li>
              <li>选择要传输的文件（支持多选）</li>
              <li>等待进度条走完，文件名旁出现 ✓ 即上传成功</li>
            </ol>
            {/* 格式表 */}
            <table
              className="w-full my-2.5"
              style={{ borderCollapse: "collapse", fontSize: "11px" }}
            >
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
                  ["文档", ".pdf", "PDF 文档"],
                  ["音频", ".mp3", "MP3 音频"],
                  ["固件", ".bin", "二进制固件"],
                  ["固件", ".fw", "固件镜像"],
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

          {/* 第五步 */}
          <Section num="5" title="推送文件到 MCU">
            <ol className="space-y-1" style={{ paddingLeft: "1.3em" }}>
              <li>切换到「文件列表」标签页</li>
              <li>勾选想要推送的文件（可多选）</li>
              <li>点击「推送选中 (N)」按钮</li>
              <li>等待顶部提示「已推送 N 个文件，请在阅读器上进行同步」</li>
            </ol>
            <Note>拖拽文件左侧手柄可调整排序，拖拽后自动保存。删除文件有确认弹窗，删除不可恢复。</Note>
          </Section>

          {/* 第六步 — 待定 */}
          <Section num="6" title="MCU 端同步" tbd>
            <div
              className="text-center"
              style={{
                padding: "14px 12px",
                border: "1px dashed var(--border)",
                background: "var(--secondary)",
                fontSize: "12px",
                color: "var(--muted-foreground)",
                lineHeight: "1.6",
              }}
            >
              此步骤待定，请以 MCU 设备实际界面和操作为准。
              <br />
              待硬件团队确认后更新。
            </div>
          </Section>

          {/* ===== FAQ ===== */}
          <div style={{ marginTop: "18px", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
            <h3
              className="mb-2"
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--muted-foreground)",
                fontFamily: "system-ui, -apple-system, sans-serif",
              }}
            >
              常见问题 FAQ
            </h3>
            <div className="space-y-0">
              {[
                { q: "上传区域灰色不能点？", a: "SN 号未输入或格式不正确。确认顶部状态为「已连接」。" },
                { q: "扫码后 SN 没有自动填充？", a: "确认二维码包含 SN 信息。如没有，请在 MCU 设置中查看 SN 后手动输入。" },
                { q: "扫描二维码失败？", a: "检查浏览器摄像头权限。推荐使用 Chrome（支持原生扫码）。仍失败可手动输入 SN。" },
                { q: "上传文件失败？", a: "检查文件不超过 500 MB，网络通畅。刷新重试，文件名建议用英文或数字。" },
                { q: "SN 格式有什么要求？", a: "字母或数字开头，1-64 位，仅允许字母、数字、连字符(-)。示例：SN001、Reader-Pro-2024。" },
              ].map(({ q, a }, i) => (
                <div key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <button
                    onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                    className="w-full flex items-center gap-2 py-2.5 text-left"
                    style={{
                      fontSize: "12px",
                      color: "var(--foreground)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "10px 0",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 16,
                        height: 16,
                        border: "1px solid var(--border)",
                        fontSize: "10px",
                        color: "var(--muted-foreground)",
                        flexShrink: 0,
                      }}
                    >
                      {faqOpen === i ? "−" : "+"}
                    </span>
                    <span>{q}</span>
                  </button>
                  {faqOpen === i && (
                    <p
                      className="pl-6 pr-2 pb-2.5"
                      style={{ fontSize: "11px", color: "var(--muted-foreground)", lineHeight: "1.6" }}
                    >
                      {a}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ===== 底部关闭按钮 ===== */}
        <div className="flex-shrink-0" style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
          <button
            onClick={onClose}
            className="w-full select-none"
            style={{
              padding: "10px 0",
              background: "var(--card)",
              color: "var(--foreground)",
              border: "1px solid var(--border)",
              fontSize: "14px",
              borderRadius: 0,
              fontFamily: "system-ui, -apple-system, sans-serif",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--secondary)" }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--card)" }}
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  )
}

// ===== 子组件 =====

function Section({
  num,
  title,
  tbd,
  children,
}: {
  num: string
  title: string
  tbd?: boolean
  children: React.ReactNode
}) {
  const borderColor = tbd ? "var(--muted-foreground)" : "var(--primary)"
  const textColor = tbd ? "var(--muted-foreground)" : "var(--foreground)"

  return (
    <div
      className="mb-4"
      style={{
        borderLeft: `2px solid ${borderColor}`,
        paddingLeft: "10px",
      }}
    >
      <h3
        className="mb-1.5"
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: textColor,
          fontFamily: "system-ui, -apple-system, sans-serif",
          lineHeight: 1.3,
        }}
      >
        第{num}步 · {title}
        {tbd ? " [待定]" : ""}
      </h3>
      <div style={{ fontSize: "13px", lineHeight: "1.7", color: "var(--foreground)" }}>
        {children}
      </div>
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
    <div
      className="mt-2"
      style={{
        padding: "10px 12px",
        borderLeft: "2px solid var(--border)",
        background: "var(--secondary)",
        fontSize: "11px",
        color: "var(--muted-foreground)",
        lineHeight: "1.55",
      }}
    >
      {children}
    </div>
  )
}
