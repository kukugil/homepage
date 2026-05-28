package com.example.apktesttools.wifi.model

data class WifiTestStatus(
    val shouldContinue: Boolean = true,
    val currentCycle: Int = 0,
    val maxCycles: Int = 500,
    val maxConsecutiveFailures: Int = 3,
    val startTime: String = "",
    val targetSsid: String = "",
    val delaySeconds: Int = 45
)
