"use client"

import { useState, useEffect } from "react"
import { useSN } from "@/hooks/sn-context"
import { useT } from "@/lib/i18n"
import { useTheme } from "next-themes"

export function Header() {
  const { deviceSN, setDeviceSN, isValidSN, snExists, checking } = useSN()
  const t = useT()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  return (
    <header className="mb-6 sm:mb-8">
      <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-4">
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

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-4">
          {mounted && (
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center border border-border bg-card hover:bg-secondary/30 transition-colors flex-shrink-0"
              aria-label={t("switchTheme")}
            >
              {theme === 'dark' ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-amber-400 sm:w-5 sm:h-5">
                  <circle cx="8" cy="8" r="4" fill="currentColor"/>
                  <line x1="8" y1="1" x2="8" y2="3" stroke="currentColor" strokeWidth="1.5"/>
                  <line x1="8" y1="13" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5"/>
                  <line x1="1" y1="8" x2="3" y2="8" stroke="currentColor" strokeWidth="1.5"/>
                  <line x1="13" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-muted-foreground sm:w-5 sm:h-5">
                  <path d="M13.5 8.5A5.5 5.5 0 1 1 7.5 2.5a4 4 0 0 0 6 6z" fill="currentColor"/>
                </svg>
              )}
            </button>
          )}
          <div className="w-9 h-9 sm:w-11 sm:h-11 bg-card border border-border rounded flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-primary sm:w-5 sm:h-5">
              <rect x="4" y="2" width="14" height="20" fill="currentColor" opacity="0.3"/>
              <rect x="4" y="2" width="2" height="20" fill="currentColor"/>
              <rect x="4" y="2" width="14" height="2" fill="currentColor"/>
              <rect x="4" y="20" width="14" height="2" fill="currentColor"/>
              <rect x="16" y="2" width="2" height="20" fill="currentColor"/>
              <rect x="8" y="6" width="6" height="2" fill="currentColor"/>
              <rect x="8" y="10" width="4" height="2" fill="currentColor"/>
            </svg>
          </div>
          <div>
            <h1 className="text-base sm:text-xl md:text-2xl font-semibold text-primary leading-tight tracking-tight">
              {t("appTitle")}
            </h1>
            <p className="text-muted-foreground text-[10px] sm:text-xs tracking-wide font-pixel">
              {t("appSubtitle")}
            </p>
          </div>
        </div>

        <div className="flex items-stretch gap-0 w-full sm:w-auto">
          <div className="flex items-center gap-2 bg-card border border-border rounded-l-lg px-2 sm:px-3 py-2 whitespace-nowrap">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              !isValidSN ? 'bg-muted-foreground'
              : checking ? 'bg-accent animate-pulse'
              : snExists ? 'bg-success'
              : 'bg-muted-foreground'
            }`} />
            <span className="text-xs sm:text-sm text-muted-foreground">
              {!isValidSN ? t("notConnected")
                : checking ? t("checking")
                : snExists ? t("connected")
                : t("noData")}
            </span>
          </div>
          <input
            type="text"
            value={deviceSN}
            onChange={(e) => setDeviceSN(e.target.value)}
            className={`bg-card border border-border border-l-0 px-3 py-2 text-foreground text-sm
              focus:outline-none focus:border-accent/50 w-28 sm:w-36 rounded-r-lg
              ${deviceSN && !isValidSN ? "border-destructive text-destructive" : ""}`}
            placeholder={t("snPlaceholder")}
          />
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 mt-3 sm:mt-4">
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
