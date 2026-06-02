package com.example.apktesttools.monkey

import android.app.ActivityManager
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.apktesttools.R
import com.example.apktesttools.monkey.model.TestConfig
import com.example.apktesttools.ui.AppListAdapter
import kotlinx.coroutines.*

class MonkeyFragment : Fragment() {

    private lateinit var recyclerView: RecyclerView
    private lateinit var appAdapter: AppListAdapter
    private lateinit var etEventCount: EditText
    private lateinit var etThrottle: EditText
    private lateinit var etSeed: EditText
    private lateinit var etActivity: EditText
    private lateinit var etTimeout: EditText
    private lateinit var sbPctTouch: SeekBar
    private lateinit var sbPctMotion: SeekBar
    private lateinit var sbPctSyskeys: SeekBar
    private lateinit var sbPctAnyevent: SeekBar
    private lateinit var tvPctTouch: TextView
    private lateinit var tvPctMotion: TextView
    private lateinit var tvPctSyskeys: TextView
    private lateinit var tvPctAnyevent: TextView
    private lateinit var swIgnoreCrashes: Switch
    private lateinit var swIgnoreTimeouts: Switch
    private lateinit var btnStart: Button
    private lateinit var btnStop: Button
    private lateinit var btnViewReport: Button
    private lateinit var tvPctSum: TextView
    private lateinit var tvStatus: TextView
    private lateinit var progressLayout: LinearLayout

    /** 防止 SeekBar 回调递归 */
    private var adjustingSliders = false

    /** 上一次平衡后的值，作为下次 diff 计算的基准（解决 onProgressChanged 时 progress 已是新值的问题） */
    private var prevTouch = 85    // 与 XML 默认值一致
    private var prevMotion = 5
    private var prevSyskeys = 0
    private var prevAnyevent = 10

    private var refreshJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    // ── 便捷读写当前值 ──

    private val touchPct    get() = sbPctTouch.progress
    private val motionPct   get() = sbPctMotion.progress
    private val syskeysPct  get() = sbPctSyskeys.progress
    private val anyeventPct get() = sbPctAnyevent.progress

    private fun setPcts(touch: Int, motion: Int, syskeys: Int, anyevent: Int) {
        sbPctTouch.progress = touch
        sbPctMotion.progress = motion
        sbPctSyskeys.progress = syskeys
        sbPctAnyevent.progress = anyevent
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View = inflater.inflate(R.layout.fragment_monkey, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        recyclerView = view.findViewById(R.id.rv_apps)
        etEventCount = view.findViewById(R.id.et_event_count)
        etThrottle = view.findViewById(R.id.et_throttle)
        etSeed = view.findViewById(R.id.et_seed)
        etActivity = view.findViewById(R.id.et_activity)
        etTimeout = view.findViewById(R.id.et_timeout)
        // 新版 SeekBar 滑块
        sbPctTouch = view.findViewById(R.id.sb_pct_touch)
        sbPctMotion = view.findViewById(R.id.sb_pct_motion)
        sbPctSyskeys = view.findViewById(R.id.sb_pct_syskeys)
        sbPctAnyevent = view.findViewById(R.id.sb_pct_anyevent)
        tvPctTouch = view.findViewById(R.id.tv_pct_touch)
        tvPctMotion = view.findViewById(R.id.tv_pct_motion)
        tvPctSyskeys = view.findViewById(R.id.tv_pct_syskeys)
        tvPctAnyevent = view.findViewById(R.id.tv_pct_anyevent)
        swIgnoreCrashes = view.findViewById(R.id.sw_ignore_crashes)
        swIgnoreTimeouts = view.findViewById(R.id.sw_ignore_timeouts)
        btnStart = view.findViewById(R.id.btn_start)
        btnStop = view.findViewById(R.id.btn_stop)
        btnViewReport = view.findViewById(R.id.btn_view_report)
        tvPctSum = view.findViewById(R.id.tv_pct_sum)
        tvStatus = view.findViewById(R.id.tv_status)
        progressLayout = view.findViewById(R.id.layout_progress)

        loadAppList()

        // SeekBar 滑块联动监听
        val sliderListener = object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                if (adjustingSliders) return
                handleSliderChange(seekBar!!, progress)
            }
            override fun onStartTrackingTouch(seekBar: SeekBar?) {}
            override fun onStopTrackingTouch(seekBar: SeekBar?) {}
        }
        sbPctTouch.setOnSeekBarChangeListener(sliderListener)
        sbPctMotion.setOnSeekBarChangeListener(sliderListener)
        sbPctSyskeys.setOnSeekBarChangeListener(sliderListener)
        sbPctAnyevent.setOnSeekBarChangeListener(sliderListener)

