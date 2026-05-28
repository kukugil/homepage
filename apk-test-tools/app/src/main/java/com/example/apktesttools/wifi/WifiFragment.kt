package com.example.apktesttools.wifi

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.fragment.app.Fragment
import com.example.apktesttools.R
import com.example.apktesttools.wifi.persistence.PersistenceManager
import kotlinx.coroutines.*

class WifiFragment : Fragment() {

    private lateinit var etMaxCycles: EditText
    private lateinit var etDelay: EditText
    private lateinit var etMaxFailures: EditText
    private lateinit var etSsid: EditText
    private lateinit var etPassword: EditText
    private lateinit var btnStart: Button
    private lateinit var btnStop: Button
    private lateinit var btnExport: Button
    private lateinit var tvStatus: TextView
    private lateinit var tvRecentResults: TextView
    private lateinit var progressLayout: LinearLayout
    private lateinit var tvProgress: TextView

    private var refreshJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View = inflater.inflate(R.layout.fragment_wifi, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        etMaxCycles = view.findViewById(R.id.et_max_cycles)
        etDelay = view.findViewById(R.id.et_delay)
        etMaxFailures = view.findViewById(R.id.et_max_failures)
        etSsid = view.findViewById(R.id.et_ssid)
        etPassword = view.findViewById(R.id.et_password)
        btnStart = view.findViewById(R.id.btn_start)
        btnStop = view.findViewById(R.id.btn_stop)
        btnExport = view.findViewById(R.id.btn_export)
        tvStatus = view.findViewById(R.id.tv_status)
        tvRecentResults = view.findViewById(R.id.tv_recent_results)
        progressLayout = view.findViewById(R.id.layout_progress)
        tvProgress = view.findViewById(R.id.tv_progress)

        btnStart.setOnClickListener { startWifiTest() }
        btnStop.setOnClickListener { stopWifiTest() }
        btnExport.setOnClickListener { showExportInfo() }
        btnStop.isEnabled = false

        refreshStatus()
    }

    override fun onResume() {
        super.onResume()
        startRefresh()
    }

    override fun onPause() {
        super.onPause()
        refreshJob?.cancel()
    }

    private fun startRefresh() {
        refreshJob = scope.launch {
            while (isActive) {
                refreshStatus()
                delay(3000)
            }
        }
    }

    private fun refreshStatus() {
        val status = PersistenceManager.readStatus()
        if (status != null && status.shouldContinue) {
            progressLayout.visibility = View.VISIBLE
            tvProgress.text = "已完成: ${status.currentCycle} / ${status.maxCycles}\n" +
                    "目标WiFi: ${status.targetSsid.ifBlank { "(仅扫描)" }}"

            val records = PersistenceManager.readAllRecords()
            if (records.isNotEmpty()) {
                val passed = records.count { it.success }
                val failed = records.count { !it.success }
                val rate = if (records.isNotEmpty()) (passed * 100.0 / records.size) else 0.0
                tvStatus.text = "成功率: ${"%.1f".format(rate)}%  |  成功 $passed 次  |  失败 $failed 次"

                val recent = records.takeLast(5).reversed().joinToString("\n") { r ->
                    val icon = if (r.success) "✅" else "❌"
                    val signal = if (r.signalDbm != 0) ", ${r.signalDbm}dBm" else ""
                    "$icon #${r.cycle} ${r.time}  ${r.ssidCount}个网络$signal  ${r.detail}"
                }
                tvRecentResults.text = recent
            } else {
                tvStatus.text = "等待第一次检测结果..."
            }

            btnStart.isEnabled = false
            btnStop.isEnabled = true
        } else {
            progressLayout.visibility = View.GONE
            if (status != null && status.currentCycle > 0) {
                tvStatus.text = "测试已停止 (完成 ${status.currentCycle} 次)"
            } else {
                tvStatus.text = "待启动"
            }
            btnStart.isEnabled = true
            btnStop.isEnabled = false
        }
    }

    private fun startWifiTest() {
        val maxCycles = etMaxCycles.text.toString().toIntOrNull() ?: 500
        if (maxCycles <= 0) {
            Toast.makeText(requireContext(), "请填写有效的重启次数", Toast.LENGTH_SHORT).show()
            return
        }

        val ssid = etSsid.text.toString().trim()
        val password = etPassword.text.toString().trim()

        if (ssid.isNotEmpty() && password.isEmpty()) {
            Toast.makeText(
                requireContext(),
                "请输入 WiFi 密码（若不测试连接功能，请清空 WiFi 名称）",
                Toast.LENGTH_LONG
            ).show()
            return
        }

        AlertDialog.Builder(requireContext())
            .setTitle("确认开始测试")
            .setMessage(
                "即将开始 WiFi 重启循环测试。\n\n" +
                        "• 设备将立即重启\n" +
                        "• 密码仅存内存，不写入文件\n" +
                        "• 重启次数: $maxCycles\n" +
                        "• 连续失败上限: ${etMaxFailures.text}\n" +
                        "${if (ssid.isNotEmpty()) "• 目标WiFi: $ssid\n" else ""}" +
                        "\n确定继续？"
            )
            .setPositiveButton("确定") { _, _ ->
                val intent = Intent(requireContext(), WifiTestService::class.java).apply {
                    action = WifiTestService.ACTION_START
                    putExtra(WifiTestService.EXTRA_MAX_CYCLES, maxCycles)
                    putExtra(WifiTestService.EXTRA_MAX_FAILURES, etMaxFailures.text.toString().toIntOrNull() ?: 3)
                    putExtra(WifiTestService.EXTRA_SSID, ssid)
                    putExtra(WifiTestService.EXTRA_PASSWORD, password)
                    putExtra(WifiTestService.EXTRA_DELAY, etDelay.text.toString().toIntOrNull() ?: 45)
                }
                requireContext().startForegroundService(intent)
                Toast.makeText(requireContext(), "设备即将重启...", Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton("取消", null)
            .show()
    }

    private fun stopWifiTest() {
        PersistenceManager.createStopFlag()
        val intent = Intent(requireContext(), WifiTestService::class.java).apply {
            action = WifiTestService.ACTION_STOP
        }
        requireContext().startService(intent)
        Toast.makeText(requireContext(), "已发送停止信号，当前循环完成后将停止", Toast.LENGTH_SHORT).show()
    }

    private fun showExportInfo() {
        val reportPath = "${WifiTestService.BASE_DIR}/test_report.html"
        val csvPath = "${WifiTestService.BASE_DIR}/results.csv"
        val exists = java.io.File(reportPath).exists() || java.io.File(csvPath).exists()

        AlertDialog.Builder(requireContext())
            .setTitle("导出报告")
            .setMessage(
                if (exists) {
                    "文件位置：\n" +
                            "HTML 报告: $reportPath\n" +
                            "CSV 数据: $csvPath\n\n" +
                            "可通过 adb pull 导出到电脑:\n" +
                            "adb pull $reportPath\n" +
                            "adb pull $csvPath"
                } else {
                    "尚未生成报告，请先完成一次测试"
                }
            )
            .setPositiveButton("确定", null)
            .show()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        scope.cancel()
    }
}
