"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { useSN } from "@/hooks/sn-context"
import { uploadBook, uploadBooks, formatSize } from "@/lib/api"

interface UploadedFile {
  name: string
  id: string
  status: "uploading" | "success" | "error"
  error?: string
  bookId?: string
  progress?: number
}

interface UploadTabProps {
  onUploadComplete?: () => void
}

export function UploadTab({ onUploadComplete }: UploadTabProps) {
  const { deviceSN } = useSN()
  const [useAccessToken, setUseAccessToken] = useState(false)
  const [accessToken, setAccessToken] = useState("")
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [totalProgress, setTotalProgress] = useState(0)
  const [totalSize, setTotalSize] = useState(0)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: UploadedFile[] = acceptedFiles.map((file) => ({
      name: file.name,
      id: `b_${Math.random().toString(36).substr(2, 12)}`,
      status: "uploading" as const,
      progress: 0,
    }))

    setUploadedFiles((prev) => [...prev, ...newFiles])
    setTotalProgress(0)
    setTotalSize(acceptedFiles.reduce((sum, f) => sum + f.size, 0))

    const token = useAccessToken ? accessToken || undefined : undefined

    if (acceptedFiles.length === 1) {
      const file = acceptedFiles[0]
      const fileEntry = newFiles[0]
      uploadBook(deviceSN || "default", file, token, (loaded, total) => {
        setTotalProgress(Math.round((loaded / total) * 100))
      })
        .then((result) => {
          setUploadedFiles((prev) =>
            prev.map((f) =>
              f.id === fileEntry.id
                ? { ...f, status: "success" as const, bookId: result.book_id, progress: 100 }
                : f
            )
          )
          onUploadComplete?.()
        })
        .catch((err) => {
          setUploadedFiles((prev) =>
            prev.map((f) =>
              f.id === fileEntry.id
                ? { ...f, status: "error" as const, error: err.message }
                : f
            )
          )
        })
    } else if (acceptedFiles.length > 1) {
      uploadBooks(deviceSN || "default", acceptedFiles, token, (loaded, total) => {
        setTotalProgress(Math.round((loaded / total) * 100))
      })
        .then((result) => {
          setUploadedFiles((prev) =>
            prev.map((f) => {
              const match = result.results.find((r) => r.filename === f.name)
              if (match) {
                return {
                  ...f,
                  status: match.status === "ok" ? ("success" as const) : ("error" as const),
                  bookId: match.book_id,
                  error: match.reason,
                  progress: 100,
                }
              }
              return f
            })
          )
          onUploadComplete?.()
        })
        .catch((err) => {
          setUploadedFiles((prev) =>
            prev.map((f) =>
              f.status === "uploading"
                ? { ...f, status: "error" as const, error: err.message }
                : f
            )
          )
        })
    }
  }, [deviceSN, useAccessToken, accessToken, onUploadComplete])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt'],
      'application/epub+zip': ['.epub'],
      'application/pdf': ['.pdf']
    },
    maxSize: 500 * 1024 * 1024, // 500MB
    disabled: !deviceSN,
  })

  return (
    <div className="space-y-6">
      {!deviceSN && (
        <div className="px-4 py-3 bg-secondary/30 border border-secondary text-muted-foreground text-sm">
          请先在顶部输入设备 SN 或通过 BLE 连接设备
        </div>
      )}

      {/* Upload Zone */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed p-12 text-center cursor-pointer
          transition-all duration-200 relative
          ${!deviceSN ? "opacity-50 cursor-not-allowed" : ""}
          ${isDragActive
            ? "border-accent bg-accent/10"
            : "border-secondary hover:border-accent/50 bg-card/50"
          }
        `}
      >
        <input {...getInputProps()} />

        {/* Pixel Upload Icon */}
        <div className="mb-6 flex justify-center">
          <div className="relative">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="text-primary">
              {/* Arrow body */}
              <rect x="28" y="24" width="8" height="24" fill="currentColor"/>
              {/* Arrow head */}
              <rect x="20" y="24" width="8" height="4" fill="currentColor"/>
              <rect x="36" y="24" width="8" height="4" fill="currentColor"/>
              <rect x="24" y="20" width="8" height="4" fill="currentColor"/>
              <rect x="32" y="20" width="8" height="4" fill="currentColor"/>
              <rect x="28" y="16" width="8" height="4" fill="currentColor"/>
              {/* Base line */}
              <rect x="16" y="52" width="32" height="4" fill="currentColor"/>
            </svg>
            {isDragActive && (
              <div className="absolute inset-0 animate-pulse bg-accent/20" />
            )}
          </div>
        </div>

        <p className="text-xl text-primary mb-2 tracking-wide">
          {isDragActive ? "松开以上传文件" : "拖拽文件到此处，或点击选择"}
        </p>
        <p className="text-muted-foreground text-sm tracking-wider">
          支持 EPUB / PDF / TXT，单文件最大 500MB
        </p>

        {/* Decorative corners */}
        <div className="absolute top-0 left-0 w-4 h-4 border-l-2 border-t-2 border-accent" />
        <div className="absolute top-0 right-0 w-4 h-4 border-r-2 border-t-2 border-accent" />
        <div className="absolute bottom-0 left-0 w-4 h-4 border-l-2 border-b-2 border-accent" />
        <div className="absolute bottom-0 right-0 w-4 h-4 border-r-2 border-b-2 border-accent" />
      </div>

      {/* Global progress bar */}
      {uploadedFiles.some(f => f.status === "uploading") && totalSize > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>上传进度</span>
            <span>{totalProgress}% ({formatSize(totalSize)})</span>
          </div>
          <div className="w-full h-2 bg-secondary">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${totalProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Access Token Option */}
      <label className="flex items-center gap-3 cursor-pointer group">
        <div
          className={`
            w-5 h-5 border-2 flex items-center justify-center transition-colors
            ${useAccessToken
              ? "bg-primary border-primary"
              : "bg-input border-secondary group-hover:border-accent"
            }
          `}
          onClick={() => setUseAccessToken(!useAccessToken)}
        >
          {useAccessToken && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="2" y="6" width="2" height="2" fill="currentColor" className="text-primary-foreground"/>
              <rect x="4" y="8" width="2" height="2" fill="currentColor" className="text-primary-foreground"/>
              <rect x="6" y="6" width="2" height="2" fill="currentColor" className="text-primary-foreground"/>
              <rect x="8" y="4" width="2" height="2" fill="currentColor" className="text-primary-foreground"/>
              <rect x="10" y="2" width="2" height="2" fill="currentColor" className="text-primary-foreground"/>
            </svg>
          )}
        </div>
        <span className="text-foreground">使用访问令牌</span>
      </label>

      {useAccessToken && (
        <input
          type="text"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          className="bg-input border-2 border-secondary px-3 py-2 text-foreground
            focus:border-accent focus:outline-none w-full max-w-xs text-sm"
          placeholder="输入访问令牌"
        />
      )}

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          {uploadedFiles.map((file) => (
            <div
              key={file.id}
              className={`
                border-l-4 px-4 py-3 bg-card flex items-center justify-between
                ${file.status === "success"
                  ? "border-[#5a7a4a]"
                  : file.status === "error"
                    ? "border-destructive"
                    : "border-accent"
                }
              `}
            >
              <div className="flex items-center gap-3">
                {file.status === "uploading" && (
                  <div className="flex gap-1">
                    {[...Array(3)].map((_, i) => (
                      <div
                        key={i}
                        className="w-2 h-2 bg-accent animate-pulse"
                        style={{ animationDelay: `${i * 0.2}s` }}
                      />
                    ))}
                  </div>
                )}
                {file.status === "success" && (
                  <svg width="16" height="16" viewBox="0 0 16 16" className="text-[#5a7a4a]">
                    <rect x="2" y="8" width="2" height="2" fill="currentColor"/>
                    <rect x="4" y="10" width="2" height="2" fill="currentColor"/>
                    <rect x="6" y="8" width="2" height="2" fill="currentColor"/>
                    <rect x="8" y="6" width="2" height="2" fill="currentColor"/>
                    <rect x="10" y="4" width="2" height="2" fill="currentColor"/>
                    <rect x="12" y="2" width="2" height="2" fill="currentColor"/>
                  </svg>
                )}
                <span className="text-foreground">
                  {file.name} — {file.status === "success" ? "上传成功" : file.status === "error" ? `上传失败: ${file.error}` : "上传中..."}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
