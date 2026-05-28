package com.example.apktesttools.shared

import android.graphics.Bitmap
import android.graphics.Rect
import android.os.Build
import java.io.File
import java.io.FileOutputStream

/**
 * 截图工具 —— v3.0 双路径
 *
 * 路径A: SurfaceControl.screenshot() (Android 9+) — 纯 Java，system UID 下可用
 * 路径B: screencap 系统二进制 — 全版本兼容，system UID 可直接执行
 */
object ScreenshotHelper {

    /**
     * 路径A：SurfaceControl.screenshot() 反射调用 (Android 9+)
     * system UID 拥有 CAPTURE_VIDEO_OUTPUT / CAPTURE_SECURE_VIDEO_OUTPUT 权限
     */
    private fun captureViaScreenshot(savePath: String): Boolean {
        if (Build.VERSION.SDK_INT < 28) return false
        return try {
            val surfaceControlClass = Class.forName("android.view.SurfaceControl")
            val displaySize = getDisplaySize()
            val screenshotMethod = surfaceControlClass.getMethod(
                "screenshot",
                Rect::class.java,
                Int::class.javaPrimitiveType,
                Int::class.javaPrimitiveType,
                Int::class.javaPrimitiveType
            )
            val bitmap = screenshotMethod.invoke(
                null, null,
                displaySize.first, displaySize.second,
                0
            ) as? Bitmap ?: return false

            FileOutputStream(savePath).use { out ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
            }
            bitmap.recycle()
            true
        } catch (_: Exception) {
            false
        }
    }

    /**
     * 路径B：screencap 系统二进制降级
     * system UID 可直接执行，全版本兼容
     */
    private fun captureViaScreencap(savePath: String): Boolean {
        val result = SystemCommandExecutor("screencap -p $savePath").execute()
        return result.exitCode == 0 && File(savePath).exists()
    }

    /**
     * 组合调用：优先 SurfaceControl.screenshot，失败则降级 screencap
     */
    fun capture(savePath: String): Boolean {
        File(savePath).parentFile?.mkdirs()
        return captureViaScreenshot(savePath) || captureViaScreencap(savePath)
    }

    private fun getDisplaySize(): Pair<Int, Int> {
        return try {
            val wmOutput = SystemCommandExecutor("wm size").execute().stdout
            val match = Regex("(\\d+)x(\\d+)").find(wmOutput)
            if (match != null) {
                Pair(match.groupValues[1].toInt(), match.groupValues[2].toInt())
            } else {
                Pair(1080, 1920)
            }
        } catch (_: Exception) {
            Pair(1080, 1920)
        }
    }
}
