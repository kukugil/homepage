"use client"

import { useState, useEffect } from "react"
import { useSN } from "@/hooks/sn-context"
import { useBle } from "@/hooks/use-ble"

export function Header() {
  const { deviceSN, setDeviceSN, isConnected } = useSN()
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
    <header className="mb-8">
      {/* Pixel art decorative line */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex gap-1">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="w-2 h-2 bg-accent" />
          ))}
        </div>
        <div className="flex-1 h-px bg-secondary" />
        <div className="flex gap-1">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="w-2 h-2 bg-accent" />
          ))}
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Title with pixel art style */}
        <div className="flex items-center gap-4">
          <div className="relative">
            {/* Pixel book icon */}
            <div className="w-12 h-12 bg-card border-2 border-primary flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-primary">
                <rect x="4" y="2" width="14" height="20" fill="currentColor" opacity="0.3"/>
                <rect x="4" y="2" width="2" height="20" fill="currentColor"/>
                <rect x="4" y="2" width="14" height="2" fill="currentColor"/>
                <rect x="4" y="20" width="14" height="2" fill="currentColor"/>
                <rect x="16" y="2" width="2" height="20" fill="currentColor"/>
                <rect x="8" y="6" width="6" height="2" fill="currentColor"/>
                <rect x="8" y="10" width="4" height="2" fill="currentColor"/>
              </svg>
            </div>
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-wider retro-glow text-primary">
              电子阅读器书籍管理
            </h1>
            <p className="text-muted-foreground text-sm tracking-widest">
              E-READER BOOK MANAGER
            </p>
          </div>
        </div>

        {/* Device Connection */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <span className="text-muted-foreground text-sm">设备 SN:</span>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={deviceSN}
              onChange={(e) => setDeviceSN(e.target.value)}
              className="bg-input border-2 border-secondary px-3 py-2 text-foreground
                focus:border-accent focus:outline-none w-36 text-sm"
              placeholder="输入设备序列号"
            />
            {bleAvailable && (
              <button
                onClick={handleConnect}
                disabled={connecting}
                className={`px-4 py-2 text-sm tracking-wider pixel-button
                  ${isConnected
                    ? "bg-success text-success-foreground"
                    : "bg-accent text-accent-foreground hover:bg-accent/90"
                  }`}
              >
                {connecting ? "连接中..." : isConnected ? "已连接" : "BLE连接"}
              </button>
            )}
          </div>
          {isConnected && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-success animate-pulse" />
              <span className="text-sm text-success">{deviceSN}</span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3 px-4 py-2 bg-destructive/20 border border-destructive text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Decorative bottom line */}
      <div className="flex items-center gap-2 mt-4">
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
