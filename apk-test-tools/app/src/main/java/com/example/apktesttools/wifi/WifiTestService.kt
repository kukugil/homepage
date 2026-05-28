package com.example.apktesttools.wifi

import android.app.PendingIntent
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import com.example.apktesttools.MainActivity
import com.example.apktesttools.R
import com.example.apktesttools.shared.ForegroundServiceBase
import com.example.apktesttools.shared.LockScreenHelper
import com.example.apktesttools.shared.SystemCommandExecutor
import com.example.apktesttools.ui.ReportViewActivity
import com.example.apktesttools.wifi.model.WifiTestRecord
import com.example.apktesttools.wifi.model.WifiTestStatus
import com.example.apktesttools.wifi.persistence.PersistenceManager
import kotlinx.coroutines.*
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

class WifiTestService : ForegroundServiceBase() {

    override val channelId = "wifi_test_channel"
    override val channelName = "WiFi 重启测试"
    override val notificationId = 2001

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var targetPassword: String = ""

    override fun onCreate() {
        super.onCreate()
        PersistenceManager.initDir()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                targetPassword = intent.getStringExtra(EXTRA_PASSWORD) ?: ""
                val status = WifiTestStatus(
                    shouldContinue = true,
                    currentCycle = 0,
                    maxCycles = intent.getIntExtra(EXTRA_MAX_CYCLES, 500),
                    maxConsecutiveFailures = intent.getIntExtra(EXTRA_MAX_FAILURES, 3),
                    startTime = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(Date()),
                    targetSsid = intent.getStringExtra(EXTRA_SSID) ?: "",
                    delaySeconds = intent.getIntExtra(EXTRA_DELAY, 45)
                )
                PersistenceManager.writeStatus(status)
                PersistenceManager.deleteStopFlag()

                startForeground(
                    notificationId,
                    buildNotification("WiFi 重启测试", "准备开始，即将重启设备...")
                )

                // ★ v3.0：用 LockScreenHelper 清除锁屏，再用 PowerManager 重启
                LockScreenHelper.prepareForTest(this)
                rebootDevice()
            }
            ACTION_BOOT_CHECK -> {
                startForeground(
                    notificationId,
                    buildNotification("WiFi 重启测试", "正在初始化...")
                )
                runCycle()
            }
            ACTION_STOP -> {
                stopTest()
            }
        }
        return START_NOT_STICKY
    }

    private fun runCycle() {
        serviceScope.launch {
            val status = PersistenceManager.readStatus() ?: return@launch
            if (!status.shouldContinue || PersistenceManager.isStopFlagged()) {
                stopTest()
                return@launch
            }

            // 等待系统初始化
            val delaySeconds = status.delaySeconds
            for (s in delaySeconds downTo 1) {
                withContext(Dispatchers.Main) {
                    val notification = buildNotification(
                        "WiFi 重启测试 · 第 ${status.currentCycle + 1}/${status.maxCycles} 次",
                        "等待系统初始化... ${s}秒"
                    )
                    (getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager)
                        .notify(notificationId, notification)
                }
                delay(1000)
            }

            // 执行 WiFi 检查
            val result = WifiChecker.check(this@WifiTestService, status.targetSsid, targetPassword)

            val record = WifiTestRecord(
                cycle = status.currentCycle + 1,
                time = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date()),
                scanOk = result.ssidCount > 0,
                ssidCount = result.ssidCount,
                connectOk = result.connectOk,
                signalDbm = result.signalDbm,
                success = result.success,
                detail = result.detail
            )
            PersistenceManager.appendRecord(record)

            val newCycle = status.currentCycle + 1
            val consecutiveFails = computeConsecutiveFails(newCycle)

            val updatedStatus = status.copy(currentCycle = newCycle)
            PersistenceManager.writeStatus(updatedStatus)

            withContext(Dispatchers.Main) {
                val title = "WiFi 重启测试 · 第 $newCycle/${status.maxCycles} 次"
                val content = if (result.success) "通过" else "失败: ${result.detail}"
                val notification = buildNotification(title, content)
                (getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager)
                    .notify(notificationId, notification)
            }

            // 判断是否继续
            when {
                newCycle >= status.maxCycles -> finishTest(true)
                PersistenceManager.isStopFlagged() -> {
                    PersistenceManager.writeStatus(updatedStatus.copy(shouldContinue = false))
                    finishTest(false)
                }
                consecutiveFails >= status.maxConsecutiveFailures -> {
                    PersistenceManager.writeStatus(updatedStatus.copy(shouldContinue = false))
                    finishTest(false, "连续失败 $consecutiveFails 次，疑似 WiFi 硬件故障")
                }
                else -> {
                    // 预设下次开机的 JobScheduler 兜底
                    scheduleNextBootCheck()
                    delay(5000) // 5秒窗口
                    rebootDevice()
                }
            }
        }
    }

    private fun computeConsecutiveFails(upToCycle: Int): Int {
        val records = PersistenceManager.readAllRecords()
        var count = 0
        for (i in records.indices.reversed()) {
            if (i >= upToCycle) continue
            if (!records[i].success) count++ else break
        }
        return count
    }

    /**
     * ★ v3.0：用 PowerManager.reboot() 替代 su -c reboot
     * 需要 android.permission.REBOOT（signature 级，system UID 持有）
     */
    private fun rebootDevice() {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            // 留 2 秒让通知和状态写入完成
            Thread.sleep(2000)
            pm.reboot(null)
        } catch (e: Exception) {
            // 降级：直接执行 reboot 命令（system UID 可直接执行）
            SystemCommandExecutor("reboot").execute()
        }
    }

    private fun scheduleNextBootCheck() {
        val jobScheduler = getSystemService(JOB_SCHEDULER_SERVICE) as? JobScheduler ?: return
        val componentName = ComponentName(this, BootCheckJobService::class.java)
        val jobInfo = JobInfo.Builder(BootReceiver.JOB_ID, componentName)
            .setMinimumLatency(60_000)
            .setOverrideDeadline(90_000)
            .setPersisted(true)
            .build()
        jobScheduler.schedule(jobInfo)
    }

    private fun finishTest(normalCompletion: Boolean, extraInfo: String = "") {
        serviceScope.launch {
            val records = PersistenceManager.readAllRecords()
            val reportHtml = generateWifiReport(records, normalCompletion, extraInfo)
            val reportPath = "$BASE_DIR/test_report.html"
            try {
                java.io.File(reportPath).writeText(reportHtml)
            } catch (_: Exception) {}

            withContext(Dispatchers.Main) {
                val viewIntent = Intent(this@WifiTestService, ReportViewActivity::class.java).apply {
                    putExtra("report_path", reportPath)
                }
                val pendingIntent = PendingIntent.getActivity(
                    this@WifiTestService, 0, viewIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )

                val title = if (normalCompletion) "WiFi 测试完成" else "WiFi 测试停止"
                val content = if (extraInfo.isNotEmpty()) extraInfo else "点击查看报告"

                val notification = android.app.Notification.Builder(this@WifiTestService, channelId)
                    .setContentTitle(title)
                    .setContentText(content)
                    .setSmallIcon(R.drawable.ic_notification)
                    .setContentIntent(pendingIntent)
                    .setAutoCancel(true)
                    .build()

                (getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager)
                    .notify(notificationId + 1, notification)

                stopForeground(false)
                stopSelf()
            }
        }
    }

    private fun generateWifiReport(
        records: List<WifiTestRecord>,
        normalCompletion: Boolean,
        extraInfo: String
    ): String {
        val total = records.size
        val passed = records.count { it.success }
        val failed = records.count { !it.success }
        val rate = if (total > 0) (passed * 100.0 / total) else 0.0

        val deviceInfo = listOf(
            SystemCommandExecutor("getprop ro.product.brand").execute().stdout,
            SystemCommandExecutor("getprop ro.product.model").execute().stdout,
            "API ${SystemCommandExecutor("getprop ro.build.version.sdk").execute().stdout}",
            "SELinux: ${com.example.apktesttools.shared.SelinuxHelper.getMode()}"
        ).joinToString(" / ")

        val signalRanges = mutableMapOf(
            "-40~-49" to 0, "-50~-59" to 0, "-60~-69" to 0,
            "-70~-79" to 0, "-80+" to 0
        )
        records.filter { it.signalDbm != 0 }.forEach { r ->
            when {
                r.signalDbm >= -49 -> signalRanges["-40~-49"] = signalRanges["-40~-49"]!! + 1
                r.signalDbm >= -59 -> signalRanges["-50~-59"] = signalRanges["-50~-59"]!! + 1
                r.signalDbm >= -69 -> signalRanges["-60~-69"] = signalRanges["-60~-69"]!! + 1
                r.signalDbm >= -79 -> signalRanges["-70~-79"] = signalRanges["-70~-79"]!! + 1
                else -> signalRanges["-80+"] = signalRanges["-80+"]!! + 1
            }
        }
        val maxCount = signalRanges.values.maxOrNull()?.coerceAtLeast(1) ?: 1

        val signalDist = signalRanges.map { (range, count) ->
            val bars = "#".repeat((count * 30) / maxCount)
            "<tr><td>$range dBm</td><td>$bars ($count)</td></tr>"
        }.joinToString("\n")

        val failures = records.filter { !it.success }
        val failureLines = if (failures.isNotEmpty()) {
            failures.takeLast(20).joinToString("\n") { r ->
                "<tr><td>#${r.cycle}</td><td>${r.time}</td>" +
                "<td>${if (r.scanOk) "OK" else "FAIL"}</td>" +
                "<td>${r.ssidCount}</td>" +
                "<td>${if (r.connectOk) "OK" else "FAIL"}</td>" +
                "<td>${r.signalDbm} dBm</td><td>${r.detail}</td></tr>"
            }
        } else {
            "<tr><td colspan='7' style='text-align:center;color:#999'>无失败记录</td></tr>"
        }

        return com.example.apktesttools.shared.HtmlReportGenerator.template(
            title = "WiFi 重启循环测试报告",
            deviceInfo = deviceInfo,
            content = """
	<div class="card">
	    <h2>汇总</h2>
	    <div class="summary">
	        <div class="summary-item ${if (failed == 0) "summary-success" else "summary-fail"}">
	            <div class="num">$total</div><div class="label">总循环次数</div>
	        </div>
	        <div class="summary-item summary-success">
	            <div class="num">$passed</div><div class="label">成功次数</div>
	        </div>
	        <div class="summary-item summary-fail">
	            <div class="num">$failed</div><div class="label">失败次数</div>
	        </div>
	        <div class="summary-item ${if (rate >= 95) "summary-success" else "summary-fail"}">
	            <div class="num">${"%.1f".format(rate)}%</div><div class="label">成功率</div>
	        </div>
	    </div>
	    <p style="margin-top:8px;color:#666">完成状态：${if (normalCompletion) "正常完成" else "异常停止"} $extraInfo</p>
	</div>

	<div class="card">
	    <h2>失败详情（最近 20 条）</h2>
	    <table>
	        <tr><th>循环</th><th>时间</th><th>扫描</th><th>网络数</th><th>连接</th><th>信号</th><th>详情</th></tr>
	        $failureLines
	    </table>
	</div>

	<div class="card">
	    <h2>信号强度分布</h2>
	    <table>
	        <tr><th>范围</th><th>分布</th></tr>
	        $signalDist
	    </table>
	</div>
            """.trimIndent()
        )
    }

    private fun stopTest() {
        val status = PersistenceManager.readStatus()
        if (status != null) {
            PersistenceManager.writeStatus(status.copy(shouldContinue = false))
        }
        serviceScope.coroutineContext.cancelChildren()
        stopForeground(android.app.Service.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?) = null

    companion object {
        const val ACTION_START = "com.example.apktesttools.action.WIFI_START"
        const val ACTION_BOOT_CHECK = "com.example.apktesttools.action.WIFI_BOOT_CHECK"
        const val ACTION_STOP = "com.example.apktesttools.action.WIFI_STOP"
        const val EXTRA_MAX_CYCLES = "maxCycles"
        const val EXTRA_MAX_FAILURES = "maxFailures"
        const val EXTRA_SSID = "ssid"
        const val EXTRA_PASSWORD = "password"
        const val EXTRA_DELAY = "delay"
        const val BASE_DIR = "/sdcard/APKTestTools/WiFiTest"
    }
}
