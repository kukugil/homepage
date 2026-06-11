"use client"

import { useEffect } from "react"

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof window === "undefined") return

    const body = document.body
    const style = body.style
    const orig = {
      overflow: style.overflow,
      paddingRight: style.paddingRight,
    }

    const sw = window.innerWidth - document.documentElement.clientWidth
    if (sw > 0) style.paddingRight = `${sw}px`
    style.overflow = "hidden"

    return () => {
      style.overflow = orig.overflow
      style.paddingRight = orig.paddingRight
    }
  }, [active])
}
