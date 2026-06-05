"use client"

interface ConfirmDialogProps {
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
  cancelLabel?: string
}

export function ConfirmDialog({ message, onConfirm, onCancel, confirmLabel = "DELETE", cancelLabel = "CANCEL" }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border-2 border-border w-full max-w-xs pixel-border">
        {/* Pixel header bar */}
        <div className="flex items-center gap-1 px-3 py-2 border-b-2 border-border bg-secondary/30">
          <div className="flex gap-1">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="w-1.5 h-1.5 bg-accent" />
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground font-pixel ml-2 tracking-wider">WARNING</span>
        </div>
        {/* Message — body font for readability */}
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-foreground leading-relaxed">{message}</p>
        </div>
        {/* Buttons */}
        <div className="flex border-t-2 border-border text-[11px] tracking-wider">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 bg-secondary text-foreground hover:bg-secondary/70 transition-colors border-r-2 border-border font-medium"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-3 bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors font-medium"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