        // 初始刷新显示
        refreshAllPctLabels()

        btnStart.setOnClickListener {
            val selected = appAdapter.getSelectedPackages()
            if (selected.isEmpty()) {
                Toast.makeText(requireContext(), "请至少选择一个应用", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            if (!validatePctSum()) {
                Toast.makeText(requireContext(), "事件占比之和必须等于 100%", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            startMonkeyTest(selected)
        }

        btnStop.setOnClickListener {
            stopMonkeyTest()
        }

        btnViewReport.setOnClickListener {
            val reportPath = findLatestMonkeyReport()
            if (reportPath == null) {
                Toast.makeText(requireContext(), "尚未生成 Monkey 测试报告", Toast.LENGTH_SHORT).show()
            } else {
                val intent = Intent(requireContext(), com.example.apktesttools.ui.ReportViewActivity::class.java).apply {
                    putExtra("report_path", reportPath)
                }
                startActivity(intent)
            }
        }

        // 初始化状态
        updateServiceStatus()
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
                updateServiceStatus()
                delay(2000)
            }
        }
    }

    /**
     * 在 ${filesDir}/MonkeyReports/ 下查找最新的 report.html
     */
    private fun findLatestMonkeyReport(): String? {
        val reportsDir = java.io.File(requireContext().filesDir, "MonkeyReports")
        if (!reportsDir.exists() || !reportsDir.isDirectory) return null
        val subDirs = reportsDir.listFiles { f -> f.isDirectory } ?: return null
        // 按目录名（日期时间戳）逆序，取最新的
        val latest = subDirs.sortedByDescending { it.name }.firstOrNull() ?: return null
        val reportFile = java.io.File(latest, "report.html")
        return if (reportFile.exists()) reportFile.absolutePath else null
    }

    private fun updateServiceStatus() {
        val isRunning = isMonkeyServiceRunning()
        if (isRunning) {
            progressLayout.visibility = View.VISIBLE
            tvStatus.text = "Monkey 测试正在后台运行中..."
            btnStart.isEnabled = false
            btnStop.isEnabled = true
        } else {
            progressLayout.visibility = View.GONE
            tvStatus.text = "待启动"
            btnStart.isEnabled = true
            btnStop.isEnabled = false
        }
    }

    /**
     * 检查 MonkeyService 是否在运行。
     * Android 15 上 getRunningServices() 不可靠，改用进程名检查。
     */
    private fun isMonkeyServiceRunning(): Boolean {
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("ps", "-A"))
            val output = process.inputStream.bufferedReader().readText()
            process.waitFor()
            // MonkeyService 运行在 app 主进程，检查 monkey 命令是否在跑
            output.contains(" monkey") || output.contains("com.android.commands.monkey")
        } catch (_: Exception) {
            false
        }
    }

    private fun loadAppList() {
        val pm = requireContext().packageManager
        val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
            .filter { it.flags and ApplicationInfo.FLAG_SYSTEM == 0 }
            .sortedBy { pm.getApplicationLabel(it).toString() }
            .map { info ->
                AppListAdapter.AppInfo(
                    packageName = info.packageName,
                    appName = pm.getApplicationLabel(info).toString(),
                    icon = pm.getApplicationIcon(info)
                )
            }

        appAdapter = AppListAdapter(apps)
        recyclerView.layoutManager = LinearLayoutManager(requireContext())
        recyclerView.adapter = appAdapter
    }

    // ── SeekBar 自动补全逻辑 ──

    /**
     * 用户拖动某个滑块时触发。
     * 策略：优先让"其他"（anyevent）吸收差异；若 anyevent 触边，向其他两个滑块均摊。
     */
    private fun handleSliderChange(changed: SeekBar, newValue: Int) {
        adjustingSliders = true

        // 使用 prev*（上次平衡后的值）计算 diff，而非读取 progress（此时已是新值）
        val oldSelf = when (changed) {
            sbPctTouch -> prevTouch; sbPctMotion -> prevMotion; sbPctSyskeys -> prevSyskeys
            else -> { adjustingSliders = false; return }  // anyevent 自己拖动时不自动平衡
        }
        val diff = newValue - oldSelf
        if (diff == 0) { adjustingSliders = false; return }

        // otherSliders = 除了 changed 和 anyevent 外的两个滑块
        val otherSliders = listOf(sbPctTouch, sbPctMotion, sbPctSyskeys).filter { it != changed }
        fun getPrev(sb: SeekBar) = when (sb) {
            sbPctTouch -> prevTouch; sbPctMotion -> prevMotion; else -> prevSyskeys
        }

        // Step 1: anyevent 吸收差异
        var newAnyevent = prevAnyevent - diff
        var overflow = 0
        if (newAnyevent > 100) { overflow = newAnyevent - 100; newAnyevent = 100 }
        else if (newAnyevent < 0)  { overflow = newAnyevent; newAnyevent = 0 }

        // Step 2: 溢出均摊给 otherSliders
        val newOthers = otherSliders.map { sb -> (getPrev(sb) - overflow / 2).coerceIn(0, 100) }.toMutableList()
        val actualSum = newValue + newOthers.sum() + newAnyevent
        if (actualSum != 100 && otherSliders.size == 2) {
            val fix = 100 - actualSum
            val idx = if (overflow > 0) 0 else 1
            newOthers[idx] = (newOthers[idx] + fix).coerceIn(0, 100)
        }

        // 写入所有滑块
        setPcts(
            if (changed == sbPctTouch) newValue else if (otherSliders[0] == sbPctTouch) newOthers[0] else newOthers[1],
            if (changed == sbPctMotion) newValue else if (otherSliders[0] == sbPctMotion) newOthers[0] else newOthers[1],
            if (changed == sbPctSyskeys) newValue else if (otherSliders[0] == sbPctSyskeys) newOthers[0] else newOthers[1],
            newAnyevent
        )

        // 保存本次结果作为下一轮的基准值
        prevTouch = touchPct
        prevMotion = motionPct
        prevSyskeys = syskeysPct
        prevAnyevent = anyeventPct

        refreshAllPctLabels()
        adjustingSliders = false
    }

    private fun refreshAllPctLabels() {
        tvPctTouch.text = "${touchPct}%"
        tvPctMotion.text = "${motionPct}%"
        tvPctSyskeys.text = "${syskeysPct}%"
        tvPctAnyevent.text = "${anyeventPct}%"

        val sum = touchPct + motionPct + syskeysPct + anyeventPct
        tvPctSum.text = "合计: $sum%"
        tvPctSum.setTextColor(
            if (sum == 100) android.graphics.Color.parseColor("#4CAF50")
            else android.graphics.Color.parseColor("#F44336")
        )
    }

    private fun validatePctSum(): Boolean {
        return (touchPct + motionPct + syskeysPct + anyeventPct) == 100
    }

    private fun startMonkeyTest(selected: List<AppListAdapter.AppInfo>) {
        val configs = selected.joinToString("|||") { app ->
            listOf(
                app.packageName,
                app.appName,
                etEventCount.text.toString().ifBlank { "10000" },
                etThrottle.text.toString().ifBlank { "200" },
                etSeed.text.toString().ifBlank { (System.currentTimeMillis() % 100000).toInt().toString() },
                etActivity.text.toString(),
                touchPct.toString(),
                motionPct.toString(),
                syskeysPct.toString(),
                anyeventPct.toString(),
                etTimeout.text.toString().ifBlank { "600" },
                swIgnoreCrashes.isChecked.toString(),
                swIgnoreTimeouts.isChecked.toString()
            ).joinToString("|")
        }

        val intent = Intent(requireContext(), MonkeyService::class.java).apply {
            action = MonkeyService.ACTION_START
            putExtra(MonkeyService.EXTRA_CONFIGS, configs)
        }
        requireContext().startForegroundService(intent)
        Toast.makeText(requireContext(), "Monkey 测试已在后台启动", Toast.LENGTH_SHORT).show()
        updateServiceStatus()
    }

    private fun stopMonkeyTest() {
        val intent = Intent(requireContext(), MonkeyService::class.java).apply {
            action = MonkeyService.ACTION_STOP
        }
        requireContext().startService(intent)
        Toast.makeText(requireContext(), "正在停止 Monkey 测试...", Toast.LENGTH_SHORT).show()
        updateServiceStatus()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        scope.cancel()
    }
}
