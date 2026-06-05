"use client"

interface ConfirmDialogProps {
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border-2 border-border w-full max-w-xs shadow-lg">
        {/* Pixel header bar */}
        <div className="flex items-center gap-1 px-3 py-2 border-b-2 border-border">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-accent" />
            <div className="w-2 h-2 bg-accent" />
          </div>
          <span className="text-xs text-muted-foreground font-pixel ml-2">CONFIRM</span>
        </div>
        {/* Message */}
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-foreground whitespace-pre-line font-pixel">{message}</p>
        </div>
        {/* Buttons — pixel style */}
        <div className="flex border-t-2 border-border font-pixel text-xs">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 bg-secondary text-foreground hover:bg-secondary/70 transition-colors border-r-2 border-border"
          >
            CANCEL
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-3 bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
          >
            DELETE
          </button>
        </div>
      </div>
    </div>
  )
}
