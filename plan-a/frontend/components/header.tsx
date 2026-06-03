"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { ComponentType } from "react"
import { useSN } from "@/hooks/sn-context"
import { useTheme } from "next-themes"

interface QrScannerProps {
  onScan: (sn: string) => void
  onClose: () => void
}

export function Header() {
  const { deviceSN, setDeviceSN, isValidSN, snExists, checking } = useSN()
  const { theme, setTheme } = useTheme()
  const [error, setError] = useState("")
  const [camAvailable, setCamAvailable] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [mounted, setMounted] = useState(false)
  const QrScannerRef = useRef<ComponentType<QrScannerProps> | null>(null)
  const [qrLoading, setQrLoading] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // 异步检测摄像头硬件是否真正可用
  useEffect(() => {
    let cancelled = false
    async function detect() {
      if (typeof navigator !== "undefined" && navigator.mediaDevices?.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices()
          if (!cancelled) setCamAvailable(devices.some(d => d.kind === 'videoinput'))
        } catch {
          if (!cancelled) setCamAvailable(false)
        }
      }
    }
    detect()
    return () => { cancelled = true }
  }, [])

  const handleScan = useCallback((sn: string) => {
    setDeviceSN(sn)
    setShowScanner(false)
  }, [setDeviceSN])

  // 手动懒加载 QR 扫描器，import 失败不崩页面
  const handleOpenScanner = useCallback(async () => {
    setError("")
    setQrLoading(true)
    try {
      if (!QrScannerRef.current) {
        const mod = await import("./qr-scanner")
        QrScannerRef.current = mod.QrScanner
      }
      setShowScanner(true)
    } catch {
      setError("此设备不支持摄像头扫描。请手动输入 SN。")
    } finally {
      setQrLoading(false)
    }
  }, [])

  return (
    <header className="mb-6 sm:mb-8">
      {/* Pixel art decorative line */}
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
        {/* Title + Theme */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Theme Toggle */}
          {mounted && (
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center border border-border bg-card hover:bg-secondary/30 transition-colors flex-shrink-0"
              aria-label="切换主题"
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
              电子阅读器书籍管理
            </h1>
            <p className="text-muted-foreground text-[10px] sm:text-xs tracking-wide font-pixel">
              E-READER BOOK MANAGER
            </p>
          </div>
        </div>

        {/* Right side: Device Connection */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full md:w-auto">
          {/* SN Input with scan button */}
          <div className="flex items-stretch gap-0 w-full sm:w-auto">
            <div className="flex items-center gap-2 bg-card border border-border rounded-l-lg px-2 sm:px-3 py-2 whitespace-nowrap">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                !isValidSN ? 'bg-muted-foreground'
                : checking ? 'bg-accent animate-pulse'
                : snExists ? 'bg-success'
                : 'bg-muted-foreground'
              }`} />
              <span className="text-xs sm:text-sm text-muted-foreground">
                {!isValidSN ? '未连接'
                  : checking ? '查询中'
                  : snExists ? '已连接'
                  : '无数据'}
              </span>
            </div>
            <input
              type="text"
              value={deviceSN}
              onChange={(e) => setDeviceSN(e.target.value)}
              className={`bg-card border border-border border-l-0 px-3 py-2 text-foreground text-sm
                focus:outline-none focus:border-accent/50 w-28 sm:w-36
                ${deviceSN && !isValidSN ? "border-destructive text-destructive" : ""}
                ${!camAvailable ? "rounded-r-lg" : ""}`}
              placeholder="输入设备SN"
            />
            {/* QR 扫描按钮 — 仅摄像头可用时显示 */}
            {camAvailable && (
            <button
              onClick={handleOpenScanner}
              disabled={qrLoading}
              title="扫描 SN 二维码"
              className="bg-card border border-border border-l-0 px-2 py-2 hover:bg-secondary/30 transition-colors flex-shrink-0 disabled:opacity-50 rounded-r-lg"
              aria-label="扫描二维码"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-foreground">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <line x1="14" y1="14" x2="21" y2="21" />
                <line x1="21" y1="17" x2="17" y2="21" />
              </svg>
            </button>
            )}
          </div>

        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mt-2 px-3 py-2 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-xs sm:text-sm whitespace-pre-line">
          {error}
        </div>
      )}

      {/* Decorative bottom line */}
      <div className="flex items-center gap-1.5 sm:gap-2 mt-3 sm:mt-4">
        <div className="flex-1 h-px bg-border" />
        <div className="flex gap-1">
          {[...Array(8)].map((_, i) => (
            <div key={i} className={`w-1 h-1 ${i % 2 === 0 ? 'bg-accent' : 'bg-border'}`} />
          ))}
        </div>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* QR 扫描器弹窗 — 仅模块加载成功后渲染 */}
      {showScanner && QrScannerRef.current && (
        <QrScannerRef.current
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </header>
  )
}
