"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Toaster } from "sonner"
import { Header, type HeaderRef } from "@/components/header"
import { UploadTab } from "@/components/upload-tab"
import { BookListTab } from "@/components/book-list-tab"
import { GuideModal } from "@/components/guide-modal"
import { SNProvider, useSN } from "@/hooks/sn-context"
import { I18nProvider, useT } from "@/lib/i18n"

function HomeContent() {
  const { isNewSN, dismissNewSN } = useSN()
  const [activeTab, setActiveTab] = useState<"upload" | "list">("upload")
  const [refreshKey, setRefreshKey] = useState(0)
  const [isIntl, setIsIntl] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [guideMinimizing, setGuideMinimizing] = useState(false)
  const [guideTargetRect, setGuideTargetRect] = useState<DOMRect | null>(null)
  const guideBtnRef = useRef<HeaderRef>(null)
  const t = useT()

  useEffect(() => {
    if (isNewSN) setShowGuide(true)
  }, [isNewSN])

  const handleCloseGuide = useCallback(() => {
    dismissNewSN()
    // FLIP: read target button position
    const rect = guideBtnRef.current?.guideButtonRect()
    setGuideTargetRect(rect ?? null)
    setGuideMinimizing(true)
    setTimeout(() => {
      setShowGuide(false)
      setGuideMinimizing(false)
      setGuideTargetRect(null)
    }, 500)
  }, [dismissNewSN])

  useEffect(() => {
    if (typeof window === "undefined") return
    const h = window.location.hostname
    setIsIntl(h === "43.135.183.44" || h.startsWith("us."))
  }, [])

  return (
    <>
      <Toaster
        position="center"
        gap={8}
        toastOptions={{
          style: {
            background: 'var(--card)',
            color: 'var(--foreground)',
            border: '1px solid var(--border)',
            borderRadius: 0,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: '14px',
            maxWidth: '85vw',
            wordBreak: 'break-word',
            padding: '14px 18px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          },
          duration: 2000,
        }}
      />
    <main className="min-h-screen bg-background">
      <div className="w-full max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-8 scanlines">
        <Header onHelpClick={() => setShowGuide(true)} guideRef={guideBtnRef} />

        {/* Tab Navigation — 移动端更大触摸目标 */}
        <div className="flex gap-0 mb-4 sm:mb-8 border-b-2 border-border">
          <button
            onClick={() => setActiveTab("upload")}
            className={`flex-1 px-3 sm:px-6 py-3 sm:py-2.5 text-sm sm:text-base font-medium tracking-wide
              transition-all touch-manipulation
              ${activeTab === "upload"
                ? "bg-primary text-primary-foreground pixel-button"
                : "bg-secondary text-muted-foreground hover:text-foreground active:bg-secondary/70"
              }`}
          >
            {t("uploadTab")}
          </button>
          <button
            onClick={() => setActiveTab("list")}
            className={`flex-1 px-3 sm:px-6 py-3 sm:py-2.5 text-sm sm:text-base font-medium tracking-wide
              transition-all touch-manipulation
              ${activeTab === "list"
                ? "bg-primary text-primary-foreground pixel-button"
                : "bg-secondary text-muted-foreground hover:text-foreground active:bg-secondary/70"
              }`}
          >
            {t("bookListTab")}
          </button>
        </div>

        {/* Tab Content */}
        <div className="min-h-[60vh] sm:min-h-[500px]">
          {activeTab === "upload" ? (
            <UploadTab onUploadComplete={() => setRefreshKey(k => k + 1)} />
          ) : (
            <BookListTab key={refreshKey} onGoUpload={() => setActiveTab("upload")} />
          )}
        </div>

        {/* Footer */}
        <footer className="mt-8 sm:mt-12 pt-4 sm:pt-6 border-t border-border text-center">
          <p className="text-muted-foreground text-xs sm:text-sm">
            PIXEL READER v1.0
          </p>
          {!isIntl && (
          <p className="text-muted-foreground text-[10px] sm:text-xs mt-1">
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              {t("icp")}
            </a>
          </p>
          )}
        </footer>
      </div>
    </main>

    {showGuide && <GuideModal onClose={handleCloseGuide} minimizing={guideMinimizing} targetRect={guideTargetRect} />}
    </>
  )
}

export default function Home() {
  return (
    <I18nProvider>
      <SNProvider>
        <HomeContent />
      </SNProvider>
    </I18nProvider>
  )
}
