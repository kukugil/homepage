package com.example.apktesttools.monkey.model

data class TestResult(
    val packageName: String = "",
    val appName: String = "",
    val eventCountTotal: Int = 0,
    val eventsInjected: Int = 0,
    val eventsDroppedKeys: Int = 0,
    val eventsDroppedPointers: Int = 0,
    val durationMs: Long = 0,
    val success: Boolean = false,
    val crashes: List<CrashInfo> = emptyList(),
    val logcatPath: String = "",
    val seed: Int = 0
)
