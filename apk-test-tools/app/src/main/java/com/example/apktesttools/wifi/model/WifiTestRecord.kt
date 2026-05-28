package com.example.apktesttools.wifi.model

data class WifiTestRecord(
    val cycle: Int = 0,
    val time: String = "",
    val scanOk: Boolean = false,
    val ssidCount: Int = 0,
    val connectOk: Boolean = false,
    val signalDbm: Int = 0,
    val success: Boolean = false,
    val detail: String = ""
) {
    fun toCsvLine(): String {
        return "$cycle,$time,$scanOk,$ssidCount,$connectOk,$signalDbm,$success,$detail"
    }

    companion object {
        fun fromCsvLine(line: String): WifiTestRecord {
            val parts = line.split(",", limit = 8)
            return WifiTestRecord(
                cycle = parts.getOrNull(0)?.toIntOrNull() ?: 0,
                time = parts.getOrNull(1) ?: "",
                scanOk = parts.getOrNull(2)?.toBoolean() ?: false,
                ssidCount = parts.getOrNull(3)?.toIntOrNull() ?: 0,
                connectOk = parts.getOrNull(4)?.toBoolean() ?: false,
                signalDbm = parts.getOrNull(5)?.toIntOrNull() ?: 0,
                success = parts.getOrNull(6)?.toBoolean() ?: false,
                detail = parts.getOrNull(7) ?: ""
            )
        }

        fun csvHeader(): String = "cycle,time,scanOk,ssidCount,connectOk,signalDbm,success,detail"
    }
}
