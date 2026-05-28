package com.example.apktesttools.shared

import java.io.File

/**
 * SELinux 检测 —— v3.0 简化版
 *
 * v3.0 不再弹窗引导用户切 Permissive。
 * system UID 进程在 Enforcing 下的 sepolicy 权限已经足够，
 * 不需要修改 SELinux 模式。
 */
object SelinuxHelper {

    fun getMode(): String {
        return try {
            val value = File("/sys/fs/selinux/enforce").readText().trim()
            if (value == "1") "Enforcing" else "Permissive"
        } catch (_: Exception) {
            // 回退：直接执行 getenforce 命令（system UID 可以执行）
            try {
                val result = SystemCommandExecutor("getenforce").execute()
                result.stdout.trim()
            } catch (_: Exception) {
                "Unknown"
            }
        }
    }

    fun isEnforcing(): Boolean = getMode() == "Enforcing"

    /**
     * v3.0 仅返回状态文字，不再弹窗要求用户修改
     */
    fun getStatusText(): String {
        return "SELinux: ${getMode()}（system UID，无需切换）"
    }
}
