"use client"

import { useState, useEffect, useCallback } from "react"
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
import { useSN } from "@/hooks/sn-context"
import { fetchBooks, deleteBook, reorderBooks, formatSize, type BookResponse } from "@/lib/api"

interface Book {
  id: string
  title: string
  author: string
  type: string
  size: string
}

function SortableBook({ book, onDelete }: { book: Book; onDelete: (id: string) => void }) {
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
        bg-card border-2 border-secondary p-2.5 sm:p-4
        transition-colors hover:border-accent/50
        ${isDragging ? "opacity-50 border-accent" : ""}
      `}
    >
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-2 sm:p-1 hover:bg-secondary/50 flex-shrink-0 touch-none"
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

        {/* Book Cover Placeholder */}
        <div className="w-9 h-12 sm:w-12 sm:h-16 bg-secondary border border-border flex items-center justify-center flex-shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" className="text-muted-foreground">
            <rect x="4" y="2" width="16" height="2" fill="currentColor"/>
            <rect x="4" y="20" width="16" height="2" fill="currentColor"/>
            <rect x="4" y="2" width="2" height="20" fill="currentColor"/>
            <rect x="8" y="8" width="8" height="2" fill="currentColor"/>
            <rect x="8" y="12" width="6" height="2" fill="currentColor"/>
          </svg>
        </div>

        {/* Book Info */}
        <div className="flex-1 min-w-0">
          <h3 className="text-foreground text-sm sm:text-lg truncate">{book.title}</h3>
          <p className="text-muted-foreground text-xs sm:text-sm">
            {book.author} · {book.type} · {book.size}
          </p>
        </div>

        {/* Delete button — always visible on mobile, icons on desktop */}
        <button
          onClick={() => onDelete(book.id)}
          className="flex-shrink-0 px-3 py-2 sm:px-4 sm:py-2 bg-destructive text-destructive-foreground text-xs sm:text-sm hover:bg-destructive/80 pixel-button"
        >
          <span className="sm:hidden">删</span>
          <span className="hidden sm:inline">删除</span>
        </button>
      </div>
    </div>
  )
}

function mapBook(b: BookResponse): Book {
  return {
    id: b.book_id,
    title: b.title || "未知书名",
    author: b.author || "未知作者",
    type: (b.format || "").toUpperCase(),
    size: formatSize(b.file_size),
  }
}

interface BookListTabProps {
  refreshKey?: number
}

export function BookListTab({ refreshKey }: BookListTabProps) {
  const { deviceSN, isValidSN } = useSN()
  const [books, setBooks] = useState<Book[]>([])
  const [hasChanges, setHasChanges] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const loadBooks = useCallback(async () => {
    if (!deviceSN || !isValidSN) {
      setBooks([])
      return
    }
    setLoading(true)
    setError("")
    try {
      const data = await fetchBooks(deviceSN)
      setBooks(data.map(mapBook))
      setHasChanges(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载失败")
    } finally {
      setLoading(false)
    }
  }, [deviceSN, isValidSN])

  useEffect(() => {
    loadBooks()
  }, [loadBooks, refreshKey])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setBooks((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id)
        const newIndex = items.findIndex((item) => item.id === over.id)
        setHasChanges(true)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  const handleDelete = async (id: string) => {
    if (!deviceSN) return
    try {
      await deleteBook(deviceSN, id)
      setBooks((prev) => prev.filter((b) => b.id !== id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "删除失败")
    }
  }

  const handleSave = async () => {
    if (!deviceSN) return
    try {
      await reorderBooks(deviceSN, books.map((b) => b.id))
      setHasChanges(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "保存排序失败")
    }
  }

  const handleRefresh = () => {
    loadBooks()
  }

  if (!isValidSN) {
    return (
      <div className={`text-center py-12 sm:py-16 border-2 border-dashed
        ${deviceSN && !isValidSN ? "border-destructive" : "border-secondary"}`}>
        <p className={`text-sm sm:text-base
          ${deviceSN && !isValidSN ? "text-destructive" : "text-muted-foreground"}`}>
          {deviceSN && !isValidSN
            ? "SN 格式无效。序列号须以字母或数字开头，仅包含字母、数字和连字符(-)"
            : "请先输入设备 SN"
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
        <p className="text-muted-foreground text-sm sm:text-base">加载中...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {error && (
        <div className="px-3 sm:px-4 py-2 bg-destructive/20 border border-destructive text-destructive text-xs sm:text-sm">
          {error}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 sm:gap-3">
        <button
          onClick={handleRefresh}
          className="flex-1 sm:flex-none px-3 sm:px-4 py-3 sm:py-2 bg-secondary text-foreground text-sm hover:bg-secondary/70 pixel-button flex items-center justify-center gap-1.5 sm:gap-2"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" className="text-current sm:w-4 sm:h-4">
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
          刷新
        </button>
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className={`
            flex-1 sm:flex-none px-3 sm:px-4 py-3 sm:py-2 text-sm pixel-button flex items-center justify-center gap-1.5 sm:gap-2
            ${hasChanges
              ? "bg-accent text-accent-foreground hover:bg-accent/80"
              : "bg-muted text-muted-foreground cursor-not-allowed"
            }
          `}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" className="text-current sm:w-4 sm:h-4">
            <rect x="2" y="2" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"/>
            <rect x="5" y="2" width="6" height="4" fill="currentColor"/>
            <rect x="4" y="9" width="8" height="5" fill="currentColor"/>
          </svg>
          保存
        </button>
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
                <SortableBook key={book.id} book={book} onDelete={handleDelete} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="text-center py-12 sm:py-16 border-2 border-dashed border-secondary">
          <svg width="32" height="32" viewBox="0 0 48 48" className="mx-auto mb-3 sm:mb-4 text-muted-foreground sm:w-12 sm:h-12">
            <rect x="8" y="4" width="32" height="40" fill="none" stroke="currentColor" strokeWidth="2"/>
            <rect x="16" y="12" width="16" height="2" fill="currentColor"/>
            <rect x="16" y="18" width="12" height="2" fill="currentColor"/>
            <rect x="16" y="24" width="16" height="2" fill="currentColor"/>
          </svg>
          <p className="text-muted-foreground text-sm sm:text-base">暂无书籍</p>
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center justify-between text-xs sm:text-sm text-muted-foreground border-t border-secondary pt-2.5 sm:pt-4">
        <span>共 {books.length} 本书籍</span>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-accent" />
          <span>拖拽可排序</span>
        </div>
      </div>
    </div>
  )
}
