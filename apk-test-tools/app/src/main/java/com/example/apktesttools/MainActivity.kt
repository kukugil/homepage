package com.example.apktesttools

import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.viewpager2.widget.ViewPager2
import com.example.apktesttools.shared.NotificationPermissionHelper
import com.example.apktesttools.shared.SystemCommandExecutor
import com.google.android.material.tabs.TabLayout
import com.google.android.material.tabs.TabLayoutMediator

class MainActivity : AppCompatActivity() {

    private lateinit var viewPager: ViewPager2
    private lateinit var tabLayout: TabLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        viewPager = findViewById(R.id.viewpager)
        tabLayout = findViewById(R.id.tab_layout)

        viewPager.adapter = MainPagerAdapter(this)

        TabLayoutMediator(tabLayout, viewPager) { tab, position ->
            tab.text = when (position) {
                0 -> "Monkey 测试"
                1 -> "WiFi 重启测试"
                else -> ""
            }
        }.attach()

        // ★ v3.0：检查 system UID 而非 Root
        checkSystemUid()
    }

    override fun onResume() {
        super.onResume()
        NotificationPermissionHelper.ensureNotificationPermission(this)
    }

    /**
     * ★ v3.0：检查 APK 是否以 system UID 运行（替代 v2 的 Root 检测）
     */
    private fun checkSystemUid() {
        if (!SystemCommandExecutor.isSystemUid()) {
            Toast.makeText(
                this,
                "当前未以系统应用身份运行 (uid=${android.os.Process.myUid()})。" +
                "请用平台证书签名并将 APK 放入 /system/priv-app/",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<out String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        when (requestCode) {
            NotificationPermissionHelper.REQUEST_NOTIFICATION -> {
                // 通知权限不影响功能，仅静默处理
            }
        }
    }
}
