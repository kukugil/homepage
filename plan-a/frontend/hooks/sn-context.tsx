"use client"

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react"

// Must match server/config.js SN_PATTERN
export const SN_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/

interface SNContextType {
  deviceSN: string
  setDeviceSN: (sn: string) => void
  isConnected: boolean
  setIsConnected: (v: boolean) => void
  isValidSN: boolean
  snExists: boolean
  checking: boolean
}

const SNContext = createContext<SNContextType>({
  deviceSN: "",
  setDeviceSN: () => {},
  isConnected: false,
  setIsConnected: () => {},
  isValidSN: false,
  snExists: false,
  checking: false,
})

export function SNProvider({ children }: { children: ReactNode }) {
  const [deviceSN, setDeviceSN] = useState("")
  const [isConnected, setIsConnected] = useState(false)
  const [snExists, setSnExists] = useState(false)
  const [checking, setChecking] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const isValidSN = useMemo(() => SN_REGEX.test(deviceSN), [deviceSN])

  // 首次加载时从 URL 参数 ?sn=XXX 自动填入 SN
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const snFromUrl = params.get('sn')
    if (snFromUrl && SN_REGEX.test(snFromUrl)) {
      setDeviceSN(snFromUrl)
    }
  }, [])

  useEffect(() => {
    // Cancel any in-flight check
    if (abortRef.current) abortRef.current.abort()

    if (!isValidSN) {
      setSnExists(false)
      setChecking(false)
      return
    }

    // Debounce: wait 400ms after last keystroke before checking
    const controller = new AbortController()
    abortRef.current = controller
    setChecking(true)

    const timer = setTimeout(async () => {
      try {
        const resp = await fetch(
          `/api/v1/devices/${encodeURIComponent(deviceSN)}/status`,
          { signal: controller.signal }
        )
        if (resp.ok) {
          const data = await resp.json()
          if (!controller.signal.aborted) {
            setSnExists(data.exists)
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return
      } finally {
        if (!controller.signal.aborted) {
          setChecking(false)
        }
      }
    }, 400)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [deviceSN, isValidSN])

  return (
    <SNContext.Provider value={{ deviceSN, setDeviceSN, isConnected, setIsConnected, isValidSN, snExists, checking }}>
      {children}
    </SNContext.Provider>
  )
}

export function useSN() {
  return useContext(SNContext)
}
