"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { toast } from "sonner"
import { useSN } from "@/hooks/sn-context"
import { useT } from "@/lib/i18n"
import { ConfirmDialog } from "./confirm-dialog"
import { fetchBooks, deleteBook, reorderBooks, selectBooks, formatSize, type BookResponse } from "@/lib/api"

interface Book {
  id: string
  title: string
  author: string
  type: string
  size: string
  coverUrl: string
  selected: boolean
}

function formatBadge(format: string): string {
  const b = format.toUpperCase()
  if (b === 'EPUB') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
  if (b === 'PDF') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  if (b === 'TXT') return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
  return 'bg-secondary text-muted-foreground'
}

function SortableBook({ book, selected, onToggle, onDelete, onShowConfirm, t }: {
  book: Book
  selected: boolean
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onShowConfirm: (msg: string, onOk: () => void) => void
  t: (key: string, ...args: any[]) => string
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: book.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        bg-card border p-2.5 sm:p-4 rounded-lg transition-colors
        ${selected ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'}
        ${isDragging ? "opacity-50 border-accent shadow-sm" : ""}
      `}
    >
      <div className="flex items-center gap-2 sm:gap-4">
        <label className="flex-shrink-0 cursor-pointer p-1">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(book.id)}
            className="w-4 h-4 rounded accent-accent cursor-pointer"
          />
        </label>

        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-2 sm:p-1 hover:bg-secondary/50 rounded flex-shrink-0 touch-none"
        >
          <svg width="12" height="18" viewBox="0 0 12 20" className="text-muted-foreground sm:w-3">
            <rect x="2" y="2" width="2" height="2" fill="currentColor"/>
            <rect x="8" y="2" width="2" height="2" fill="currentColor"/>
            <rect x="2" y="6" width="2" height="2" fill="currentColor"/>
            <rect x="8" y="6" width="2" height="2" fill="currentColor"/>
            <rect x="2" y="10" width="2" height="2" fill="currentColor"/>
            <rect x="8" y="10" width="2" height="2" fill="currentColor"/>
            <rect x="2" y="14" width="2" height="2" fill="currentColor"/>
            <rect x="8" y="14" width="2" height="2" fill="currentColor"/>
            <rect x="2" y="18" width="2" height="2" fill="currentColor"/>
            <rect x="8" y="18" width="2" height="2" fill="currentColor"/>
          </svg>
        </button>

        <div className="w-10 h-14 sm:w-12 sm:h-16 bg-secondary rounded flex items-center justify-center flex-shrink-0 overflow-hidden">
          {book.coverUrl ? (
            <img
              src={book.coverUrl}
              alt={book.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                const el = e.currentTarget
                el.style.display = 'none'
                el.parentElement?.classList.add('cover-fallback')
              }}
            />
          ) : null}
          <svg width="16" height="16" viewBox="0 0 24 24" className={`text-muted-foreground ${book.coverUrl ? 'hidden' : ''}`}>
            <rect x="4" y="2" width="16" height="2" fill="currentColor"/>
            <rect x="4" y="20" width="16" height="2" fill="currentColor"/>
            <rect x="4" y="2" width="2" height="20" fill="currentColor"/>
            <rect x="8" y="8" width="8" height="2" fill="currentColor"/>
            <rect x="8" y="12" width="6" height="2" fill="currentColor"/>
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-foreground text-sm sm:text-base font-medium truncate">{book.title}</h3>
            <span className={`text-[10px] sm:text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${formatBadge(book.type)}`}>
              {book.type}
            </span>
          </div>
          <p className="text-muted-foreground text-xs sm:text-sm">
            {book.author} · {book.size}
          </p>
        </div>

        <button
          onClick={() => {
            onShowConfirm(t("deleteConfirm", book.title), () => onDelete(book.id))
          }}
          className="flex-shrink-0 px-3 py-1.5 sm:px-3 sm:py-1.5 border border-destructive/40 text-destructive text-xs sm:text-sm rounded hover:bg-destructive/10 transition-colors"
        >
          <span className="sm:hidden">{t("deleteShort")}</span>
          <span className="hidden sm:inline">{t("delete")}</span>
        </button>
      </div>
    </div>
  )
}

function mapBook(b: BookResponse): Book {
  return {
    id: b.book_id,
    title: b.title || "Unknown Title",
    author: b.author || "Unknown",
    type: (b.format || "").toUpperCase(),
    size: formatSize(b.file_size),
    coverUrl: b.cover_url || "",
    selected: (b as any).selected === 1,
  }
}

interface BookListTabProps {
  refreshKey?: number
  onGoUpload?: () => void
}

export function BookListTab({ refreshKey, onGoUpload }: BookListTabProps) {
  const { deviceSN, isValidSN } = useSN()
  const t = useT()
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pushing, setPushing] = useState(false)
  const [successMsg, setSuccessMsg] = useState("")
  const [confirm, setConfirm] = useState<{ message: string; onOk: () => void } | null>(null)

  const showConfirm = useCallback((message: string, onOk: () => void) => {
    setConfirm({ message, onOk })
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const loadBooks = useCallback(async (sn: string, signal?: AbortSignal) => {
    if (!sn || !isValidSN) {
      setBooks([])
      return
    }
    setLoading(true)
    setError("")
    try {
      const data = await fetchBooks(sn, signal)
      const mapped = data.map(mapBook)
      setBooks(mapped)
      setSelectedIds(new Set(mapped.filter(b => b.selected).map(b => b.id)))
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : t("loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [isValidSN])

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const abortRef = useRef<AbortController>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (abortRef.current) abortRef.current.abort()

    if (!deviceSN || !isValidSN) {
      setBooks([])
      return
    }

    const controller = new AbortController()
    abortRef.current = controller

    debounceRef.current = setTimeout(() => {
      loadBooks(deviceSN, controller.signal)
    }, 500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      controller.abort()
    }
  }, [deviceSN, isValidSN, loadBooks, refreshKey])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !deviceSN) return

    const oldIndex = books.findIndex((item) => item.id === active.id)
    const newIndex = books.findIndex((item) => item.id === over.id)
    const reordered = arrayMove(books, oldIndex, newIndex)
    setBooks(reordered)
    // 拖拽后自动保存，无需手动点"保存"
    reorderBooks(deviceSN, reordered.map((b) => b.id)).catch(() => {})
  }

  const handleDelete = async (id: string) => {
    if (!deviceSN) return
    try {
      await deleteBook(deviceSN, id)
      setBooks((prev) => prev.filter((b) => b.id !== id))
      setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("deleteFailed"))
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    await loadBooks(deviceSN, controller.signal)
    setRefreshing(false)
  }

  const handleToggle = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handlePushSelected = async () => {
    if (!deviceSN || selectedIds.size === 0) return
    setPushing(true)
    const count = selectedIds.size
    try {
      await selectBooks(deviceSN, Array.from(selectedIds))
      // Update local state and clear selection
      setBooks(prev => prev.map(b => ({ ...b, selected: selectedIds.has(b.id) })))
      setSelectedIds(new Set())
      setError("")
      setSuccessMsg("")
      toast.success(t("pushSuccess", count), { duration: 5000 })
      setTimeout(() => setSuccessMsg(""), 5000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("pushFailed"))
    } finally {
      setPushing(false)
    }
  }

  const handleClearAllSelected = async () => {
    if (!deviceSN) return
    setPushing(true)
    try {
      await selectBooks(deviceSN, [])
      setSelectedIds(new Set())
      setBooks(prev => prev.map(b => ({ ...b, selected: false })))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("clearFailed"))
    } finally {
      setPushing(false)
    }
  }

  const handleDeleteSelected = async () => {
    if (!deviceSN || selectedIds.size === 0) return
    showConfirm(t("deleteConfirm", `${selectedIds.size} books`), async () => {
      setConfirm(null)
      setError("")
      let failed = 0
      for (const id of selectedIds) {
        try { await deleteBook(deviceSN, id) } catch { failed++ }
      }
      setBooks(prev => prev.filter(b => !selectedIds.has(b.id)))
      setSelectedIds(new Set())
      if (failed) setError(`${failed} book(s) failed to delete`)
    })
  }

  if (!isValidSN) {
    return (
      <div className={`text-center py-12 sm:py-16 border-2 border-dashed
        ${deviceSN && !isValidSN ? "border-destructive" : "border-secondary"}`}>
        <p className={`text-sm sm:text-base
          ${deviceSN && !isValidSN ? "text-destructive" : "text-muted-foreground"}`}>
          {deviceSN && !isValidSN
            ? t("snInvalid")
            : t("snRequired")
          }
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="text-center py-12 sm:py-16 border-2 border-dashed border-secondary">
        <div className="flex justify-center gap-2 mb-3 sm:mb-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="w-3 h-3 bg-accent animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
          ))}
        </div>
        <p className="text-muted-foreground text-sm sm:text-base">{t("loading")}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {error && (
        <div className="px-3 sm:px-4 py-2 bg-destructive/10 border border-destructive/30 text-destructive text-xs sm:text-sm rounded">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="px-3 sm:px-4 py-2 bg-success/10 border border-success/30 text-success text-xs sm:text-sm rounded">
          {successMsg}
        </div>
      )}

      {/* Action Buttons — pixel-grid rhythm: 2px gap, primary push gets flex-1 on mobile */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="h-9 px-2.5 flex items-center gap-1.5 bg-secondary text-foreground text-xs sm:text-sm rounded hover:bg-secondary/70 transition-colors disabled:opacity-60 flex-shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" className={`text-current sm:w-4 sm:h-4 ${refreshing ? 'animate-spin' : ''}`}>
            <rect x="7" y="1" width="2" height="2" fill="currentColor"/>
            <rect x="9" y="3" width="2" height="2" fill="currentColor"/>
            <rect x="11" y="5" width="2" height="2" fill="currentColor"/>
            <rect x="13" y="7" width="2" height="2" fill="currentColor"/>
            <rect x="11" y="9" width="2" height="2" fill="currentColor"/>
            <rect x="9" y="11" width="2" height="2" fill="currentColor"/>
            <rect x="7" y="13" width="2" height="2" fill="currentColor"/>
            <rect x="5" y="11" width="2" height="2" fill="currentColor"/>
            <rect x="3" y="9" width="2" height="2" fill="currentColor"/>
            <rect x="1" y="7" width="2" height="2" fill="currentColor"/>
            <rect x="3" y="5" width="2" height="2" fill="currentColor"/>
            <rect x="5" y="3" width="2" height="2" fill="currentColor"/>
          </svg>
          <span className="hidden sm:inline">{t("refresh")}</span>
        </button>
        {/* Push — primary action, flex-1 on mobile for thumb-friendly tap target */}
        <button
          onClick={handlePushSelected}
          disabled={selectedIds.size === 0 || pushing}
          className={`h-9 px-3 sm:px-4 text-sm rounded flex items-center justify-center gap-1.5 sm:gap-2 transition-colors flex-shrink-0 flex-1 sm:flex-none
            ${selectedIds.size > 0
              ? "bg-primary text-primary-foreground hover:bg-primary/80"
              : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" className="text-current sm:w-4 sm:h-4">
            <polygon points="2,2 14,8 2,14" fill="currentColor"/>
          </svg>
          {pushing ? t("pushing") : t("pushSelected", selectedIds.size)}
        </button>
        {selectedIds.size > 0 && (
          <>
            <button
              onClick={handleClearAllSelected}
              className="h-9 px-3 text-sm rounded border border-border text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            >
              {t("clearAll")}
            </button>
            <button
              onClick={handleDeleteSelected}
              className="h-9 px-3 text-sm rounded border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
            >
              {t("deleteShort")} ({selectedIds.size})
            </button>
          </>
        )}
      </div>

      {/* Books List */}
      {books.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={books.map(b => b.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2 sm:space-y-3">
              {books.map((book) => (
                <SortableBook
                  key={book.id}
                  book={book}
                  selected={selectedIds.has(book.id)}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onShowConfirm={showConfirm}
                  t={t}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="text-center py-12 sm:py-16 border border-dashed border-border rounded-lg">
          <svg width="32" height="32" viewBox="0 0 48 48" className="mx-auto mb-3 sm:mb-4 text-muted-foreground sm:w-12 sm:h-12">
            <rect x="8" y="4" width="32" height="40" fill="none" stroke="currentColor" strokeWidth="2"/>
            <rect x="16" y="12" width="16" height="2" fill="currentColor"/>
            <rect x="16" y="18" width="12" height="2" fill="currentColor"/>
            <rect x="16" y="24" width="16" height="2" fill="currentColor"/>
          </svg>
          <p className="text-muted-foreground text-sm sm:text-base mb-1">{t("noBooks")}</p>
          <p className="text-muted-foreground text-xs mb-4">{t("goToUploadHint")}</p>
          {onGoUpload && (
            <button
              onClick={onGoUpload}
              className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded hover:bg-primary/90 transition-colors"
            >
              {t("goToUpload")}
            </button>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center justify-between text-xs sm:text-sm text-muted-foreground border-t border-secondary pt-2.5 sm:pt-4">
        <span>{t("totalBooks", books.length)}</span>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-accent" />
          <span>{t("dragToSort")}</span>
        </div>
      </div>

      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          onConfirm={confirm.onOk}
          onCancel={() => setConfirm(null)}
          confirmLabel={t("delete") as string}
          cancelLabel={t("cancel") as string}
        />
      )}
    </div>
  )
}
