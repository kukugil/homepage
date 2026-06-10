"use client"

import { useState } from "react"

function detectPlatform(): "android" | "ios" {
  if (typeof navigator === "undefined") return "android"
  const ua = navigator.userAgent || ""
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios"
  return "android"
}

function Thumbnail({ src, alt, onClick }: { src: string; alt: string; onClick: () => void }) {
  const [error, setError] = useState(false)
  if (error) return null
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setError(true)}
      onClick={onClick}
      style={{
        height: 100, maxWidth: "48%", objectFit: "cover", cursor: "pointer",
        border: "1px solid var(--border)", display: "block",
      }}
    />
  )
}

function FullImageView({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [error, setError] = useState(false)
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 99999,
        background: "rgba(0,0,0,0.85)", display: "flex",
        alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      {error ? (
        <div style={{ color: "#fff", fontSize: 14, textAlign: "center" }}>
          截图暂未添加，请按照文字步骤操作。
        </div>
      ) : (
        <img
          src={src} alt={alt}
          onError={() => setError(true)}
          style={{ maxHeight: "80vh", maxWidth: "92vw", objectFit: "contain" }}
        />
      )}
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: 16, right: 16, width: 32, height: 32,
          background: "rgba(255,255,255,0.2)", border: "none", color: "#fff",
          fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "center",
        }}
      >
        ✕
      </button>
    </div>
  )
}

export function BluetoothScreenshotHint({ compact = true, defaultExpanded = false }: { compact?: boolean; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [platform, setPlatform] = useState<"android" | "ios">(detectPlatform())
  const [fullView, setFullView] = useState<string | null>(null)
  const [allError, setAllError] = useState(false)

  if (!expanded) {
    return (
      <div style={{ marginTop: 6 }}>
        <button
          onClick={() => setExpanded(true)}
          style={{
            background: "none", border: "1px solid var(--border)", padding: "3px 12px",
            fontSize: 11, cursor: "pointer", color: "var(--muted-foreground)",
            fontFamily: "inherit",
          }}
        >
          + 查看蓝牙设置示例
        </button>
      </div>
    )
  }

  const isAndroid = platform === "android"
  const androidImages = [
    { src: "/guide/android-bluetooth-list.jpg", alt: "蓝牙设备列表" },
    { src: "/guide/android-bluetooth-network.jpg", alt: "蓝牙网络共享设置" },
  ]
  const iosImages = [
    { src: "/guide/ios-bluetooth.jpg", alt: "iPhone 蓝牙设置" },
  ]
  const images = isAndroid ? androidImages : iosImages

  return (
    <div style={{
      border: "1px solid var(--border)", background: "var(--secondary)",
      padding: compact ? "6px 10px" : "10px 14px", marginTop: 6,
    }}>
      {/* Platform toggle — small segmented */}
      <div style={{ display: "flex", gap: 0, marginBottom: 6 }}>
        {(["android", "ios"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            style={{
              padding: "2px 10px", fontSize: 10, cursor: "pointer",
              border: "1px solid var(--border)", fontFamily: "inherit",
              background: platform === p ? "var(--card)" : "var(--secondary)",
              color: platform === p ? "var(--foreground)" : "var(--muted-foreground)",
              fontWeight: platform === p ? 600 : 400,
            }}
          >
            {p === "android" ? "Android" : "iPhone"}
          </button>
        ))}
      </div>

      {/* Thumbnails or error */}
      {allError ? (
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
          截图暂未添加，请按照文字步骤操作。
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {images.map((img) => (
            <Thumbnail key={img.src} {...img} onClick={() => setFullView(img.src)} />
          ))}
          {/* Hidden checker: if all images error out, show text */}
          <CheckAllError
            images={images}
            onAllError={() => setAllError(true)}
          />
        </div>
      )}

      {/* Text hint */}
      <p style={{ fontSize: 10, color: "var(--muted-foreground)", margin: "6px 0 0 0", lineHeight: 1.5 }}>
        {isAndroid
          ? "设置 → 蓝牙 → 选择 MCU 设备 → 开启「互联网访问」或「蓝牙网络共享」。"
          : "设置 → 蓝牙 → 选择 MCU 设备并保持连接。"}
        {compact ? "" : " 不同手机系统名称可能略有不同，请以实际界面为准。"}
      </p>

      <button
        onClick={() => setExpanded(false)}
        style={{
          background: "none", border: "none", padding: "2px 0", fontSize: 10,
          cursor: "pointer", color: "var(--muted-foreground)", fontFamily: "inherit",
          display: "block", marginTop: 4,
        }}
      >
        − 收起
      </button>

      {/* Full image overlay */}
      {fullView && (
        <FullImageView
          src={fullView}
          alt="蓝牙设置截图"
          onClose={() => setFullView(null)}
        />
      )}
    </div>
  )
}

// Helper: check if all images fail to load
function CheckAllError({ images, onAllError }: { images: { src: string }[]; onAllError: () => void }) {
  const [count, setCount] = useState(0)
  if (count >= images.length) {
    // defer to avoid setState during render
    setTimeout(onAllError, 0)
    return null
  }
  // Render invisible images to count errors
  return (
    <span style={{ display: "none" }}>
      {images.map((img) => (
        <img key={img.src} src={img.src} alt="" onError={() => setCount((c) => c + 1)} />
      ))}
    </span>
  )
}
