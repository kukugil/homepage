"use client"

import { useState } from "react"

function detectPlatform(): "android" | "ios" {
  if (typeof navigator === "undefined") return "android"
  const ua = navigator.userAgent || ""
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios"
  return "android"
}

function HintImage({ src, alt }: { src: string; alt: string }) {
  const [error, setError] = useState(false)
  if (error) {
    return (
      <div style={{
        background: "var(--secondary)", border: "1px dashed var(--border)",
        padding: "14px 12px", fontSize: 12, color: "var(--muted-foreground)",
        textAlign: "center", lineHeight: 1.6,
      }}>
        {alt || "截图暂未添加，请按照文字步骤操作。"}
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setError(true)}
      style={{
        maxWidth: "100%", maxHeight: 360, objectFit: "contain",
        display: "block", margin: "4px auto",
      }}
    />
  )
}

export function BluetoothScreenshotHint({ defaultExpanded = false }: { defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [platform, setPlatform] = useState<"android" | "ios">(detectPlatform())

  const isAndroid = platform === "android"

  return (
    <div style={{ marginTop: 8 }}>
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          style={{
            background: "none", border: "1px solid var(--border)",
            padding: "6px 14px", fontSize: 12, cursor: "pointer",
            color: "var(--muted-foreground)", fontFamily: "inherit",
          }}
        >
          + 查看蓝牙设置示例
        </button>
      )}

      {expanded && (
        <div style={{
          border: "1px solid var(--border)", background: "var(--secondary)",
          padding: "10px 14px", marginTop: 4,
        }}>
          {/* Platform toggle */}
          <div style={{ display: "flex", gap: 0, marginBottom: 10 }}>
            {(["android", "ios"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                style={{
                  flex: 1, padding: "6px 0", fontSize: 12, cursor: "pointer",
                  border: "1px solid var(--border)",
                  background: platform === p ? "var(--card)" : "var(--secondary)",
                  color: platform === p ? "var(--foreground)" : "var(--muted-foreground)",
                  fontWeight: platform === p ? 600 : 400,
                  fontFamily: "inherit",
                }}
              >
                {p === "android" ? "Android" : "iPhone"}
              </button>
            ))}
          </div>

          {/* Screenshot area */}
          <div style={{ overflowY: "auto", maxHeight: 400 }}>
            {isAndroid && (
              <div>
                <HintImage
                  src="/guide/android-bluetooth-list.jpg"
                  alt="Android 蓝牙设备列表示例"
                />
                <HintImage
                  src="/guide/android-bluetooth-network.jpg"
                  alt="Android 蓝牙网络共享/互联网访问设置"
                />
                <p style={{ fontSize: 11, color: "var(--muted-foreground)", margin: "6px 0 0 0", lineHeight: 1.6 }}>
                  设置 → 蓝牙 → 选择 MCU 设备 → 开启「互联网访问」或「蓝牙网络共享」。
                </p>
              </div>
            )}
            {!isAndroid && (
              <div>
                <HintImage
                  src="/guide/ios-bluetooth.jpg"
                  alt="iPhone 蓝牙设置示例"
                />
                <p style={{ fontSize: 11, color: "var(--muted-foreground)", margin: "6px 0 0 0", lineHeight: 1.6 }}>
                  设置 → 蓝牙 → 选择 MCU 设备并保持连接。
                </p>
              </div>
            )}
          </div>

          <p style={{ fontSize: 10, color: "var(--muted-foreground)", margin: "8px 0 0 0", textAlign: "center" }}>
            不同手机系统名称可能略有不同，请以实际界面为准。
          </p>

          <button
            onClick={() => setExpanded(false)}
            style={{
              background: "none", border: "none", padding: "4px 0",
              fontSize: 11, cursor: "pointer",
              color: "var(--muted-foreground)", fontFamily: "inherit",
              display: "block", margin: "6px auto 0",
            }}
          >
            − 收起
          </button>
        </div>
      )}
    </div>
  )
}
