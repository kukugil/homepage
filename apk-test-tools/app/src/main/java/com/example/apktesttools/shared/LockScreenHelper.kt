package com.example.apktesttools.shared

import android.content.Context
import android.os.Build
import android.os.Process

/**
 * 锁屏管理 —— v3.0 新增
 *
 * 通过 system UID 的 signature 级权限操作锁屏，不依赖 shell 命令。
 * 需要权限: SET_LOCK_SCREEN_DISABLED, WRITE_SECURE_SETTINGS（均为 signature 级）
 */
object LockScreenHelper {

    /**
     * 清除锁屏凭据（密码/PIN/图案）
     * 通过反射调用 com.android.internal.widget.LockPatternUtils.clearLock()
     */
    fun clearLock(context: Context): Boolean {
        return try {
            val lockPatternUtilsClass = Class.forName(
                "com.android.internal.widget.LockPatternUtils"
            )
            val lpu = lockPatternUtilsClass.getConstructor(Context::class.java)
                .newInstance(context)

            val userId = Process.myUserId()
            val clearMethod = lockPatternUtilsClass.getMethod(
                "clearLock", ByteArray::class.java, Int::class.javaPrimitiveType
            )
            clearMethod.invoke(lpu, null, userId)
            true
        } catch (e: Exception) {
            // 反射失败时尝试 shell 命令降级（system UID 可直接执行 locksettings）
            tryClearLockFallback()
        }
    }

    /**
     * 禁用锁屏界面
     * 直接写入安全设置，system UID 拥有 WRITE_SECURE_SETTINGS 权限
     */
    fun disableLockScreen(context: Context): Boolean {
        return try {
            android.provider.Settings.Secure.putInt(
                context.contentResolver,
                "lock_screen_disabled", 1
            )
            if (Build.VERSION.SDK_INT >= 26) {
                android.provider.Settings.Secure.putInt(
                    context.contentResolver,
                    "lock_screen_disabled_component", 1
                )
            }
            true
        } catch (e: Exception) {
            false
        }
    }

    /**
     * 启动测试前组合调用，至少一个成功即可
     */
    fun prepareForTest(context: Context): Boolean {
        val lockCleared = clearLock(context)
        val lockDisabled = disableLockScreen(context)
        return lockCleared || lockDisabled
    }

    /**
     * shell 命令降级方案
     * system UID 可以直接执行 locksettings 二进制（不需要 su）
     */
    private fun tryClearLockFallback(): Boolean {
        return try {
            val result = SystemCommandExecutor("locksettings clear --old null").execute()
            if (result.exitCode == 0) return true
            SystemCommandExecutor("locksettings clear").execute().exitCode == 0
        } catch (_: Exception) {
            false
        }
    }
}
