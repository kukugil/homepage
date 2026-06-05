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
      <div className="bg-card border-2 border-accent w-full max-w-xs animate-in zoom-in-95 duration-200" style={{ boxShadow: '6px 6px 0px var(--accent)' }}>

        {/* Pixel header */}
        <div className="flex items-center gap-1 px-3 py-2 border-b-2 border-border bg-secondary/30">
          <div className="flex gap-1">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="w-2 h-2"
                style={{ background: i === 1 ? 'var(--accent)' : 'var(--accent)', opacity: i === 1 ? 1 : 0.4 }}
              />
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground font-pixel ml-2 tracking-widest">WARNING</span>
        </div>

        {/* Message */}
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-foreground leading-relaxed">{message}</p>
        </div>

        {/* Pixel buttons */}
        <div className="flex border-t-2 border-border text-xs tracking-wider">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 bg-secondary text-foreground hover:brightness-95 active:brightness-90 transition-all border-r-2 border-border pixel-button"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-3 bg-destructive text-destructive-foreground hover:brightness-110 active:brightness-95 transition-all pixel-button"
          >
            {confirmLabel}
          </button>
        </div>

      </div>
    </div>
  )
}
