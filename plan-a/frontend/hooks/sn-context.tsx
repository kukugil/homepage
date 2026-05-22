"use client"

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react"

// Must match server/config.js SN_PATTERN
export const SN_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/

interface SNContextType {
  deviceSN: string
  setDeviceSN: (sn: string) => void
  isConnected: boolean
  setIsConnected: (v: boolean) => void
  isValidSN: boolean
}

const SNContext = createContext<SNContextType>({
  deviceSN: "",
  setDeviceSN: () => {},
  isConnected: false,
  setIsConnected: () => {},
  isValidSN: false,
})

export function SNProvider({ children }: { children: ReactNode }) {
  const [deviceSN, setDeviceSN] = useState("")
  const [isConnected, setIsConnected] = useState(false)

  const isValidSN = useMemo(() => SN_REGEX.test(deviceSN), [deviceSN])

  return (
    <SNContext.Provider value={{ deviceSN, setDeviceSN, isConnected, setIsConnected, isValidSN }}>
      {children}
    </SNContext.Provider>
  )
}

export function useSN() {
  return useContext(SNContext)
}
