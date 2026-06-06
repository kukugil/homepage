"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"

type Lang = "zh" | "en"

const translations: Record<string, Record<Lang, string>> = {
  // Header
  appTitle: { zh: "电子阅读器书籍管理", en: "E-Reader Book Manager" },
  appSubtitle: { zh: "E-READER BOOK MANAGER", en: "E-READER BOOK MANAGER" },
  notConnected: { zh: "未连接", en: "Disconnected" },
  checking: { zh: "查询中", en: "Checking..." },
  connected: { zh: "已连接", en: "Connected" },
  noData: { zh: "无数据", en: "No data" },
  snPlaceholder: { zh: "输入设备SN", en: "Enter device SN" },
  scanQrTitle: { zh: "扫描 SN 二维码", en: "Scan SN QR Code" },
  scanQrBtn: { zh: "扫描 SN 二维码", en: "Scan QR code" },
  switchTheme: { zh: "切换主题", en: "Toggle theme" },
  closeQr: { zh: "关闭", en: "Close" },
  startingCamera: { zh: "正在启动摄像头...", en: "Starting camera..." },
  qrHint: { zh: "将 SN 二维码对准取景框 · 支持 QR Code 和条形码", en: "Align QR code in viewfinder · QR Code & barcodes supported" },

  // QR Scanner errors
  cameraUnavailable: { zh: "此设备不支持摄像头。请手动输入 SN。", en: "Camera not available. Please enter SN manually." },
  scannerUnavailable: { zh: "此设备不支持摄像头扫描。请手动输入 SN。", en: "Scanning not supported on this device. Please enter SN manually." },
  scannerInitFailed: { zh: "无法初始化扫描器。此设备可能不支持摄像头访问。", en: "Scanner init failed. This device may not support camera access." },
  cameraPermissionDenied: { zh: "摄像头权限被拒绝。请在浏览器设置中允许摄像头访问。", en: "Camera permission denied. Please allow camera access in browser settings." },
  cameraNotFound: { zh: "未检测到摄像头。", en: "No camera detected." },
  cameraDesktopFallback: { zh: "未检测到摄像头。桌面端请手动输入 SN。", en: "No camera detected. Please enter SN manually on desktop." },
  cameraStartFailed: { zh: (msg: string) => `摄像头启动失败: ${msg}`, en: (msg: string) => `Camera start failed: ${msg}` },
  scannerFailed: { zh: "扫描器初始化失败。", en: "Scanner initialization failed." },
  canvasUnsupported: { zh: "浏览器不支持 Canvas 2D。", en: "Browser does not support Canvas 2D." },

  // Upload Tab
  uploadTab: { zh: "上传书籍", en: "Upload Books" },
  dragOrClickUpload: { zh: "拖拽文件到此处，或点击选择", en: "Drag files here or click to select" },
  dropToUpload: { zh: "松开以上传文件", en: "Drop to upload" },
  supportedFormats: { zh: "支持 EPUB / PDF / TXT / BIN / FW，单文件最大 500MB", en: "Supports EPUB / PDF / TXT / BIN / FW, max 500MB per file" },
  uploadProgress: { zh: "上传进度", en: "Upload progress" },
  uploadSuccess: { zh: "上传成功", en: "Uploaded" },
  uploadFailed: { zh: "失败", en: "Failed" },
  uploading: { zh: "上传中...", en: "Uploading..." },
  snInvalid: { zh: "SN 格式无效。序列号须以字母或数字开头，仅包含字母、数字和连字符(-)，长度 1-64 位", en: "Invalid SN format. Must start with letter/digit, only letters, digits & hyphens, 1-64 chars." },
  snRequired: { zh: "请先在顶部输入设备 SN", en: "Please enter a device SN above" },
  loading: { zh: "加载中...", en: "Loading..." },
  noBooks: { zh: "暂无书籍", en: "No books yet" },
  goToUploadHint: { zh: "切换到「上传书籍」标签页开始添加", en: "Switch to Upload tab to add books" },
  goToUpload: { zh: "前往上传", en: "Upload" },
  totalBooks: { zh: (n: number) => `共 ${n} 本书籍`, en: (n: number) => `${n} books` },
  dragToSort: { zh: "拖拽可排序", en: "Drag to reorder" },
  delete: { zh: "删除", en: "Delete" },
  deleteShort: { zh: "删", en: "Del" },
  deleteConfirm: { zh: (title: string) => `确定要删除「${title}」吗？此操作不可恢复。`, en: (title: string) => `Delete "${title}"? This cannot be undone.` },
  unknownTitle: { zh: "未知书名", en: "Unknown Title" },
  unknownAuthor: { zh: "未知作者", en: "Unknown" },
  loadFailed: { zh: "加载失败", en: "Load failed" },
  deleteFailed: { zh: "删除失败", en: "Delete failed" },

  // Book List
  bookListTab: { zh: "书籍列表", en: "Book List" },
  refresh: { zh: "刷新", en: "Refresh" },
  pushing: { zh: "推送中...", en: "Pushing..." },
  pushSelected: { zh: (n: number) => `推送选中${n > 0 ? ` (${n})` : ""}`, en: (n: number) => `Push Selected${n > 0 ? ` (${n})` : ""}` },
  clearAll: { zh: "取消全部", en: "Clear All" },
  cancel: { zh: "取消", en: "Cancel" },
  pushSuccess: { zh: (count: number) => `已推送 ${count} 本书，请在阅读器上进行同步。`, en: (count: number) => `Pushed ${count} books. Please sync on your reader.` },
  pushFailed: { zh: "推送失败", en: "Push failed" },
  clearFailed: { zh: "取消选择失败", en: "Clear selection failed" },

  // Footer
  icp: { zh: "陕ICP备2026013522号", en: "ICP 2026013522" },

  // Metadata
  metaTitle: { zh: "电子阅读器书籍管理", en: "E-Reader Book Manager" },
  metaDescription: { zh: "像素风复古电子阅读器文件管理系统", en: "Retro pixel-art e-reader file management system" },
}

