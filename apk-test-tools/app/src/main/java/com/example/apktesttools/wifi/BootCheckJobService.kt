package com.example.apktesttools.wifi

import android.app.job.JobParameters
import android.app.job.JobService
import android.content.Intent
import com.example.apktesttools.wifi.persistence.PersistenceManager

class BootCheckJobService : JobService() {

    override fun onStartJob(params: JobParameters?): Boolean {
        val status = PersistenceManager.readStatus()
        if (status != null && status.shouldContinue && !PersistenceManager.isStopFlagged()) {
            // 检查 WifiTestService 是否已经在跑。如果没有，启动它
            val serviceIntent = Intent(this, WifiTestService::class.java).apply {
                action = WifiTestService.ACTION_BOOT_CHECK
            }
            startForegroundService(serviceIntent)
        }
        jobFinished(params, false)
        return false
    }

    override fun onStopJob(params: JobParameters?): Boolean = false
}
