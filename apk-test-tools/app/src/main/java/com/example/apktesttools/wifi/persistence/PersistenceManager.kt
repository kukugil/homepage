package com.example.apktesttools.wifi.persistence

import com.example.apktesttools.wifi.model.WifiTestRecord
import com.example.apktesttools.wifi.model.WifiTestStatus
import org.json.JSONObject
import java.io.*

object PersistenceManager {

    private const val BASE_DIR = "/sdcard/APKTestTools/WiFiTest"
    private const val STATUS_FILE = "$BASE_DIR/status.json"
    private const val RESULTS_FILE = "$BASE_DIR/results.csv"
    private const val STOP_FLAG = "$BASE_DIR/stop.flag"

    fun initDir() {
        File(BASE_DIR).mkdirs()
    }

    fun readStatus(): WifiTestStatus? {
        val file = File(STATUS_FILE)
        if (!file.exists()) return null
        return try {
            val json = JSONObject(file.readText())
            WifiTestStatus(
                shouldContinue = json.optBoolean("shouldContinue", true),
                currentCycle = json.optInt("currentCycle", 0),
                maxCycles = json.optInt("maxCycles", 500),
                maxConsecutiveFailures = json.optInt("maxConsecutiveFailures", 3),
                startTime = json.optString("startTime", ""),
                targetSsid = json.optString("targetSsid", ""),
                delaySeconds = json.optInt("delaySeconds", 45)
            )
        } catch (e: Exception) {
            null
        }
    }

    fun writeStatus(status: WifiTestStatus) {
        safeWrite(STATUS_FILE, JSONObject().apply {
            put("shouldContinue", status.shouldContinue)
            put("currentCycle", status.currentCycle)
            put("maxCycles", status.maxCycles)
            put("maxConsecutiveFailures", status.maxConsecutiveFailures)
            put("startTime", status.startTime)
            put("targetSsid", status.targetSsid)
            put("delaySeconds", status.delaySeconds)
        }.toString(2))
    }

    fun appendRecord(record: WifiTestRecord) {
        val file = File(RESULTS_FILE)
        val isNew = !file.exists()
        val content = (if (isNew) WifiTestRecord.csvHeader() + "\n" else "") + record.toCsvLine() + "\n"
        try {
            val fos = FileOutputStream(file, true)
            fos.write(content.toByteArray())
            fos.fd.sync()
            fos.close()
        } catch (_: Exception) {}
    }

    fun readAllRecords(): List<WifiTestRecord> {
        val file = File(RESULTS_FILE)
        if (!file.exists()) return emptyList()
        return try {
            file.readLines().drop(1).map { WifiTestRecord.fromCsvLine(it) }
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun createStopFlag() {
        try { File(STOP_FLAG).createNewFile() } catch (_: Exception) {}
    }

    fun deleteStopFlag() {
        try { File(STOP_FLAG).delete() } catch (_: Exception) {}
    }

    fun isStopFlagged(): Boolean = File(STOP_FLAG).exists()

    fun resetAll() {
        try { File(STATUS_FILE).delete() } catch (_: Exception) {}
        try { File(RESULTS_FILE).delete() } catch (_: Exception) {}
        deleteStopFlag()
    }

    private fun safeWrite(filePath: String, content: String) {
        val tmpPath = "$filePath.tmp"
        try {
            val tmpFile = File(tmpPath)
            tmpFile.writeText(content)

            val fos = FileOutputStream(tmpFile)
            fos.fd.sync()
            fos.close()

            tmpFile.renameTo(File(filePath))

            File(filePath).parentFile?.let {
                val pfos = FileOutputStream(it)
                pfos.fd.sync()
                pfos.close()
            }
        } catch (_: Exception) {}
    }
}
