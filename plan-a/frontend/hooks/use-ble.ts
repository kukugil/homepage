"use client"

import { useCallback } from "react"
import { useSN, SN_REGEX } from "./sn-context"

const KNOWN_SERVICES = [
  "0000180a-0000-1000-8000-00805f9b34fb", // Device Information
  "00001800-0000-1000-8000-00805f9b34fb", // Generic Access
  "00001801-0000-1000-8000-00805f9b34fb", // Generic Attribute
  "0000180f-0000-1000-8000-00805f9b34fb", // Battery Service
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000fff0-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
]

const KNOWN_SN_CHARACTERISTICS = [
  "00002a25-0000-1000-8000-00805f9b34fb", // Serial Number String
  "00002a24-0000-1000-8000-00805f9b34fb", // Model Number String
  "00002a29-0000-1000-8000-00805f9b34fb", // Manufacturer Name String
  "00002a26-0000-1000-8000-00805f9b34fb", // Firmware Revision String
  "00002a27-0000-1000-8000-00805f9b34fb", // Hardware Revision String
  "00002a00-0000-1000-8000-00805f9b34fb", // Device Name
  "00002a01-0000-1000-8000-00805f9b34fb", // Appearance
  "6e400002-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART TX
  "0000ff01-0000-1000-8000-00805f9b34fb",
  "0000fff1-0000-1000-8000-00805f9b34fb",
  "0000ffe1-0000-1000-8000-00805f9b34fb",
]

function tryDecodeSN(value: DataView): string | null {
  try {
    const decoded = new TextDecoder("utf-8").decode(value)
    const trimmed = decoded.replace(/\0/g, "").trim()
    if (trimmed && SN_REGEX.test(trimmed)) return trimmed
  } catch { /* utf-8 failed, try ascii */ }

  try {
    const decoded = new TextDecoder("ascii").decode(value)
    const trimmed = decoded.replace(/\0/g, "").trim()
    if (trimmed && SN_REGEX.test(trimmed)) return trimmed
  } catch { /* ascii also failed */ }

  return null
}

function getPlatformHint(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : ""
  if (/Android/i.test(ua)) return "android"
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios"
  if (/Mac/i.test(ua)) return "mac"
  if (/Windows/i.test(ua)) return "windows"
  if (/Linux/i.test(ua)) return "linux"
  return "other"
}

async function readSNFromServer(
  server: BluetoothRemoteGATTServer,
  device: BluetoothDevice
): Promise<string> {
  // Try known services with known characteristics
  for (const svcUuid of KNOWN_SERVICES) {
    try {
      const service = await server.getPrimaryService(svcUuid)
      for (const charUuid of KNOWN_SN_CHARACTERISTICS) {
        try {
          const char = await service.getCharacteristic(charUuid)
          if (!char.properties.read) continue
          const value = await char.readValue()
          if (value.byteLength > 128) continue
          const sn = tryDecodeSN(value)
          if (sn) return sn
        } catch { /* characteristic not in this service */ }
      }
    } catch { /* service not on this device */ }
  }

  // Exhaustive scan of all services and characteristics
  let allServices: BluetoothRemoteGATTService[] = []
  try {
    allServices = await server.getPrimaryServices()
  } catch {
    throw new Error(
      "无法读取设备的 GATT 服务列表。\n\n" +
      "MCU 可能与当前平台存在兼容性问题。\n" +
      "建议手动输入设备 SN，或使用 nRF Connect App 检查设备的 BLE 配置。"
    )
  }

  for (const service of allServices) {
    try {
      const chars = await service.getCharacteristics()
      for (const char of chars) {
        try {
          if (!char.properties.read) continue
          const value = await char.readValue()
          if (value.byteLength > 128) continue
          const sn = tryDecodeSN(value)
          if (sn) return sn
        } catch { /* skip unreadable characteristic */ }
      }
    } catch { /* skip inaccessible service */ }
  }

  // Device name fallback
  if (device.name && SN_REGEX.test(device.name.trim())) {
    return device.name.trim()
  }

  // GAP device name characteristic
  try {
    const gapService = await server.getPrimaryService("00001800-0000-1000-8000-00805f9b34fb")
    const deviceNameChar = await gapService.getCharacteristic("00002a00-0000-1000-8000-00805f9b34fb")
    const nameValue = await deviceNameChar.readValue()
    const name = tryDecodeSN(nameValue)
    if (name) return name
  } catch { /* exhausted all strategies */ }

  throw new Error(
    "已连接设备但无法读取 SN。\n\n" +
    "可能的原因及解决方案：\n" +
    "• MCU 的 GATT 服务中没有标准的序列号特征值\n" +
    "• Android 用户请确保已开启「位置信息」\n" +
    "• 尝试使用 nRF Connect App 扫描设备，确认实际的 GATT 服务 UUID\n" +
    "• 也可以在输入框中手动输入 MCU 的序列号"
  )
}

