"use client"

import { useEffect, useRef, useState } from "react"
import { Html5Qrcode } from "html5-qrcode"
import { SN_REGEX } from "@/hooks/sn-context"

interface QrScannerProps {
  onScan: (sn: string) => void
  onClose: () => void
}

export function QrScanner({ onScan, onClose }: QrScannerProps) {
  const [error, setError] = useState("")
  const [started, setStarted] = useState(false)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const stoppedRef = useRef(false)

  useEffect(() => {
    const scanner = new Html5Qrcode("qr-reader", { verbose: false })
    scannerRef.current = scanner

    const config = {
      fps: 10,
      qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
        const size = Math.min(viewfinderWidth, viewfinderHeight) * 0.7
        return { width: size, height: size }
      },
      aspectRatio: 1,
    }

    scanner
      .start(
        { facingMode: "environment" },
        config,
        (decodedText: string) => {
          if (stoppedRef.current) return
          const sn = decodedText.trim()
          if (SN_REGEX.test(sn)) {
            stoppedRef.current = true
            scanner.stop().catch(() => {})
            onScan(sn)
          }
        },
        () => {}
      )
      .then(() => setStarted(true))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes("NotAllowed") || msg.includes("Permission")) {
          setError("摄像头权限被拒绝。请在浏览器设置中允许摄像头访问后刷新重试。")
        } else if (msg.includes("NotFound") || msg.includes("no camera")) {
          setError("未检测到摄像头。桌面端请手动输入 SN，移动端请使用有摄像头的设备。")
        } else {
          setError(`摄像头启动失败: ${msg}`)
        }
      })

    return () => {
      stoppedRef.current = true
      scanner.stop().catch(() => {})
    }
  }, [onScan])

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-sm shadow-lg overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">
            扫描 SN 二维码
          </h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-border hover:bg-secondary/30 transition-colors text-muted-foreground"
            aria-label="关闭"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scanner viewport */}
        <div className="p-4">
          {error ? (
            <div className="px-3 py-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-xs text-center whitespace-pre-line">
              {error}
            </div>
          ) : (
            <div
              id="qr-reader"
              className="w-full rounded-lg overflow-hidden [&_video]:w-full"
            />
          )}
          {!error && !started && (
            <p className="text-xs text-muted-foreground text-center mt-3">
              正在启动摄像头...
            </p>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-border bg-secondary/10">
          <p className="text-[10px] text-muted-foreground text-center">
            将 SN 二维码对准取景框 · 支持 QR Code 和条形码
          </p>
        </div>
      </div>
    </div>
  )
}
