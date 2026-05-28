package com.example.apktesttools.monkey

import com.example.apktesttools.shared.SystemCommandExecutor

object LogcatCollector {

    fun capture(reportDir: String, packageName: String): String {
        val logPath = "$reportDir/logcat_${packageName}.txt"
        // 抓缓冲区内最近 5000 行 Error 级别日志
        val result = SystemCommandExecutor("logcat -v threadtime -d *:E -t 5000").execute()
        if (result.stdout.isNotEmpty()) {
            try {
                java.io.File(logPath).writeText(result.stdout)
            } catch (_: Exception) {}
        }
        return logPath
    }
}
