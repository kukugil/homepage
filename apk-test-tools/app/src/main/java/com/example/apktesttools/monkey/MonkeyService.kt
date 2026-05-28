package com.example.apktesttools.monkey

import android.app.ActivityManager
import android.app.PendingIntent
import android.content.Intent
import com.example.apktesttools.MainActivity
import com.example.apktesttools.R
import com.example.apktesttools.monkey.model.TestConfig
import com.example.apktesttools.shared.ForegroundServiceBase
import com.example.apktesttools.shared.SystemCommandExecutor
import com.example.apktesttools.ui.ReportViewActivity
import kotlinx.coroutines.*
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

class MonkeyService : ForegroundServiceBase() {

    override val channelId = "monkey_test_channel"
    override val channelName = "Monkey 测试"
    override val notificationId = 1001

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val testConfigs = mutableListOf<TestConfig>()

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val configsJson = intent.getStringExtra(EXTRA_CONFIGS) ?: return START_NOT_STICKY
                parseConfigs(configsJson)
                if (testConfigs.isNotEmpty()) {
                    startForeground(
                        notificationId,
                        buildNotification("Monkey 测试", "准备开始测试...")
                    )
                    runTests()
                }
            }
            ACTION_STOP -> {
                stopTest()
            }
        }
        return START_NOT_STICKY
    }

    private fun parseConfigs(json: String) {
        testConfigs.clear()
        val items = json.split("|||")
        for (item in items) {
            val parts = item.split("|")
            if (parts.size >= 9) {
                testConfigs.add(
                    TestConfig(
                        packageName = parts[0],
                        appName = parts[1],
                        eventCount = parts[2].toIntOrNull() ?: 10000,
                        throttleMs = parts[3].toIntOrNull() ?: 200,
                        seed = parts[4].toIntOrNull() ?: ((System.currentTimeMillis() % 100000).toInt()),
                        targetActivity = parts[5],
                        pctTouch = parts[6].toIntOrNull() ?: 70,
                        pctMotion = parts[7].toIntOrNull() ?: 15,
                        pctSyskeys = parts[8].toIntOrNull() ?: 10,
                        pctAnyevent = parts[9].toIntOrNull() ?: 5,
                        timeoutSeconds = parts.getOrNull(10)?.toIntOrNull() ?: 600,
                        ignoreCrashes = parts.getOrNull(11)?.toBoolean() ?: false,
                        ignoreTimeouts = parts.getOrNull(12)?.toBoolean() ?: false
                    )
                )
            }
        }
    }

    private fun runTests() {
        serviceScope.launch {
            val dateStr = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
            val reportBaseDir = "/sdcard/APKTestTools/MonkeyReports"
            val reportDir = "$reportBaseDir/${dateStr}"
            val screenshotDir = "$reportDir/screenshots"
            File(reportDir).mkdirs()
            File(screenshotDir).mkdirs()

            val results = mutableListOf<com.example.apktesttools.monkey.model.TestResult>()

            for ((index, config) in testConfigs.withIndex()) {
                if (!isActive) break

                withContext(Dispatchers.Main) {
                    val notification = buildNotification(
                        "Monkey 测试中 (${index + 1}/${testConfigs.size})",
                        "正在测试: ${config.appName}",
                        index + 1,
                        testConfigs.size
                    )
                    (getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager)
                        .notify(notificationId, notification)
                }

                val result = MonkeyRunner.run(config, reportDir, screenshotDir)
                results.add(result)

                // 有崩溃时自动截图
                for (crash in result.crashes.withIndex()) {
                    com.example.apktesttools.shared.ScreenshotHelper.capture(
                        "$screenshotDir/${config.packageName}_crash_${crash.index}.png"
                    )
                }

                // ★ v3.0：用 ActivityManager.forceStopPackage 替代 am force-stop
                // FORCE_STOP_PACKAGES 是 signature 级权限，system UID 持有
                val am = getSystemService(ACTIVITY_SERVICE) as ActivityManager
                try {
                    am.forceStopPackage(config.packageName)
                } catch (_: Exception) {}
            }

            // 生成 HTML 报告
            val reportHtml = generateReport(results)
            val reportPath = "$reportDir/report.html"
            try {
                java.io.File(reportPath).writeText(reportHtml)
            } catch (_: Exception) {}

            // 通知完成
            withContext(Dispatchers.Main) {
                val viewIntent = Intent(this@MonkeyService, ReportViewActivity::class.java).apply {
                    putExtra("report_path", reportPath)
                }
                val pendingIntent = PendingIntent.getActivity(
                    this@MonkeyService, 0, viewIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )

                val notification = android.app.Notification.Builder(this@MonkeyService, channelId)
                    .setContentTitle("Monkey 测试完成")
                    .setContentText("点击查看报告")
                    .setSmallIcon(R.drawable.ic_notification)
                    .setContentIntent(pendingIntent)
                    .setAutoCancel(true)
                    .build()

                (getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager)
                    .notify(notificationId + 1, notification)

                stopForeground(android.app.Service.STOP_FOREGROUND_NOT_REMOVE)
                stopSelf()
            }
        }
    }

    private fun stopTest() {
        serviceScope.coroutineContext.cancelChildren()
        stopForeground(android.app.Service.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun generateReport(
        results: List<com.example.apktesttools.monkey.model.TestResult>
    ): String {
        val deviceInfo = buildDeviceInfo()

        val totalApps = results.size
        val passedApps = results.count { it.success }
        val failedApps = results.count { !it.success }
        val totalCrashes = results.sumOf { it.crashes.size }

        val summarySection = """
	<div class="card">
	    <h2>汇总摘要</h2>
	    <div class="summary">
	        <div class="summary-item ${if (failedApps == 0) "summary-success" else "summary-fail"}">
	            <div class="num">$totalApps</div><div class="label">被测应用</div>
	        </div>
	        <div class="summary-item summary-success">
	            <div class="num">$passedApps</div><div class="label">通过</div>
	        </div>
	        <div class="summary-item summary-fail">
	            <div class="num">$failedApps</div><div class="label">失败</div>
	        </div>
	        <div class="summary-item ${if (totalCrashes > 0) "summary-fail" else "summary-success"}">
	            <div class="num">$totalCrashes</div><div class="label">崩溃次数</div>
	        </div>
	    </div>
	</div>

	<div class="card">
	    <h2>结果列表</h2>
	    <table>
	        <tr><th>应用</th><th>包名</th><th>事件数</th><th>耗时</th><th>结果</th><th>崩溃</th></tr>
	        ${results.joinToString("\n") { r ->
                "<tr>" +
                "<td>${r.appName}</td>" +
                "<td style='font-size:12px;color:#666'>${r.packageName}</td>" +
                "<td>${r.eventsInjected}/${r.eventCountTotal}</td>" +
                "<td>${r.durationMs / 1000}秒</td>" +
                "<td class='${if (r.success) "pass" else "fail"}'>${if (r.success) "通过" else "失败"}</td>" +
                "<td>${r.crashes.size}</td>" +
                "</tr>"
            }}
	    </table>
	</div>
        """.trimIndent()

        val crashSection = results.filter { it.crashes.isNotEmpty() }.joinToString("\n") { r ->
            """
	<div class="card">
	    <h2>${r.appName} — 崩溃详情</h2>
	    <p style="color:#666;margin-bottom:8px">Seed: ${r.seed}</p>
	    ${r.crashes.joinToString("\n") { c ->
                """
	<div class="crash-detail">
	    <strong>${c.eventType}</strong> — 第 ${c.eventNumber} 个事件<br>
	    <small>异常: ${c.exceptionType}</small>
	    <pre>${c.stackTrace.take(2000)}</pre>
	</div>
            """.trimIndent()
            }}
	</div>
            """.trimIndent()
        }

        val replaySection = results.joinToString("\n") { r ->
            val cmd = TestConfig(
                packageName = r.packageName,
                appName = r.appName,
                eventCount = r.eventCountTotal,
                seed = r.seed
            ).toMonkeyCommand()
            "<div class='replay-cmd'>adb shell $cmd</div>"
        }

        return com.example.apktesttools.shared.HtmlReportGenerator.template(
            title = "Monkey 测试报告",
            deviceInfo = deviceInfo,
            content = """
	$summarySection
	$crashSection
	<div class="card">
	    <h2>参数回放</h2>
	    $replaySection
	</div>
            """.trimIndent()
        )
    }

    private fun buildDeviceInfo(): String {
        val brand = SystemCommandExecutor("getprop ro.product.brand").execute().stdout
        val model = SystemCommandExecutor("getprop ro.product.model").execute().stdout
        val sdk = SystemCommandExecutor("getprop ro.build.version.sdk").execute().stdout
        return "$brand $model / API $sdk"
    }

    private val isActive: Boolean
        get() = serviceScope.isActive

    override fun onDestroy() {
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?) = null

    companion object {
        const val ACTION_START = "com.example.apktesttools.action.MONKEY_START"
        const val ACTION_STOP = "com.example.apktesttools.action.MONKEY_STOP"
        const val EXTRA_CONFIGS = "configs"
    }
}
