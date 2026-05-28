package com.example.apktesttools.shared

import android.os.Process
import java.io.BufferedReader
import java.io.InputStreamReader

/**
 * 系统命令执行器 —— v3.0 替代 RootExecutor
 *
 * 核心差异：不加 "su -c" 前缀。APK 以 system UID 运行，
 * 直接 Runtime.exec() 执行系统二进制即可获得 system 级权限。
 */
class SystemCommandExecutor(
    private val command: String,
    private val timeoutMs: Long = 60_000
) {
    data class Result(
        val stdout: String,
        val stderr: String,
        val exitCode: Int,
        val timedOut: Boolean
    )

    fun execute(): Result {
        val process = try {
            Runtime.getRuntime().exec(command)
        } catch (e: Exception) {
            return Result("", e.message ?: "执行命令失败", -1, false)
        }

        val stdout = StringBuilder()
        val stderr = StringBuilder()

        val stdoutThread = Thread {
            try {
                BufferedReader(InputStreamReader(process.inputStream)).use { reader ->
                    var line = reader.readLine()
                    while (line != null) {
                        stdout.appendLine(line)
                        line = reader.readLine()
                    }
                }
            } catch (_: Exception) {}
        }

        val stderrThread = Thread {
            try {
                BufferedReader(InputStreamReader(process.errorStream)).use { reader ->
                    var line = reader.readLine()
                    while (line != null) {
                        stderr.appendLine(line)
                        line = reader.readLine()
                    }
                }
            } catch (_: Exception) {}
        }

        stdoutThread.start()
        stderrThread.start()

        val finished = process.waitFor(timeoutMs, java.util.concurrent.TimeUnit.MILLISECONDS)
        val timedOut = !finished

        if (timedOut) {
            process.destroy()
        }

        stdoutThread.join(1000)
        stderrThread.join(1000)

        return Result(
            stdout = stdout.toString().trim(),
            stderr = stderr.toString().trim(),
            exitCode = if (timedOut) -1 else process.exitValue(),
            timedOut = timedOut
        )
    }

    companion object {
        /**
         * 检查 APK 是否以 system UID (1000) 运行
         * 这替代了 v2 的 isRootAvailable() 检查
         */
        fun isSystemUid(): Boolean {
            return Process.myUid() == Process.SYSTEM_UID // 1000
        }
    }
}
