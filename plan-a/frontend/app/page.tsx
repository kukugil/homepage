"use client"

import { useState } from "react"
import { Header } from "@/components/header"
import { UploadTab } from "@/components/upload-tab"
import { BookListTab } from "@/components/book-list-tab"
import { FilmGrain } from "@/components/film-grain"
import { SNProvider } from "@/hooks/sn-context"

function HomeContent() {
  const [activeTab, setActiveTab] = useState<"upload" | "list">("upload")
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <main className="min-h-screen bg-background relative overflow-hidden">
      <FilmGrain />

      <div className="relative z-10 w-full max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-8">
        <Header />

        {/* Tab Navigation */}
        <div className="flex gap-0.5 mb-4 sm:mb-8 border-b-2 border-secondary">
          <button
            onClick={() => setActiveTab("upload")}
            className={`flex-1 sm:flex-none px-2 sm:px-6 py-3 sm:py-3 text-sm sm:text-lg tracking-wider transition-all
              ${activeTab === "upload"
                ? "bg-primary text-primary-foreground pixel-button"
                : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
          >
            上传书籍
          </button>
          <button
            onClick={() => setActiveTab("list")}
            className={`flex-1 sm:flex-none px-2 sm:px-6 py-3 sm:py-3 text-sm sm:text-lg tracking-wider transition-all
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
            <BookListTab key={refreshKey} />
          )}
        </div>

        {/* Footer */}
        <footer className="mt-6 sm:mt-12 pt-4 sm:pt-8 border-t-2 border-secondary text-center">
          <p className="text-muted-foreground text-[10px] sm:text-sm tracking-widest">
            ◆ PIXEL READER v1.0 ◆
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