export function useBle() {
  const { setDeviceSN, setIsConnected } = useSN()

  const finalizeConnection = useCallback(
    (device: BluetoothDevice, sn: string) => {
      const trimmed = sn.trim()
      setDeviceSN(trimmed)
      setIsConnected(true)

      device.addEventListener("gattserverdisconnected", () => {
        setIsConnected(false)
      })

      return trimmed
    },
    [setDeviceSN, setIsConnected]
  )

  const connectDevice = useCallback(
    async (device: BluetoothDevice): Promise<string> => {
      const server = await new Promise<BluetoothRemoteGATTServer>(
        (resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(
              new Error(
                "连接 MCU 超时。\n\n请确认：\n" +
                  "• MCU 设备已上电且在蓝牙范围内\n" +
                  "• Android: 已开启「位置信息」\n" +
                  "• 尝试将手机靠近 MCU 设备（1米内）"
              )
            )
          }, 15000)

          device.gatt!
            .connect()
            .then((s) => {
              clearTimeout(timeout)
              resolve(s)
            })
            .catch((e) => {
              clearTimeout(timeout)
              reject(e)
            })
        }
      )

      if (!server) throw new Error("无法连接设备 GATT 服务")
      const sn = await readSNFromServer(server, device)
      return finalizeConnection(device, sn)
    },
    [finalizeConnection]
  )

  const connect = useCallback(async () => {
    if (!navigator.bluetooth) {
      const hint = getPlatformHint()
      const instructions: Record<string, string> = {
        android: "请使用 Chrome 浏览器，并确保已开启「位置信息」",
        ios: "Safari 不支持 Web Bluetooth。\n请使用支持 BLE 的第三方浏览器 (如 Bluefy)，或手动输入设备 SN",
        mac: "请使用 Chrome 或 Edge 浏览器",
        windows: "请使用 Chrome 或 Edge 浏览器",
        linux: "请使用 Chrome 浏览器，确保已安装 bluez 蓝牙协议栈",
        other: "请使用 Chrome 或 Edge 浏览器",
      }
      throw new Error(
        "此浏览器不支持蓝牙。\n" + (instructions[hint] || instructions.other)
      )
    }

    try {
      const available = await navigator.bluetooth.getAvailability()
      if (!available) {
        throw new Error(
          "蓝牙不可用。\n\n可能的原因：\n" +
            "• 设备没有蓝牙硬件\n" +
            "• 蓝牙未开启\n" +
            "• 系统蓝牙服务未运行\n\n" +
            "Android 用户请确认：\n" +
            "• 已开启「位置信息」(设置 → 位置)\n" +
            "• 已开启「蓝牙」(设置 → 蓝牙)"
        )
      }
    } catch {
      // getAvailability may throw on some platforms; fall through
    }

    let device: BluetoothDevice

    // 直接显示所有 BLE 设备，不用 filter
    // filter 会匹配耳机/手表等广播标准服务 (0x180a, 0x180f) 的设备，
    // 导致扫描"成功"但 MCU 不在列表中，永远无法发现
    try {
      device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: KNOWN_SERVICES,
      })
      return connectDevice(device)
    } catch (err: unknown) {
      if (err instanceof Error) {
        const msg = err.message || ""
        if (msg.includes("User cancelled") || msg.includes("cancelled")) {
          throw new Error("用户取消了蓝牙配对")
        }
        if (msg.includes("Bluetooth") && msg.includes("adapter")) {
          throw new Error(
            "蓝牙适配器不可用。\n请检查设备蓝牙是否已开启"
          )
        }
      }
      throw new Error(
        "未发现蓝牙设备。\n\n请确认：\n" +
          "• MCU 设备已上电且在广播范围内\n" +
          "• Android: 已开启「位置信息」\n" +
          "• 设备未被其他手机/电脑连接"
      )
    }
  }, [connectDevice])

  const autoConnect = useCallback(async (): Promise<string | null> => {
    if (!navigator.bluetooth?.getDevices) return null

    try {
      const devices = await navigator.bluetooth.getDevices()
      if (devices.length === 0) return null

      for (const device of devices) {
        try {
          const sn = await connectDevice(device)
          return sn
        } catch {
          // Try next device silently
          continue
        }
      }
    } catch {
      // Silent fail — manual connect still available
    }

    return null
  }, [connectDevice])

  return { connect, autoConnect }
}
