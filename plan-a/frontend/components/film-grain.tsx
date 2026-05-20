"use client"

import { useEffect, useState } from "react"

export function FilmGrain() {
  const [opacity, setOpacity] = useState(0.05)

  useEffect(() => {
    const interval = setInterval(() => {
      setOpacity(0.03 + Math.random() * 0.04)
    }, 100)
    return () => clearInterval(interval)
  }, [])

  return (
    <>
      {/* Film grain texture */}
      <div 
        className="fixed inset-0 pointer-events-none z-50"
        style={{
          opacity,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
      
      {/* Scanlines */}
      <div 
        className="fixed inset-0 pointer-events-none z-40"
        style={{
          background: `repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 0, 0, 0.03) 2px,
            rgba(0, 0, 0, 0.03) 4px
          )`,
        }}
      />

      {/* Vignette effect */}
      <div 
        className="fixed inset-0 pointer-events-none z-30"
        style={{
          background: `radial-gradient(
            ellipse at center,
            transparent 0%,
            transparent 50%,
            rgba(0, 0, 0, 0.3) 100%
          )`,
        }}
      />

      {/* Corner decorations */}
      <div className="fixed top-4 left-4 z-20 flex gap-1">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="w-2 h-2 bg-accent/30" />
        ))}
      </div>
      <div className="fixed top-4 right-4 z-20 flex gap-1">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="w-2 h-2 bg-accent/30" />
        ))}
      </div>
      <div className="fixed bottom-4 left-4 z-20 flex gap-1">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="w-2 h-2 bg-accent/30" />
        ))}
      </div>
      <div className="fixed bottom-4 right-4 z-20 flex gap-1">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="w-2 h-2 bg-accent/30" />
        ))}
      </div>
    </>
  )
}
