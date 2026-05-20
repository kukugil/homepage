"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"

interface SNContextType {
  deviceSN: string
  setDeviceSN: (sn: string) => void
  isConnected: boolean
  setIsConnected: (v: boolean) => void
}

const SNContext = createContext<SNContextType>({
  deviceSN: "",
  setDeviceSN: () => {},
  isConnected: false,
  setIsConnected: () => {},
})

export function SNProvider({ children }: { children: ReactNode }) {
  const [deviceSN, setDeviceSN] = useState("")
  const [isConnected, setIsConnected] = useState(false)

  return (
    <SNContext.Provider value={{ deviceSN, setDeviceSN, isConnected, setIsConnected }}>
      {children}
    </SNContext.Provider>
  )
}

export function useSN() {
  return useContext(SNContext)
}
