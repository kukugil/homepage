package com.example.apktesttools.wifi

import android.content.Context
import android.net.wifi.WifiConfiguration
import android.net.wifi.WifiManager
import android.os.Build
import com.example.apktesttools.shared.SystemCommandExecutor

data class WifiCheckResult(
    val success: Boolean = false,
    val ssidCount: Int = 0,
    val signalDbm: Int = 0,
    val connectOk: Boolean = false,
    val detail: String = ""
)

object WifiChecker {

    /**
     * v3.0 统一使用 WifiManager Framework API
     * system UID 绕过所有第三方调用限制，无需位置权限
     */
    fun check(context: Context, targetSsid: String, targetPassword: String): WifiCheckResult {
        val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager

        // ① 打开 WiFi
        //    system UID 可调用 setWifiEnabled()，不受 Android 10+ 第三方限制
        if (!wifiManager.isWifiEnabled) {
            wifiManager.setWifiEnabled(true)
            Thread.sleep(5000)
            if (!wifiManager.isWifiEnabled) {
                // 降级：用 svc 命令（system UID 可直接执行）
                val svcResult = SystemCommandExecutor("svc wifi enable").execute()
                if (svcResult.exitCode != 0) {
                    return WifiCheckResult(success = false, detail = "无法打开 WiFi")
                }
                Thread.sleep(3000)
            }
        }

        // ② 扫描
        val scanOk = wifiManager.startScan()
        Thread.sleep(10000)
        val results = wifiManager.scanResults
        if (results.isNullOrEmpty()) {
            // 降级：cmd wifi list-scan-results（system UID 可直接执行）
            val scanOutput = SystemCommandExecutor("cmd wifi list-scan-results").execute().stdout
            if (scanOutput.isBlank()) {
                return WifiCheckResult(success = false, detail = "WiFi 扫描结果为空")
            }
            val networks = parseScanResults(scanOutput)
            if (networks.isEmpty()) {
                return WifiCheckResult(success = false, detail = "WiFi 列表为空")
            }
            val detail = "扫描到 ${networks.size} 个网络 (cmd wifi 降级)"

            if (targetSsid.isBlank()) {
                return WifiCheckResult(success = true, ssidCount = networks.size, detail = detail)
            }
            // 降级路径的连接也走 shell 命令
            return connectViaCmd(wifiManager, targetSsid, targetPassword, networks.size, detail)
        }

        val ssidSet = results.map { it.SSID }.filter { it.isNotEmpty() }.toSet()
        val detail = "扫描到 ${ssidSet.size} 个网络"

        if (targetSsid.isBlank()) {
            return WifiCheckResult(success = true, ssidCount = ssidSet.size, detail = detail)
        }

        // ③ 连接目标 WiFi（通过 WifiManager API）
        return connectViaApi(wifiManager, targetSsid, targetPassword, ssidSet.size, detail)
    }

    /**
     * 主路径：WifiManager API 连接
     * addNetwork + enableNetwork 均为 system UID 可调用的 API
     */
    private fun connectViaApi(
        wifiManager: WifiManager,
        ssid: String,
        password: String,
        ssidCount: Int,
        baseDetail: String
    ): WifiCheckResult {
        var networkId = -1
        try {
            val config = WifiConfiguration().apply {
                SSID = "\"$ssid\""
                preSharedKey = "\"$password\""
                allowedKeyManagement.set(WifiConfiguration.KeyMgmt.WPA2_PSK)
                // 同时支持 WPA3
                if (Build.VERSION.SDK_INT >= 29) {
                    allowedKeyManagement.set(WifiConfiguration.KeyMgmt.SUITE_B_192)
                }
            }

            // addNetwork → enableNetwork → reconnect
            networkId = wifiManager.addNetwork(config)
            if (networkId == -1) {
                // 降级到 shell 命令
                return connectViaCmd(wifiManager, ssid, password, ssidCount, baseDetail)
            }

            wifiManager.disconnect()
            wifiManager.enableNetwork(networkId, true)
            wifiManager.reconnect()
            Thread.sleep(10000)

            // 验证
            val wifiInfo = wifiManager.connectionInfo
            val connectedSsid = wifiInfo?.ssid?.replace("\"", "") ?: ""
            val connected = connectedSsid.contains(ssid)
            val rssi = wifiInfo?.rssi ?: 0

            // 清理
            cleanupNetwork(wifiManager, networkId)

            return WifiCheckResult(
                success = connected,
                ssidCount = ssidCount,
                signalDbm = rssi,
                connectOk = connected,
                detail = if (connected) "$baseDetail, 连接成功" else "$baseDetail, 连接失败 (SSID: $connectedSsid)"
            )
        } catch (e: Exception) {
            // API 失败 → 降级 shell
            if (networkId >= 0) cleanupNetwork(wifiManager, networkId)
            return connectViaCmd(wifiManager, ssid, password, ssidCount, "$baseDetail (API 异常降级)")
        }
    }

    /**
     * 降级路径：cmd wifi 命令连接（system UID 可直接执行）
     */
    private fun connectViaCmd(
        wifiManager: WifiManager,
        ssid: String,
        password: String,
        ssidCount: Int,
        baseDetail: String
    ): WifiCheckResult {
        val connectResult = SystemCommandExecutor(
            "cmd wifi connect-network $ssid wpa2 $password"
        ).execute()
        Thread.sleep(10000)

        val wifiInfo = wifiManager.connectionInfo
        val connectedSsid = wifiInfo?.ssid?.replace("\"", "") ?: ""
        val connected = connectedSsid.contains(ssid)
        val rssi = wifiInfo?.rssi ?: 0

        // 断开
        SystemCommandExecutor("cmd wifi disconnect").execute()

        return WifiCheckResult(
            success = connected,
            ssidCount = ssidCount,
            signalDbm = rssi,
            connectOk = connected,
            detail = if (connected) "$baseDetail, 连接成功" else "$baseDetail, 连接失败"
        )
    }

    private fun cleanupNetwork(wifiManager: WifiManager, networkId: Int) {
        try {
            wifiManager.disableNetwork(networkId)
            // removeNetwork 是隐藏 API，通过反射调用
            val removeMethod = wifiManager.javaClass.getMethod(
                "removeNetwork", Int::class.javaPrimitiveType
            )
            removeMethod.invoke(wifiManager, networkId)
            // saveConfiguration 也是隐藏 API
            val saveMethod = wifiManager.javaClass.getMethod("saveConfiguration")
            saveMethod.invoke(wifiManager)
        } catch (_: Exception) {}
    }

    private fun parseScanResults(output: String): Set<String> {
        val ssids = mutableSetOf<String>()
        for (line in output.lines()) {
            val trimmed = line.trim()
            if (trimmed.isNotEmpty()) {
                val parts = trimmed.split(Regex("\\s+"))
                if (parts.isNotEmpty() && parts[0].isNotEmpty()) {
                    if (!parts[0].matches(Regex("[0-9a-fA-F:]+"))) {
                        ssids.add(parts[0])
                    }
                }
            }
        }
        return ssids
    }
}
