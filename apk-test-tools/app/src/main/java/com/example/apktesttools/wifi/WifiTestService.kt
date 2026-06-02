package com.example.apktesttools.wifi

import android.app.PendingIntent
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.util.Log
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
    override val channelName = "WiFi 关机测试"
    override val notificationId = 2001

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var targetPassword: String = ""

    override fun onCreate() {
        super.onCreate()
        PersistenceManager.init(this)
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
                    delaySeconds = intent.getIntExtra(EXTRA_DELAY, 10)
                )

                Log.d(TAG, "ACTION_START: calling startForeground")
                startForeground(
                    notificationId,
                    buildNotification("WiFi 关机测试", "准备开始，即将关机...")
                )

                serviceScope.launch(Dispatchers.IO) {
                    val writeOk = PersistenceManager.writeStatus(status)
                    Log.d(TAG, "IO coroutine: writeStatus returned $writeOk")

                    PersistenceManager.deleteStopFlag()

                    val lockJob = launch {
                        val lockOk = LockScreenHelper.prepareForTest(this@WifiTestService)
                        Log.d(TAG, "IO coroutine: prepareForTest returned $lockOk")
                    }
                    try {
                        withTimeout(3000) { lockJob.join() }
                    } catch (_: Exception) {
                        Log.w(TAG, "IO coroutine: lock screen preparation timed out, continuing anyway")
                        lockJob.cancel()
                    }

                    delay(2000)
                    shutdownDevice()
                    Log.e(TAG, "IO coroutine: shutdownDevice returned (should never happen!)")
                }
            }
            ACTION_BOOT_CHECK -> {
                Log.d(TAG, "ACTION_BOOT_CHECK received")
                startForeground(
                    notificationId,
                    buildNotification("WiFi 关机测试", "正在初始化...")
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
            Log.d(TAG, "runCycle: started")
            val status = PersistenceManager.readStatus()
            if (status == null) {
                Log.e(TAG, "runCycle: readStatus returned null, aborting")
                return@launch
            }
            Log.d(TAG, "runCycle: cycle=${status.currentCycle + 1}/${status.maxCycles}, shouldContinue=${status.shouldContinue}")
            if (!status.shouldContinue || PersistenceManager.isStopFlagged()) {
                Log.d(TAG, "runCycle: shouldContinue=false or stop flagged, stopping test")
                stopTest()
                return@launch
            }

            val delaySeconds = status.delaySeconds
            for (s in delaySeconds downTo 1) {
                withContext(Dispatchers.Main) {
                    val notification = buildNotification(
                        "WiFi 关机测试 · 第 ${status.currentCycle + 1}/${status.maxCycles} 次",
                        "等待系统初始化... ${s}秒"
                    )
                    (getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager)
                        .notify(notificationId, notification)
                }
                delay(1000)
            }

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
                val title = "WiFi 关机测试 · 第 ${newCycle}/${status.maxCycles} 次"
                val content = if (result.success) "通过" else "失败: ${result.detail}"
                val notification = buildNotification(title, content)
                (getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager)
                    .notify(notificationId, notification)
            }

            when {
                newCycle >= status.maxCycles -> {
                    PersistenceManager.writeStatus(updatedStatus.copy(shouldContinue = false))
                    finishTest(true)
                }
                PersistenceManager.isStopFlagged() -> {
                    PersistenceManager.writeStatus(updatedStatus.copy(shouldContinue = false))
                    finishTest(false)
                }
                consecutiveFails >= status.maxConsecutiveFailures -> {
                    PersistenceManager.writeStatus(updatedStatus.copy(shouldContinue = false))
                    finishTest(false, "连续失败 ${consecutiveFails} 次，疑似 WiFi 硬件故障")
                }
                else -> {
                    scheduleNextBootCheck()
                    // 显示关机倒计时通知
                    withContext(Dispatchers.Main) {
                        val notification = buildNotification(
                            "WiFi 关机测试 · 第 ${newCycle}/${status.maxCycles} 次",
                            "3秒后关机..."
                        )
                        (getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager)
                            .notify(notificationId, notification)
                    }
                    delay(3000)
                    shutdownDevice()
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

    /** 设置 RTC 闹钟后关机，设备将在约 10 秒后自动开机 */
    private fun shutdownDevice() {
        try {
            // Step 1: 设置 RTC 唤醒闹钟（10 秒后）
            // 注意：必须用 String[] 传参，Runtime.exec(String) 会错误分词带引号的命令
            Log.d(TAG, "shutdownDevice: setting RTC wakealarm")
            val rtcProcess = Runtime.getRuntime().exec(arrayOf(
                "sh", "-c",
                "echo 0 > /sys/class/rtc/rtc0/wakealarm && echo +10 > /sys/class/rtc/rtc0/wakealarm"
            ))
            val rtcExit = rtcProcess.waitFor()
            Log.d(TAG, "shutdownDevice: RTC wakealarm exitCode=$rtcExit")

            Thread.sleep(500)

            // Step 2: 关机
            // 优先用 setprop sys.powerctl（init 原生机制，绕过 SELinux system_app 限制）
            // reboot -p 在 system_app 域下会正常返回但不执行关机
            Log.d(TAG, "shutdownDevice: trying setprop sys.powerctl shutdown")
            try {
                val sdProcess = Runtime.getRuntime().exec(
                    arrayOf("setprop", "sys.powerctl", "shutdown")
                )
                val sdExit = sdProcess.waitFor()
                Log.d(TAG, "shutdownDevice: setprop exitCode=$sdExit")
            } catch (e: Exception) {
                Log.w(TAG, "shutdownDevice: setprop failed, fallback to reboot -p: ${e.message}")
                // 降级：尝试 reboot -p（某些旧设备可能不支持 setprop 方式）
                val fbProcess = Runtime.getRuntime().exec(
                    arrayOf("/system/bin/reboot", "-p")
                )
                fbProcess.waitFor()
            }

            // 如果走到这里说明关机失败，500ms 后不会执行到（因为设备已关机）
            Thread.sleep(500)
            Log.e(TAG, "shutdownDevice: all shutdown methods returned (unexpected)")
        } catch (e: Exception) {
            Log.e(TAG, "shutdownDevice: ${e.javaClass.simpleName}: ${e.message}", e)
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
        // ★ 兜底保障：不管测试过程中什么原因导致 WiFi 关闭，结束时强制打开
        try {
            SystemCommandExecutor("svc wifi enable").execute()
            Thread.sleep(2000)
        } catch (_: Exception) {}

        serviceScope.launch {
            val records = PersistenceManager.readAllRecords()
            val reportHtml = generateWifiReport(records, normalCompletion, extraInfo)
            val reportPath = "${BASE_DIR}/test_report.html"
            try {
                java.io.File(reportPath).writeText(reportHtml)
            } catch (_: Exception) {}
            // 保存结构化 JSON 数据供原生 UI 渲染
            try {
                java.io.File("${BASE_DIR}/report_data.json").writeText(
                    buildReportData(records, normalCompletion, extraInfo, reportPath)
                )
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

    // ─── HTML 报告生成（WebView 渲染，完整 CSS） ───

    private fun generateWifiReport(
        records: List<WifiTestRecord>,
        normalCompletion: Boolean,
        extraInfo: String
    ): String {
        val total = records.size
        val passed = records.count { it.success }
        val failed = records.count { !it.success }
        val rate = if (total > 0) (passed * 100.0 / total) else 0.0

        val sdkVersion = SystemCommandExecutor("getprop ro.build.version.sdk").execute().stdout
        val selinuxMode = com.example.apktesttools.shared.SelinuxHelper.getMode()
        val deviceInfo = listOf(
            SystemCommandExecutor("getprop ro.product.brand").execute().stdout,
            SystemCommandExecutor("getprop ro.product.model").execute().stdout,
            "API $sdkVersion",
            "SELinux: $selinuxMode"
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

        val rateStr = "%.1f".format(rate)
        val completionText = if (normalCompletion) "正常完成" else "异常停止"

        // 计算信号区间对应的颜色和柱状图宽度百分比
        val barColors = mapOf(
            "-40~-49" to "#4caf50",
            "-50~-59" to "#4caf50",
            "-60~-69" to "#ff9800",
            "-70~-79" to "#ff9800",
            "-80+" to "#f44336"
        )

        val sb = StringBuilder()

        // ── 汇总卡片 ──
        sb.append("""
        <div class="card">
          <h2>📊 测试汇总</h2>
          <div class="summary-grid">
            <div class="summary-item s-blue">
              <span class="num">$total</span>
              <span class="label">循环次数</span>
            </div>
            <div class="summary-item s-green">
              <span class="num">$passed</span>
              <span class="label">成功</span>
            </div>
            <div class="summary-item s-red">
              <span class="num">$failed</span>
              <span class="label">失败</span>
            </div>
            <div class="summary-item s-orange">
              <span class="num">$rateStr%</span>
              <span class="label">成功率</span>
            </div>
          </div>
          <div style="font-size:12px;color:#888;">
            状态：$completionText &nbsp;|&nbsp; $extraInfo
          </div>
        </div>
        """.trimIndent())

        // ── 信号分布 ──
        sb.append("""
        <div class="card">
          <h2>📶 WiFi 信号分布</h2>
          <div class="bar-chart">
        """.trimIndent())
        for ((range, count) in signalRanges) {
            val pct = (count * 100) / maxCount
            val color = barColors[range] ?: "#999"
            sb.append("""
            <div class="bar-row">
              <div class="bar-label">$range</div>
              <div class="bar-fill" style="width:${pct}%;background:$color;"></div>
              <div class="bar-count">$count</div>
            </div>
            """.trimIndent())
        }
        sb.append("</div></div>")

        // ── 失败详情 ──
        val failures = records.filter { !it.success }
        if (failures.isNotEmpty()) {
            sb.append("""
            <div class="card">
              <h2>❌ 失败详情 <span style="font-size:12px;color:#888;">（最近 20 条）</span></h2>
              <table class="result-table">
                <tr>
                  <th>#</th>
                  <th>时间</th>
                  <th>扫描</th>
                  <th>网络数</th>
                  <th>连接</th>
                  <th>信号</th>
                  <th>详情</th>
                </tr>
            """.trimIndent())
            for (r in failures.takeLast(20)) {
                val scanBadge = if (r.scanOk) "<span class=\"badge badge-pass\">OK</span>" else "<span class=\"badge badge-fail\">FAIL</span>"
                val connBadge = if (r.connectOk) "<span class=\"badge badge-pass\">OK</span>" else "<span class=\"badge badge-fail\">FAIL</span>"
                val sigStr = if (r.signalDbm != 0) "${r.signalDbm} dBm" else "—"
                sb.append("""
                <tr>
                  <td>${r.cycle}</td>
                  <td>${r.time}</td>
                  <td>$scanBadge</td>
                  <td>${r.ssidCount}</td>
                  <td>$connBadge</td>
                  <td>$sigStr</td>
                  <td style="font-size:11px;color:#888;">${r.detail}</td>
                </tr>
                """.trimIndent())
            }
            sb.append("</table></div>")
        }

        return com.example.apktesttools.shared.HtmlReportGenerator.template(
            title = "WiFi 关机循环测试报告",
            deviceInfo = deviceInfo,
            content = sb.toString()
        )
    }

    /** 构建结构化报告数据，供原生 UI 渲染 */
    private fun buildReportData(
        records: List<WifiTestRecord>,
        normalCompletion: Boolean,
        extraInfo: String,
        htmlPath: String
    ): String {
        val total = records.size
        val passed = records.count { it.success }
        val failed = records.count { !it.success }
        val rate = if (total > 0) (passed * 100.0 / total) else 0.0
        val completionText = if (normalCompletion) "正常完成" else "异常停止"

        val sdkVersion = SystemCommandExecutor("getprop ro.build.version.sdk").execute().stdout
        val selinuxMode = com.example.apktesttools.shared.SelinuxHelper.getMode()
        val deviceInfo = listOf(
            SystemCommandExecutor("getprop ro.product.brand").execute().stdout,
            SystemCommandExecutor("getprop ro.product.model").execute().stdout,
            "API $sdkVersion",
            "SELinux: $selinuxMode"
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
        val barColors = mapOf(
            "-40~-49" to "#4caf50", "-50~-59" to "#4caf50",
            "-60~-69" to "#ff9800", "-70~-79" to "#ff9800",
            "-80+" to "#f44336"
        )

        val sections = mutableListOf<com.example.apktesttools.shared.ReportData.Section>()

        // 汇总卡片
        sections.add(com.example.apktesttools.shared.ReportData.Section(
            header = "📊 测试汇总",
            type = com.example.apktesttools.shared.ReportData.SectionType.CARDS,
            cards = listOf(
                com.example.apktesttools.shared.ReportData.SummaryCard("循环次数", total.toString(), com.example.apktesttools.shared.ReportData.CardColor.BLUE),
                com.example.apktesttools.shared.ReportData.SummaryCard("成功", passed.toString(), com.example.apktesttools.shared.ReportData.CardColor.GREEN),
                com.example.apktesttools.shared.ReportData.SummaryCard("失败", failed.toString(), com.example.apktesttools.shared.ReportData.CardColor.RED),
                com.example.apktesttools.shared.ReportData.SummaryCard("成功率", "%.1f%%".format(rate), com.example.apktesttools.shared.ReportData.CardColor.ORANGE)
            ),
            info = "状态：$completionText  |  $extraInfo"
        ))

        // 信号分布柱状图
        val maxCount = signalRanges.values.maxOrNull()?.coerceAtLeast(1) ?: 1
        val bars = signalRanges.map { (range, count) ->
            com.example.apktesttools.shared.ReportData.BarItem(
                label = "$range dBm", value = count, maxValue = maxCount,
                color = barColors[range] ?: "#999"
            )
        }
        sections.add(com.example.apktesttools.shared.ReportData.Section(
            header = "📶 WiFi 信号分布",
            type = com.example.apktesttools.shared.ReportData.SectionType.BARS,
            bars = bars
        ))

        // 失败详情表格
        val failures = records.filter { !it.success }
        if (failures.isNotEmpty()) {
            val failRows = mutableListOf<com.example.apktesttools.shared.ReportData.Row>()
            failRows.add(com.example.apktesttools.shared.ReportData.Row(
                cells = listOf("#", "时间", "扫描", "网络数", "连接", "信号", "详情").map {
                    com.example.apktesttools.shared.ReportData.Cell(it, isHeader = true)
                }
            ))
            for (r in failures.takeLast(20)) {
                val scanBadge = if (r.scanOk) "pass" else "fail"
                val connBadge = if (r.connectOk) "pass" else "fail"
                val sigStr = if (r.signalDbm != 0) "${r.signalDbm} dBm" else "—"
                failRows.add(com.example.apktesttools.shared.ReportData.Row(
                    cells = listOf(
                        com.example.apktesttools.shared.ReportData.Cell("#${r.cycle}"),
                        com.example.apktesttools.shared.ReportData.Cell(r.time),
                        com.example.apktesttools.shared.ReportData.Cell(if (r.scanOk) "OK" else "FAIL", badge = scanBadge),
                        com.example.apktesttools.shared.ReportData.Cell(r.ssidCount.toString()),
                        com.example.apktesttools.shared.ReportData.Cell(if (r.connectOk) "OK" else "FAIL", badge = connBadge),
                        com.example.apktesttools.shared.ReportData.Cell(sigStr),
                        com.example.apktesttools.shared.ReportData.Cell(r.detail, color = "#888888")
                    )
                ))
            }
            sections.add(com.example.apktesttools.shared.ReportData.Section(
                header = "❌ 失败详情（最近 20 条）",
                type = com.example.apktesttools.shared.ReportData.SectionType.TABLE,
                rows = failRows
            ))
        }

        return com.example.apktesttools.shared.ReportData(
            title = "WiFi 关机循环测试报告",
            deviceInfo = deviceInfo,
            htmlPath = htmlPath,
            sections = sections
        ).toJson()
    }

    private fun stopTest() {
        serviceScope.launch(Dispatchers.IO) {
            val status = PersistenceManager.readStatus()
            if (status != null) {
                PersistenceManager.writeStatus(status.copy(shouldContinue = false))
            }
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
        private const val TAG = "WifiTestService"
        const val ACTION_START = "com.example.apktesttools.action.WIFI_START"
        const val ACTION_BOOT_CHECK = "com.example.apktesttools.action.WIFI_BOOT_CHECK"
        const val ACTION_STOP = "com.example.apktesttools.action.WIFI_STOP"
        const val EXTRA_MAX_CYCLES = "maxCycles"
        const val EXTRA_MAX_FAILURES = "maxFailures"
        const val EXTRA_SSID = "ssid"
        const val EXTRA_PASSWORD = "password"
        const val EXTRA_DELAY = "delay"
        const val BASE_DIR = "/data/user/0/com.example.apktesttools/files/WiFiTest"
    }
}
