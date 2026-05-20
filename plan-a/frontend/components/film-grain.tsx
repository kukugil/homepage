"use client"

import { useEffect, useState } from "react"

export function FilmGrain() {
  const [opacity, setOpacity] = useState(0.03)

  useEffect(() => {
    const interval = setInterval(() => {
      setOpacity(0.02 + Math.random() * 0.03)
    }, 100)
    return () => clearInterval(interval)
  }, [])

  return (
    <>
      <div
        className="fixed inset-0 pointer-events-none z-50"
        style={{
          opacity,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      <div
        className="fixed inset-0 pointer-events-none z-40"
        style={{
          background: `repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 0, 0, 0.015) 2px,
            rgba(0, 0, 0, 0.015) 4px
          )`,
        }}
      />

      <div className="fixed top-4 left-4 z-20 flex gap-1">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="w-2 h-2 bg-accent/20" />
        ))}
      </div>
      <div className="fixed top-4 right-4 z-20 flex gap-1">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="w-2 h-2 bg-accent/20" />
        ))}
      </div>
      <div className="fixed bottom-4 left-4 z-20 flex gap-1">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="w-2 h-2 bg-accent/20" />
        ))}
      </div>
      <div className="fixed bottom-4 right-4 z-20 flex gap-1">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="w-2 h-2 bg-accent/20" />
        ))}
      </div>
    </>
  )
}
