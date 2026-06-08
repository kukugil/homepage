"use client"

import { useState, useEffect } from "react"
import { useSN } from "@/hooks/sn-context"
import { useT } from "@/lib/i18n"
import { useTheme } from "next-themes"

interface HeaderProps {
  onHelpClick?: () => void
}

export function Header({ onHelpClick }: HeaderProps) {
  const { deviceSN, setDeviceSN, isValidSN, snExists, checking } = useSN()
  const t = useT()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const statusDot = !isValidSN ? 'bg-muted-foreground'
    : checking ? 'bg-accent animate-pulse'
    : snExists ? 'bg-success'
    : 'bg-muted-foreground'

  const statusText = !isValidSN ? t("notConnected")
    : checking ? t("checking")
    : snExists ? t("connected")
    : t("noData")

  return (
    <header className="mb-4 sm:mb-8">
      {/* 顶部像素点装饰线 */}
      <div className="flex items-center gap-1.5 mb-3 sm:mb-4">
        <div className="flex gap-1">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-accent" />
          ))}
        </div>
        <div className="flex-1 h-px bg-border" />
        <div className="flex gap-1">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-accent" />
          ))}
        </div>
      </div>

      {/* 主标题行 */}
      <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* 主题切换按钮 */}
          {mounted && (
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center border border-border
                bg-card hover:bg-secondary/40 active:bg-secondary/60
                transition-colors flex-shrink-0 touch-manipulation"
              aria-label={t("switchTheme")}
            >
              {theme === 'dark' ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-amber-400">
                  <circle cx="8" cy="8" r="4" fill="currentColor"/>
                  <line x1="8" y1="1" x2="8" y2="3" stroke="currentColor" strokeWidth="1.5"/>
                  <line x1="8" y1="13" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5"/>
                  <line x1="1" y1="8" x2="3" y2="8" stroke="currentColor" strokeWidth="1.5"/>
                  <line x1="13" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-muted-foreground">
                  <path d="M13.5 8.5A5.5 5.5 0 1 1 7.5 2.5a4 4 0 0 0 6 6z" fill="currentColor"/>
                </svg>
              )}
            </button>
          )}
          {/* 帮助按钮 */}
          {onHelpClick && (
            <button
              onClick={onHelpClick}
              className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center border border-border
                bg-card hover:bg-secondary/40 active:bg-secondary/60
                transition-colors flex-shrink-0 touch-manipulation font-pixel"
              style={{ fontSize: '1.1rem' }}
              aria-label={t("help")}
              title={t("help")}
            >
              ?
            </button>
          )}
          {/* LOGO 图标 */}
          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-card border border-border flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-primary">
              <rect x="4" y="2" width="14" height="20" fill="currentColor" opacity="0.3"/>
              <rect x="4" y="2" width="2" height="20" fill="currentColor"/>
              <rect x="4" y="2" width="14" height="2" fill="currentColor"/>
              <rect x="4" y="20" width="14" height="2" fill="currentColor"/>
              <rect x="16" y="2" width="2" height="20" fill="currentColor"/>
              <rect x="8" y="6" width="6" height="2" fill="currentColor"/>
              <rect x="8" y="10" width="4" height="2" fill="currentColor"/>
            </svg>
          </div>
          {/* 标题文字 */}
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-semibold text-primary leading-tight tracking-tight truncate">
              {t("appTitle")}
            </h1>
            <p className="text-muted-foreground text-[9px] sm:text-[10px] tracking-wider font-pixel leading-tight mt-0.5">
              {t("appSubtitle")}
            </p>
          </div>
        </div>

        {/* SN 状态指示 + 输入（右侧，紧凑） */}
        <div className="flex items-center gap-0 flex-shrink-0">
          {/* 状态指示胶囊 */}
          <div className="flex items-center gap-1.5 h-9 bg-card border border-border border-r-0 px-2 sm:px-3
            rounded-l-none" style={{ borderRadius: 0 }}>
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot}`} />
            <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap hidden xs:inline sm:inline">
              {statusText}
            </span>
          </div>
          {/* SN 输入框 */}
          <input
            type="text"
            value={deviceSN}
            onChange={(e) => setDeviceSN(e.target.value)}
            className={`h-9 bg-card border border-border px-2 sm:px-3
              text-foreground text-sm focus:outline-none focus:border-accent/60
              w-24 sm:w-36 transition-colors
              ${deviceSN && !isValidSN ? "border-destructive text-destructive" : ""}`}
            style={{ borderRadius: 0 }}
            placeholder={t("snPlaceholder")}
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>
      </div>

      {/* 底部像素装饰线 */}
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-px bg-border" />
        <div className="flex gap-1">
          {[...Array(8)].map((_, i) => (
            <div key={i} className={`w-1 h-1 ${i % 2 === 0 ? 'bg-accent' : 'bg-border'}`} />
          ))}
        </div>
        <div className="flex-1 h-px bg-border" />
      </div>
    </header>
  )
}
