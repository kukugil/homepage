"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { SN_REGEX } from "@/hooks/sn-context"

interface QrScannerProps {
  onScan: (sn: string) => void
  onClose: () => void
}

// 检测浏览器是否支持原生 BarcodeDetector API (Chrome 88+, Edge 88+)
function hasBarcodeDetector(): boolean {
  try {
    return typeof BarcodeDetector !== "undefined"
  } catch {
    return false
  }
}

async function getBarcodeDetector(): Promise<BarcodeDetector | null> {
  try {
    const supported = await BarcodeDetector.getSupportedFormats()
    if (supported.includes("qr_code")) {
      return new BarcodeDetector({ formats: ["qr_code", "code_128", "code_39", "code_93", "codabar", "ean_13"] })
    }
  } catch { /* not supported */ }
  return null
}

export function QrScanner({ onScan, onClose }: QrScannerProps) {
  const [error, setError] = useState("")
  const [started, setStarted] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const stoppedRef = useRef(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // 原生 BarcodeDetector 方案 (Chrome/Edge — 稳定，不崩页面)
  const startNative = useCallback(async () => {
    const detector = await getBarcodeDetector()
    if (!detector) return false // 降级到 html5-qrcode

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("此设备不支持摄像头。请手动输入 SN。")
      return true
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          // advanced 约束：自动对焦 + 自动曝光
          advanced: [
            { focusMode: "continuous" as any },
            { exposureMode: "continuous" as any },
          ],
        },
        audio: false,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("NotAllowed") || msg.includes("Permission")) {
        setError("摄像头权限被拒绝。请在浏览器设置中允许摄像头访问。")
      } else if (msg.includes("NotFound")) {
        setError("未检测到摄像头。")
      } else {
        setError(`摄像头启动失败: ${msg}`)
      }
      return true
    }

    streamRef.current = stream

    // 需要等 video 元素挂载
    const video = videoRef.current
    if (!video) {
      stream.getTracks().forEach(t => t.stop())
      setError("扫描器初始化失败。")
      return true
    }

    video.srcObject = stream
    video.playsInline = true
    await video.play()
    setStarted(true)

    if (stoppedRef.current) return true

    // 创建离屏 canvas 用于抽帧
    const canvas = document.createElement("canvas")
    canvasRef.current = canvas
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) {
      stream.getTracks().forEach(t => t.stop())
      setError("浏览器不支持 Canvas 2D。")
      return true
    }

    let lastScan = 0
    const SCAN_INTERVAL = 100 // ms between scans

    function scan() {
      if (stoppedRef.current) return
      const now = Date.now()
      if (now - lastScan < SCAN_INTERVAL) {
        requestAnimationFrame(scan)
        return
      }
      lastScan = now

      if (!video || video.readyState < 2) {
        requestAnimationFrame(scan)
        return
      }

      const vw = video.videoWidth
      const vh = video.videoHeight
      if (vw === 0 || vh === 0) {
        requestAnimationFrame(scan)
        return
      }

      // 缩放 canvas 到合理尺寸，减少计算量
      const maxDim = 640
      const scale = Math.min(1, maxDim / Math.max(vw, vh))
      canvas.width = Math.floor(vw * scale)
      canvas.height = Math.floor(vh * scale)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      detector
        .detect(canvas)
        .then((codes) => {
          if (stoppedRef.current) return
          for (const code of codes) {
            const raw = code.rawValue.trim()
            // 从内容中提取 SN：支持纯 SN、URL 中的 SN、带前缀的 SN 等
            // 例如 "SN001"、"https://ereader.fun/SN001"、"SN:SN001" 都能识别
            const match = raw.match(/[a-zA-Z0-9][a-zA-Z0-9-]{0,63}/)
            const candidate = match ? match[0] : ""
            if (candidate && SN_REGEX.test(candidate)) {
              stoppedRef.current = true
              stream.getTracks().forEach(t => t.stop())
              onScan(candidate)
              return
            }
          }
          requestAnimationFrame(scan)
        })
        .catch(() => {
          if (!stoppedRef.current) requestAnimationFrame(scan)
        })
    }

    requestAnimationFrame(scan)
    return true
  }, [onScan])

  // 降级方案: html5-qrcode (Firefox/Safari 等不支持 BarcodeDetector 的浏览器)
  const startFallback = useCallback(async () => {
    // 动态导入，避免在不需要时加载
    let Html5QrcodeModule: any
    try {
      Html5QrcodeModule = await import("html5-qrcode")
    } catch {
      setError("此浏览器不支持摄像头扫描。请手动输入 SN 或使用 BLE 连接。")
      return
    }

    const Html5Qrcode = Html5QrcodeModule.Html5Qrcode

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("此设备不支持摄像头。请手动输入 SN。")
      return
    }

    let scanner: any
    try {
      scanner = new Html5Qrcode("qr-reader", { verbose: false })
    } catch {
      setError("无法初始化扫描器。此设备可能不支持摄像头访问。")
      return
    }

    const config = {
      fps: 10,
      qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
        const size = Math.min(viewfinderWidth, viewfinderHeight) * 0.7
        return { width: size, height: size }
      },
      aspectRatio: 1,
    }

    try {
      await scanner.start(
        { facingMode: "environment" },
        config,
        (decodedText: string) => {
          if (stoppedRef.current) return
          const raw = decodedText.trim()
          const match = raw.match(/[a-zA-Z0-9][a-zA-Z0-9-]{0,63}/)
          const candidate = match ? match[0] : ""
          if (candidate && SN_REGEX.test(candidate)) {
            stoppedRef.current = true
            try { scanner.stop().catch(() => {}) } catch {}
            onScan(candidate)
          }
        },
        () => {} // 扫描错误静默忽略
      )
      if (!stoppedRef.current) setStarted(true)
    } catch (err: unknown) {
      if (stoppedRef.current) return
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("NotAllowed") || msg.includes("Permission")) {
        setError("摄像头权限被拒绝。请在浏览器设置中允许摄像头访问。")
      } else if (msg.includes("NotFound") || msg.includes("no camera")) {
        setError("未检测到摄像头。桌面端请手动输入 SN。")
      } else {
        setError(`摄像头启动失败: ${msg}`)
      }
    }
  }, [onScan])

  useEffect(() => {
    stoppedRef.current = false

    async function init() {
      // 优先使用原生 BarcodeDetector
      if (hasBarcodeDetector()) {
        const used = await startNative()
        if (used) return
      }
      // 降级到 html5-qrcode
      await startFallback()
    }

    init()

    return () => {
      stoppedRef.current = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
    }
  }, [startNative, startFallback])

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
            <div className="relative w-full rounded-lg overflow-hidden bg-black">
              {/* 原生方案: 用自己的 video 元素 */}
              {hasBarcodeDetector() ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-auto"
                />
              ) : (
                /* 降级方案: html5-qrcode 自行管理 DOM */
                <div
                  id="qr-reader"
                  className="w-full [&_video]:w-full"
                />
              )}
            </div>
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
