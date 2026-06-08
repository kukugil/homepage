"use client"

import { useEffect, useRef, useState } from "react"

interface GuideModalProps {
  onClose: () => void
}

export function GuideModal({ onClose }: GuideModalProps) {
  const [visible, setVisible] = useState(false)
  const [faqOpen, setFaqOpen] = useState<number | null>(null)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{
        background: visible ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0)',
        transition: 'background 0.2s ease',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-card w-full sm:max-w-lg relative flex flex-col"
        style={{
          outline: '2px solid var(--accent)',
          outlineOffset: '-4px',
          border: '4px solid var(--accent)',
          borderRadius: 0,
          boxShadow: '6px 6px 0px rgba(0,0,0,0.25)',
          maxHeight: '90vh',
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(100%) scale(0.96)',
          transition: 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* ===== 标题栏 ===== */}
        <div
          className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
          style={{
            background: 'repeating-linear-gradient(0deg, var(--accent) 0px, var(--accent) 2px, rgba(196,106,62,0.7) 2px, rgba(196,106,62,0.7) 4px)',
          }}
        >
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2.5 h-2.5"
                style={{
                  background: i === 1 ? '#ffffff' : 'rgba(255,255,255,0.3)',
                  boxShadow: i === 1 ? '0 0 6px rgba(255,255,255,0.6)' : 'none',
                }}
              />
            ))}
          </div>
          <span
            className="font-pixel tracking-widest select-none flex-1"
            style={{
              color: '#ffffff',
              fontSize: '11px',
              letterSpacing: '0.15em',
              textShadow: '2px 2px 0px rgba(0,0,0,0.5)',
            }}
          >
            使用帮助 · USER GUIDE
          </span>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center flex-shrink-0"
            style={{ color: 'rgba(255,255,255,0.8)' }}
            aria-label="关闭"
          >
            <svg width="14" height="14" viewBox="0 0 14 14">
              <rect x="1" y="2" width="2" height="10" fill="currentColor" transform="rotate(45 2 7)" />
              <rect x="11" y="2" width="2" height="10" fill="currentColor" transform="rotate(-45 12 7)" />
            </svg>
          </button>
        </div>

        {/* ===== 可滚动内容区 ===== */}
        <div className="overflow-y-auto flex-1" style={{ padding: '16px' }}>
          {/* 前置准备 */}
          <Section num="0" title="前置准备" accent>
            <ul className="space-y-1" style={{ listStyle: 'none', padding: 0 }}>
              <Li>MCU 阅读器已开机，蓝牙正常</Li>
              <Li>智能手机（Android / iOS，浏览器建议 Chrome）</Li>
              <Li>手机能正常上网（首次加载网页，之后 PWA 缓存可离线）</Li>
            </ul>
          </Section>

          {/* 第一步 */}
          <Section num="1" title="手机蓝牙配对 MCU">
            <ol className="space-y-1" style={{ paddingLeft: '1.2em' }}>
              <li>打开手机「设置 → 蓝牙」</li>
              <li>扫描附近设备，找到 MCU 设备（名称类似 E-Reader-XXXX）</li>
              <li>点击配对</li>
            </ol>
            <Note>部分 Android 机型首次配对后需在蓝牙设备设置中勾选「互联网访问」，否则下一步无法联网。</Note>
          </Section>

          {/* 第二步 */}
          <Section num="2" title="开启蓝牙共享网络">
            <p className="mb-1">让 MCU 通过手机蓝牙访问网络：</p>
            <ul className="space-y-1" style={{ paddingLeft: '1.2em' }}>
              <li><b>Android</b>：设置 → 连接与共享 → 蓝牙网络共享 → 开启</li>
              <li><b>iOS</b>：设置 → 蓝牙 → 已配对设备 → 开启网络共享</li>
            </ul>
            <Note>开启后 MCU 与手机保持在 3 米以内，蓝牙信号过远会导致传书中断。</Note>
          </Section>

          {/* 第三步 */}
          <Section num="3" title="扫码进入传书主页">
            <ol className="space-y-1" style={{ paddingLeft: '1.2em' }}>
              <li>打开 MCU 上的「传书」功能 → 屏幕显示二维码</li>
              <li>用手机扫描二维码 → 浏览器自动跳转到传书主页</li>
              <li>页面顶部 SN 号自动填充，状态显示「已连接」</li>
            </ol>
            <Note>如果 SN 未自动填充，可手动输入。格式：字母或数字开头，1-64 位，仅允许字母、数字和连字符(-)。</Note>
          </Section>

          {/* 第四步 */}
          <Section num="4" title="上传书籍文件">
            <ol className="space-y-1" style={{ paddingLeft: '1.2em' }}>
              <li>在「上传书籍」标签页点击上传区域</li>
              <li>选择要传输的文件（支持多选）</li>
              <li>等待进度条走完，文件名旁出现 ✓ 即上传成功</li>
            </ol>
            <table
              className="w-full my-2"
              style={{ borderCollapse: 'collapse', fontSize: '11px' }}
            >
              <thead>
                <tr style={{ borderBottom: '2px solid var(--accent)' }}>
                  <th style={{ padding: '4px 8px', textAlign: 'left' }}>格式</th>
                  <th style={{ padding: '4px 8px', textAlign: 'left' }}>扩展名</th>
                  <th style={{ padding: '4px 8px', textAlign: 'left' }}>说明</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['纯文本', '.txt', '文本文件'],
                  ['电子书', '.epub', 'EPUB 标准格式'],
                  ['文档', '.pdf', 'PDF 文档'],
                  ['固件', '.bin', '二进制固件'],
                  ['固件', '.fw', '固件镜像'],
                ].map(([type, ext, desc]) => (
                  <tr key={ext} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '4px 8px' }}>{type}</td>
                    <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{ext}</td>
                    <td style={{ padding: '4px 8px', color: 'var(--muted-foreground)' }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Note>单文件最大 500 MB。超过 512 KB 自动分片上传，保障大文件稳定传输。上传区域灰色不可点击 = SN 未验证通过，请先完成前三步。</Note>
          </Section>

          {/* 第五步 */}
          <Section num="5" title="推送书籍到 MCU">
            <ol className="space-y-1" style={{ paddingLeft: '1.2em' }}>
              <li>切换到「书籍列表」标签页</li>
              <li>勾选想要推送的书籍（可多选）</li>
              <li>点击「推送选中 (N)」按钮</li>
              <li>等待顶部提示「已推送 N 本书，请在阅读器上进行同步」</li>
            </ol>
            <Note>拖拽书籍左侧手柄可调整排序，拖拽后自动保存。删除书籍有确认弹窗——删除不可恢复。</Note>
          </Section>

          {/* 第六步 — 待定 */}
          <Section num="6" title="MCU 端同步" tbd>
            <div
              className="px-3 py-3 text-center"
              style={{
                border: '2px dashed var(--accent)',
                background: 'var(--secondary)',
                fontSize: '12px',
                color: 'var(--muted-foreground)',
              }}
            >
              ⚠️ 此步骤待定，请以 MCU 设备实际界面和操作为准。
              <br />
              待硬件团队确认后更新。
            </div>
          </Section>

          {/* ===== FAQ ===== */}
          <div style={{ marginTop: '20px', borderTop: '2px solid var(--accent)', paddingTop: '12px' }}>
            <h3
              className="font-pixel tracking-widest mb-2"
              style={{ fontSize: '13px', color: 'var(--accent)' }}
            >
              ▸ 常见问题 FAQ
            </h3>
            <div className="space-y-1">
              {[
                { q: '上传区域灰色不能点？', a: 'SN 号未输入或格式不正确。确认顶部状态为「已连接」。' },
                { q: '扫码后 SN 没有自动填充？', a: '确认二维码包含 SN 信息。如没有，请在 MCU 设置中查看 SN 后手动输入。' },
                { q: '扫描二维码失败？', a: '检查浏览器摄像头权限。推荐使用 Chrome（支持原生扫码）。仍失败可手动输入 SN。' },
                { q: '上传文件失败？', a: '检查文件 ≤ 500 MB，网络通畅。刷新重试，文件名建议用英文/数字。' },
                { q: 'SN 格式有什么要求？', a: '字母或数字开头，1-64 位，仅允许字母、数字、连字符(-)。示例：SN001、Reader-Pro-2024。' },
              ].map(({ q, a }, i) => (
                <div key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <button
                    onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                    className="w-full flex items-center justify-between py-2 px-1 text-left hover:bg-secondary/20 transition-colors"
                    style={{ fontSize: '12px' }}
                  >
                    <span className="text-foreground">
                      {faqOpen === i ? '▾' : '▸'} {q}
                    </span>
                  </button>
                  {faqOpen === i && (
                    <p
                      className="px-3 pb-2"
                      style={{ fontSize: '11px', color: 'var(--muted-foreground)', lineHeight: '1.5' }}
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
        <div className="flex-shrink-0 px-4 py-3 border-t-2 border-border" style={{ borderTopColor: 'var(--accent)' }}>
          <button
            onClick={onClose}
            className="w-full py-3 font-pixel tracking-widest select-none transition-all duration-75"
            style={{
              background: 'var(--accent)',
              color: '#ffffff',
              fontSize: '13px',
              letterSpacing: '0.1em',
              boxShadow: 'inset 2px 2px 0px rgba(255,255,255,0.25), inset -2px -2px 0px rgba(0,0,0,0.2)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.15)' }}
            onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(1)' }}
          >
            知道了 · GOT IT
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
  accent,
  tbd,
  children,
}: {
  num: string
  title: string
  accent?: boolean
  tbd?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className="mb-3"
      style={{
        borderLeft: `3px solid ${tbd ? 'var(--muted-foreground)' : accent ? 'var(--success)' : 'var(--accent)'}`,
        paddingLeft: '10px',
      }}
    >
      <h3
        className="font-pixel tracking-wide mb-1.5"
        style={{
          fontSize: '13px',
          color: accent ? 'var(--success)' : 'var(--accent)',
        }}
      >
        {accent ? '' : `第${num}步 · `}
        {title}
        {tbd ? ' ⚠️待定' : ''}
      </h3>
      <div style={{ fontSize: '12px', lineHeight: '1.6', color: 'var(--foreground)' }}>
        {children}
      </div>
    </div>
  )
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ display: 'flex', gap: '6px', alignItems: 'baseline' }}>
      <span style={{ color: 'var(--accent)', flexShrink: 0 }}>▸</span>
      <span>{children}</span>
    </li>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mt-2 px-2.5 py-1.5"
      style={{
        borderLeft: '3px solid var(--accent)',
        background: 'var(--secondary)',
        fontSize: '11px',
        color: 'var(--muted-foreground)',
        lineHeight: '1.5',
      }}
    >
      ⚠️ {children}
    </div>
  )
}
