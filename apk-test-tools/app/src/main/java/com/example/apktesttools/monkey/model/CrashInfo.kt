package com.example.apktesttools.monkey.model

data class CrashInfo(
    val eventNumber: Int = 0,
    val eventType: String = "",
    val exceptionType: String = "",
    val stackTrace: String = "",
    val logcatContext: String = "",
    val screenshotPath: String = ""
)
