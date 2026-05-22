"use client"

import { useState, useEffect } from "react"
import { useSN } from "@/hooks/sn-context"
import { useBle } from "@/hooks/use-ble"

export function Header() {
  const { deviceSN, setDeviceSN, isConnected, isValidSN } = useSN()
  const { connect } = useBle()
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState("")
  const [bleAvailable, setBleAvailable] = useState(false)

  useEffect(() => {
    setBleAvailable(typeof navigator !== "undefined" && !!navigator.bluetooth)
  }, [])

  const handleConnect = async () => {
    setError("")
    setConnecting(true)
    try {
      await connect()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "连接失败")
    } finally {
      setConnecting(false)
    }
  }

  return (
    <header className="mb-4 sm:mb-8">
      {/* Pixel art decorative line */}
      <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-4">
        <div className="flex gap-1">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-accent" />
          ))}
        </div>
        <div className="flex-1 h-px bg-secondary" />
        <div className="flex gap-1">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-accent" />
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        {/* Title with pixel art style */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Pixel book icon */}
          <div className="w-9 h-9 sm:w-12 sm:h-12 bg-card border-2 border-primary flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-primary sm:w-6 sm:h-6">
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
            <h1 className="text-base sm:text-2xl md:text-3xl font-bold tracking-wider retro-glow text-primary leading-tight">
              电子阅读器书籍管理
            </h1>
            <p className="text-muted-foreground text-[10px] sm:text-sm tracking-widest">
              E-READER BOOK MANAGER
            </p>
          </div>
        </div>

        {/* Device Connection */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 w-full">
            <span className="text-muted-foreground text-xs sm:text-sm flex-shrink-0 hidden sm:inline">设备 SN:</span>
            <input
              type="text"
              value={deviceSN}
              onChange={(e) => setDeviceSN(e.target.value)}
              className={`bg-input border-2 px-2.5 py-2.5 sm:py-2 text-foreground
                focus:outline-none flex-1 sm:w-36 text-sm
                ${deviceSN && !isValidSN
                  ? "border-destructive focus:border-destructive"
                  : "border-secondary focus:border-accent"
                }`}
              placeholder="输入设备序列号"
            />
            {bleAvailable ? (
              <button
                onClick={handleConnect}
                disabled={connecting}
                className={`px-3 py-2.5 sm:py-2 text-sm tracking-wider pixel-button flex-shrink-0
                  ${isConnected
                    ? "bg-success text-success-foreground"
                    : "bg-accent text-accent-foreground hover:bg-accent/90"
                  }`}
              >
                {connecting ? "..." : isConnected ? "已连接" : "BLE"}
              </button>
            ) : (
              <button
                disabled
                title="当前浏览器不支持 Web Bluetooth，请使用 Chrome/Edge 或手动输入 SN"
                className="px-3 py-2.5 sm:py-2 text-sm tracking-wider pixel-button bg-muted text-muted-foreground cursor-not-allowed opacity-60 flex-shrink-0"
              >
                BLE
              </button>
            )}
          </div>
          {isConnected && (
            <div className="flex items-center gap-1.5 sm:gap-2 ml-0 sm:ml-1">
              <div className="w-2 h-2 bg-success animate-pulse flex-shrink-0" />
              <span className="text-xs sm:text-sm text-success truncate max-w-[120px] sm:max-w-none">{deviceSN}</span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-2 sm:mt-3 px-3 py-2 sm:px-4 sm:py-2 bg-destructive/20 border border-destructive text-destructive text-xs sm:text-sm whitespace-pre-line">
          {error}
        </div>
      )}

      {/* Decorative bottom line */}
      <div className="flex items-center gap-1.5 sm:gap-2 mt-2 sm:mt-4">
        <div className="flex-1 h-px bg-secondary" />
        <div className="flex gap-1">
          {[...Array(8)].map((_, i) => (
            <div key={i} className={`w-1 h-1 ${i % 2 === 0 ? 'bg-accent' : 'bg-secondary'}`} />
          ))}
        </div>
        <div className="flex-1 h-px bg-secondary" />
      </div>
    </header>
  )
}
