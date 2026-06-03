"use client"

import { useState } from "react"
import { Header } from "@/components/header"
import { UploadTab } from "@/components/upload-tab"
import { BookListTab } from "@/components/book-list-tab"
import { SNProvider } from "@/hooks/sn-context"

function HomeContent() {
  const [activeTab, setActiveTab] = useState<"upload" | "list">("upload")
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <main className="min-h-screen bg-background">
      <div className="w-full max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-8 scanlines">
        <Header />

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-6 sm:mb-8 border-b-2 border-border">
          <button
            onClick={() => setActiveTab("upload")}
            className={`flex-1 sm:flex-none px-3 sm:px-6 py-2.5 text-sm sm:text-base font-medium tracking-wide transition-all
              ${activeTab === "upload"
                ? "bg-primary text-primary-foreground pixel-button"
                : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
          >
            上传书籍
          </button>
          <button
            onClick={() => setActiveTab("list")}
            className={`flex-1 sm:flex-none px-3 sm:px-6 py-2.5 text-sm sm:text-base font-medium tracking-wide transition-all
              ${activeTab === "list"
                ? "bg-primary text-primary-foreground pixel-button"
                : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
          >
            书籍列表
          </button>
        </div>

        {/* Tab Content */}
        <div className="min-h-[400px] sm:min-h-[500px]">
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
          <p className="text-muted-foreground text-[10px] sm:text-xs mt-1">
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              陕ICP备2026013522号
            </a>
          </p>
        </footer>
      </div>
    </main>
  )
}

export default function Home() {
  return (
    <SNProvider>
      <HomeContent />
    </SNProvider>
  )
}
