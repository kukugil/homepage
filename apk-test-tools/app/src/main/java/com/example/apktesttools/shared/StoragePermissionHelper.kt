package com.example.apktesttools.shared

/**
 * 存储权限适配 —— v3.0 简化版
 *
 * system UID 进程不受 Android 10+ Scoped Storage 限制，
 * 对 /sdcard/ 等路径有天然读写权限，无需运行时授权。
 */
object StoragePermissionHelper {

    /**
     * v3.0 始终返回 true：system UID 不受存储权限限制
     */
    fun ensureStorageAccess(activity: android.app.Activity): Boolean = true

    const val REQUEST_STORAGE = 100
}