// Runtime: resolve function or string
function tValue(key: string, lang: Lang, args?: any[]): string {
  const entry = translations[key]
  if (!entry) return key
  const val = entry[lang] ?? entry["zh"]
  if (typeof val === "function") return (val as any)(...(args ?? []))
  return val
}

interface I18nContextType {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string, ...args: any[]) => string
}

const I18nContext = createContext<I18nContextType>({
  lang: "zh",
  setLang: () => {},
  t: (key: string) => key,
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangRaw] = useState<Lang>("en")
  // Wrap setLang to persist preference
  const setLang = useCallback((l: Lang) => {
    try { localStorage.setItem("ereader-lang", l) } catch {}
    setLangRaw(l)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    // 1. URL param: ?lang=en or ?lang=zh
    const params = new URLSearchParams(window.location.search)
    const urlLang = params.get("lang")
    if (urlLang === "en") { setLangRaw("en"); return }
    if (urlLang === "zh") { setLangRaw("zh"); return }
    // 2. Host-based default: international IP → English
    const host = window.location.hostname
    const isIntl = host === "43.135.183.44" || host.startsWith("us.")
    // 3. Saved preference
    try {
      const saved = localStorage.getItem("ereader-lang")
      if (saved === "zh" || saved === "en") { setLangRaw(saved); return }
    } catch {}
    // 4. Browser language — zh* → Chinese, everything else → English
    //    But international IP defaults to English regardless
    if (!isIntl && navigator.language.startsWith("zh")) { setLangRaw("zh"); return }
    setLangRaw("en")
  }, [])

  const t = useCallback((key: string, ...args: any[]) => tValue(key, lang, args), [lang])

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useT() {
  return useContext(I18nContext).t
}

export function useLang() {
  return useContext(I18nContext).lang
}
