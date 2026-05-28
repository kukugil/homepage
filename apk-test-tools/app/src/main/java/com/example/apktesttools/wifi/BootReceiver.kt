package com.example.apktesttools.wifi

import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import com.example.apktesttools.wifi.persistence.PersistenceManager

class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

        // 检查是否应该继续测试
        val status = PersistenceManager.readStatus() ?: return
        if (!status.shouldContinue || isStopFlagged()) return

        // 立即启动 WifiTestService
        val serviceIntent = Intent(context, WifiTestService::class.java).apply {
            action = WifiTestService.ACTION_BOOT_CHECK
        }
        context.startForegroundService(serviceIntent)

        // 同时设置 JobScheduler 兜底（60秒后延迟检查）
        scheduleBackupJob(context)
    }

    private fun scheduleBackupJob(context: Context) {
        val jobScheduler = context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as? JobScheduler ?: return
        val componentName = ComponentName(context, BootCheckJobService::class.java)
        val jobInfo = JobInfo.Builder(JOB_ID, componentName)
            .setMinimumLatency(60_000)
            .setOverrideDeadline(90_000)
            .setPersisted(true)
            .build()
        jobScheduler.schedule(jobInfo)
    }

    private fun isStopFlagged(): Boolean = PersistenceManager.isStopFlagged()

    companion object {
        const val JOB_ID = 9999
    }
}
