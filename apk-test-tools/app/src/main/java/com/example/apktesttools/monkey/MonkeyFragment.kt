package com.example.apktesttools.monkey

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

class MonkeyFragment : Fragment() {

    private lateinit var recyclerView: RecyclerView
    private lateinit var appAdapter: AppListAdapter
    private lateinit var etEventCount: EditText
    private lateinit var etThrottle: EditText
    private lateinit var etSeed: EditText
    private lateinit var etActivity: EditText
    private lateinit var etTimeout: EditText
    private lateinit var etPctTouch: EditText
    private lateinit var etPctMotion: EditText
    private lateinit var etPctSyskeys: EditText
    private lateinit var etPctAnyevent: EditText
    private lateinit var swIgnoreCrashes: Switch
    private lateinit var swIgnoreTimeouts: Switch
    private lateinit var btnStart: Button
    private lateinit var tvPctSum: TextView

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
        etPctTouch = view.findViewById(R.id.et_pct_touch)
        etPctMotion = view.findViewById(R.id.et_pct_motion)
        etPctSyskeys = view.findViewById(R.id.et_pct_syskeys)
        etPctAnyevent = view.findViewById(R.id.et_pct_anyevent)
        swIgnoreCrashes = view.findViewById(R.id.sw_ignore_crashes)
        swIgnoreTimeouts = view.findViewById(R.id.sw_ignore_timeouts)
        btnStart = view.findViewById(R.id.btn_start)
        tvPctSum = view.findViewById(R.id.tv_pct_sum)

        loadAppList()

        val pctWatchers = listOf(etPctTouch, etPctMotion, etPctSyskeys, etPctAnyevent)
        pctWatchers.forEach { et ->
            et.addTextChangedListener(object : android.text.TextWatcher {
                override fun afterTextChanged(s: android.text.Editable?) = updatePctSum()
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            })
        }

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

    private fun updatePctSum() {
        val sum = listOf(etPctTouch, etPctMotion, etPctSyskeys, etPctAnyevent)
            .sumOf { it.text.toString().toIntOrNull() ?: 0 }
        tvPctSum.text = "合计: $sum%"
        tvPctSum.setTextColor(
            if (sum == 100) android.graphics.Color.parseColor("#4CAF50")
            else android.graphics.Color.parseColor("#F44336")
        )
    }

    private fun validatePctSum(): Boolean {
        return listOf(etPctTouch, etPctMotion, etPctSyskeys, etPctAnyevent)
            .sumOf { it.text.toString().toIntOrNull() ?: 0 } == 100
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
                etPctTouch.text.toString().ifBlank { "70" },
                etPctMotion.text.toString().ifBlank { "15" },
                etPctSyskeys.text.toString().ifBlank { "10" },
                etPctAnyevent.text.toString().ifBlank { "5" },
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
    }
}
