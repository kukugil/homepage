package com.example.apktesttools.monkey

import com.example.apktesttools.monkey.model.CrashInfo
import com.example.apktesttools.monkey.model.TestConfig
import com.example.apktesttools.monkey.model.TestResult
import com.example.apktesttools.shared.SystemCommandExecutor

object MonkeyRunner {

    fun run(config: TestConfig, reportDir: String, screenshotDir: String): TestResult {
        val startTime = System.currentTimeMillis()

        val command = config.toMonkeyCommand()
        val result = SystemCommandExecutor("monkey ${config.toMonkeyCommand()}", config.timeoutSeconds * 1000L).execute()

        val durationMs = System.currentTimeMillis() - startTime

        val crashes = parseCrashes(result.stdout, screenshotDir, config.packageName)
        val eventsInjected = extractInt(result.stdout, "Events injected:")
        val droppedKeys = extractInt(result.stdout, "Dropped: keys=")
        val droppedPointers = extractInt(result.stdout, "pointers=")
        val success = crashes.isEmpty() && !result.timedOut && eventsInjected > 0

        val logcatPath = LogcatCollector.capture(reportDir, config.packageName)

        return TestResult(
            packageName = config.packageName,
            appName = config.appName,
            eventCountTotal = config.eventCount,
            eventsInjected = eventsInjected,
            eventsDroppedKeys = droppedKeys,
            eventsDroppedPointers = droppedPointers,
            durationMs = durationMs,
            success = success,
            crashes = crashes,
            logcatPath = logcatPath,
            seed = config.seed
        )
    }

    private fun parseCrashes(stdout: String, screenshotDir: String, packageName: String): List<CrashInfo> {
        val crashes = mutableListOf<CrashInfo>()
        val lines = stdout.lines()

        var i = 0
        while (i < lines.size) {
            val line = lines[i]
            if (line.contains("// CRASH:") || line.contains("// NOT RESPONDING:")) {
                val isCrash = line.contains("// CRASH:")
                val eventNumber = extractEventNumber(lines, i)
                val stackTrace = extractBlock(lines, i, 30)

                crashes.add(
                    CrashInfo(
                        eventNumber = eventNumber,
                        eventType = if (isCrash) "CRASH" else "ANR",
                        exceptionType = line.substringAfter(":").trim(),
                        stackTrace = stackTrace
                    )
                )
                i += 10
            } else if (line.contains("** Monkey aborted") || line.contains("System appears to have crashed")) {
                crashes.add(
                    CrashInfo(
                        eventNumber = extractEventNumber(lines, i),
                        eventType = "SYSTEM",
                        exceptionType = "Monkey aborted / system crash",
                        stackTrace = extractBlock(lines, i - 5, 20)
                    )
                )
            }
            i++
        }

        return crashes
    }

    private fun extractEventNumber(lines: List<String>, fromIndex: Int): Int {
        for (j in maxOf(0, fromIndex - 3)..minOf(lines.size - 1, fromIndex + 3)) {
            val match = Regex("at event (\\d+)").find(lines[j])
            if (match != null) return match.groupValues[1].toInt()
        }
        return 0
    }

    private fun extractBlock(lines: List<String>, fromIndex: Int, count: Int): String {
        val start = maxOf(0, fromIndex)
        val end = minOf(lines.size - 1, fromIndex + count)
        return lines.subList(start, end).joinToString("\n")
    }

    private fun extractInt(text: String, prefix: String): Int {
        val pattern = when {
            prefix.contains("Dropped") -> Regex("${Regex.escape(prefix)}(\\d+)")
            else -> Regex("${Regex.escape(prefix)}\\s*(\\d+)")
        }
        val match = pattern.find(text)
        return match?.groupValues?.get(1)?.toIntOrNull() ?: 0
    }
}
