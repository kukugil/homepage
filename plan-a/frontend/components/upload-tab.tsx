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
  const { deviceSN, isValidSN } = useSN()
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

    if (acceptedFiles.length === 1) {
      const file = acceptedFiles[0]
      const fileEntry = newFiles[0]
      uploadBook(deviceSN, file, (loaded, total) => {
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
      uploadBooks(deviceSN, acceptedFiles, (loaded, total) => {
        setTotalProgress(Math.round((loaded / total) * 100))
      })
        .then((result) => {
          setUploadedFiles((prev) =>
            prev.map((f, i) => {
              // 按顺序匹配，不用文件名 — 服务器 fixFilenameEncoding 会改变中文名
              const match = result.results[i]
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
  }, [deviceSN, onUploadComplete])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt'],
      'application/epub+zip': ['.epub'],
      'application/pdf': ['.pdf']
    },
    maxSize: 500 * 1024 * 1024,
    disabled: !isValidSN,
  })

  return (
    <div className="space-y-4 sm:space-y-6">
      {!isValidSN && (
        <div className={`px-3 py-2.5 sm:px-4 sm:py-3 border text-xs sm:text-sm
          ${deviceSN && !isValidSN
            ? "bg-destructive/10 border-destructive text-destructive"
            : "bg-secondary/30 border-secondary text-muted-foreground"
          }`}>
          {deviceSN && !isValidSN
            ? "SN 格式无效。序列号须以字母或数字开头，仅包含字母、数字和连字符(-)，长度 1-64 位"
            : "请先在顶部输入设备 SN 或通过 BLE 连接设备"
          }
        </div>
      )}

      {/* Upload Zone */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed p-4 sm:p-12 text-center cursor-pointer
          transition-all duration-200 relative
          ${!isValidSN ? "opacity-50 cursor-not-allowed" : ""}
          ${isDragActive
            ? "border-accent bg-accent/10"
            : "border-secondary hover:border-accent/50 bg-card/50"
          }
        `}
      >
        <input {...getInputProps()} />

        {/* Pixel Upload Icon */}
        <div className="mb-3 sm:mb-6 flex justify-center">
          <div className="relative">
            <svg width="40" height="40" viewBox="0 0 64 64" fill="none" className="text-primary sm:w-16 sm:h-16">
              <rect x="28" y="24" width="8" height="24" fill="currentColor"/>
              <rect x="20" y="24" width="8" height="4" fill="currentColor"/>
              <rect x="36" y="24" width="8" height="4" fill="currentColor"/>
              <rect x="24" y="20" width="8" height="4" fill="currentColor"/>
              <rect x="32" y="20" width="8" height="4" fill="currentColor"/>
              <rect x="28" y="16" width="8" height="4" fill="currentColor"/>
              <rect x="16" y="52" width="32" height="4" fill="currentColor"/>
            </svg>
            {isDragActive && (
              <div className="absolute inset-0 animate-pulse bg-accent/20" />
            )}
          </div>
        </div>

        <p className="text-sm sm:text-xl text-primary mb-1 sm:mb-2 tracking-wide">
          {isDragActive ? "松开以上传文件" : "拖拽文件到此处，或点击选择"}
        </p>
        <p className="text-muted-foreground text-xs sm:text-sm tracking-wider">
          支持 EPUB / PDF / TXT，单文件最大 500MB
        </p>

        {/* Decorative corners */}
        <div className="absolute top-0 left-0 w-3 h-3 sm:w-4 sm:h-4 border-l-2 border-t-2 border-accent" />
        <div className="absolute top-0 right-0 w-3 h-3 sm:w-4 sm:h-4 border-r-2 border-t-2 border-accent" />
        <div className="absolute bottom-0 left-0 w-3 h-3 sm:w-4 sm:h-4 border-l-2 border-b-2 border-accent" />
        <div className="absolute bottom-0 right-0 w-3 h-3 sm:w-4 sm:h-4 border-r-2 border-b-2 border-accent" />
      </div>

      {/* Global progress bar */}
      {uploadedFiles.some(f => f.status === "uploading") && totalSize > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs sm:text-sm text-muted-foreground">
            <span>上传进度</span>
            <span>{totalProgress}% ({formatSize(totalSize)})</span>
          </div>
          <div className="w-full h-2.5 bg-secondary rounded overflow-hidden">
            <div
              className="h-full rounded transition-all duration-300"
              style={{
                width: `${totalProgress}%`,
                background: `repeating-linear-gradient(-45deg, var(--color-accent) 0px, var(--color-accent) 6px, rgba(196,106,62,0.3) 6px, rgba(196,106,62,0.3) 12px)`,
                animation: totalProgress < 100 ? 'progress-stripes 1s linear infinite' : 'none',
                backgroundSize: '12px 12px',
              }}
            />
          </div>
        </div>
      )}

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-1.5 sm:space-y-2">
          {uploadedFiles.map((file) => (
            <div
              key={file.id}
              className={`
                border-l-4 px-3 sm:px-4 py-2 sm:py-3 flex items-center gap-2 rounded-r
                ${file.status === "success"
                  ? "border-success bg-success/5"
                  : file.status === "error"
                    ? "border-destructive bg-destructive/5"
                    : "border-accent bg-accent/5"
                }
              `}
            >
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                {file.status === "uploading" && (
                  <div className="flex gap-1 flex-shrink-0">
                    {[...Array(3)].map((_, i) => (
                      <div
                        key={i}
                        className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-accent animate-pulse"
                        style={{ animationDelay: `${i * 0.2}s` }}
                      />
                    ))}
                  </div>
                )}
                {file.status === "success" && (
                  <svg width="14" height="14" viewBox="0 0 16 16" className="text-success flex-shrink-0">
                    <rect x="2" y="8" width="2" height="2" fill="currentColor"/>
                    <rect x="4" y="10" width="2" height="2" fill="currentColor"/>
                    <rect x="6" y="8" width="2" height="2" fill="currentColor"/>
                    <rect x="8" y="6" width="2" height="2" fill="currentColor"/>
                    <rect x="10" y="4" width="2" height="2" fill="currentColor"/>
                    <rect x="12" y="2" width="2" height="2" fill="currentColor"/>
                  </svg>
                )}
                {file.status === "error" && (
                  <svg width="14" height="14" viewBox="0 0 16 16" className="text-destructive flex-shrink-0">
                    <rect x="2" y="2" width="12" height="12" fill="currentColor"/>
                  </svg>
                )}
                <span className="text-foreground text-xs sm:text-sm truncate">
                  {file.name}
                </span>
              </div>
              <span className="text-xs text-muted-foreground flex-shrink-0 hidden sm:inline">
                {file.status === "success" ? "上传成功" : file.status === "error" ? `失败` : "上传中..."}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
