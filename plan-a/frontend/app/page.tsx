"use client"

import { useState, useEffect } from "react"
import { Toaster } from "sonner"
import { Header } from "@/components/header"
import { UploadTab } from "@/components/upload-tab"
import { BookListTab } from "@/components/book-list-tab"
import { GuideModal } from "@/components/guide-modal"
import { SNProvider } from "@/hooks/sn-context"
import { I18nProvider, useT } from "@/lib/i18n"

function HomeContent() {
  const [activeTab, setActiveTab] = useState<"upload" | "list">("upload")
  const [refreshKey, setRefreshKey] = useState(0)
  const [isIntl, setIsIntl] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const t = useT()

  useEffect(() => {
    if (typeof window === "undefined") return
    const h = window.location.hostname
    setIsIntl(h === "43.135.183.44" || h.startsWith("us."))
  }, [])

  return (
    <>
      <Toaster
        position="top-center"
        gap={8}
        toastOptions={{
          unstyled: false,
          classNames: {
            toast: 'pixel-toast',
            title: 'pixel-toast-title',
            description: 'pixel-toast-desc',
            actionButton: 'pixel-toast-action',
            cancelButton: 'pixel-toast-cancel',
            closeButton: 'pixel-toast-close',
          },
          style: {
            background: 'var(--card)',
            color: 'var(--foreground)',
            border: '2px solid var(--accent)',
            borderRadius: 0,
            fontFamily: 'var(--font-vt323)',
            fontSize: '1.1rem',
            letterSpacing: '0.05em',
            padding: '10px 16px',
            boxShadow: '4px 4px 0px var(--accent)',
            maxWidth: '90vw',
          },
          duration: 2000,
        }}
      />
    <main className="min-h-screen bg-background">
      <div className="w-full max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-8 scanlines">
        <Header onHelpClick={() => setShowGuide(true)} />

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

    {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
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
