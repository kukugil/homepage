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
        bg-card border-2 border-secondary p-3 sm:p-4
        transition-colors hover:border-accent/50
        ${isDragging ? "opacity-50 border-accent" : ""}
      `}
    >
      <div className="flex items-start sm:items-center gap-3 sm:gap-4">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-secondary/50 flex-shrink-0"
        >
          <svg width="12" height="20" viewBox="0 0 12 20" className="text-muted-foreground">
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
        <div className="w-10 h-14 sm:w-12 sm:h-16 bg-secondary border border-border flex items-center justify-center flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" className="text-muted-foreground">
            <rect x="4" y="2" width="16" height="2" fill="currentColor"/>
            <rect x="4" y="20" width="16" height="2" fill="currentColor"/>
            <rect x="4" y="2" width="2" height="20" fill="currentColor"/>
            <rect x="8" y="8" width="8" height="2" fill="currentColor"/>
            <rect x="8" y="12" width="6" height="2" fill="currentColor"/>
          </svg>
        </div>

        {/* Book Info & Actions */}
        <div className="flex-1 min-w-0">
          <h3 className="text-foreground text-base sm:text-lg truncate">{book.title}</h3>
          <p className="text-muted-foreground text-xs sm:text-sm">
            {book.author} · {book.type} · {book.size}
          </p>

          {/* Mobile Actions */}
          <div className="flex gap-2 mt-2 sm:hidden">
            <button
              onClick={() => onDelete(book.id)}
              className="px-3 py-1.5 bg-destructive text-destructive-foreground text-xs hover:bg-destructive/80 pixel-button"
            >
              删除
            </button>
          </div>
        </div>

        {/* Desktop Actions */}
        <div className="hidden sm:flex gap-2 flex-shrink-0">
          <button
            onClick={() => onDelete(book.id)}
            className="px-4 py-2 bg-destructive text-destructive-foreground text-sm hover:bg-destructive/80 pixel-button"
          >
            删除
          </button>
        </div>
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
  const { deviceSN } = useSN()
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
    if (!deviceSN) {
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
  }, [deviceSN])

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

  if (!deviceSN) {
    return (
      <div className="text-center py-16 border-2 border-dashed border-secondary">
        <p className="text-muted-foreground">请先输入设备 SN</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="text-center py-16 border-2 border-dashed border-secondary">
        <div className="flex justify-center gap-2 mb-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="w-3 h-3 bg-accent animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
          ))}
        </div>
        <p className="text-muted-foreground">加载中...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="px-4 py-2 bg-destructive/20 border border-destructive text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleRefresh}
          className="px-4 py-2 bg-secondary text-foreground text-sm hover:bg-secondary/70 pixel-button flex items-center gap-2"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" className="text-current">
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
          刷新列表
        </button>
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className={`
            px-4 py-2 text-sm pixel-button flex items-center gap-2
            ${hasChanges
              ? "bg-accent text-accent-foreground hover:bg-accent/80"
              : "bg-muted text-muted-foreground cursor-not-allowed"
            }
          `}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" className="text-current">
            <rect x="2" y="2" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"/>
            <rect x="5" y="2" width="6" height="4" fill="currentColor"/>
            <rect x="4" y="9" width="8" height="5" fill="currentColor"/>
          </svg>
          保存排序
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
            <div className="space-y-3">
              {books.map((book) => (
                <SortableBook key={book.id} book={book} onDelete={handleDelete} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="text-center py-16 border-2 border-dashed border-secondary">
          <svg width="48" height="48" viewBox="0 0 48 48" className="mx-auto mb-4 text-muted-foreground">
            <rect x="8" y="4" width="32" height="40" fill="none" stroke="currentColor" strokeWidth="2"/>
            <rect x="16" y="12" width="16" height="2" fill="currentColor"/>
            <rect x="16" y="18" width="12" height="2" fill="currentColor"/>
            <rect x="16" y="24" width="16" height="2" fill="currentColor"/>
          </svg>
          <p className="text-muted-foreground">暂无书籍</p>
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center justify-between text-sm text-muted-foreground border-t border-secondary pt-4">
        <span>共 {books.length} 本书籍</span>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-accent" />
          <span>拖拽可排序</span>
        </div>
      </div>
    </div>
  )
}
