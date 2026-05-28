package com.example.apktesttools.monkey.model

data class TestConfig(
    val packageName: String = "",
    val appName: String = "",
    val eventCount: Int = 10000,
    val throttleMs: Int = 200,
    val seed: Int = (System.currentTimeMillis() % 100000).toInt(),
    val targetActivity: String = "",
    val pctTouch: Int = 70,
    val pctMotion: Int = 15,
    val pctSyskeys: Int = 10,
    val pctAnyevent: Int = 5,
    val timeoutSeconds: Int = 600,
    val ignoreCrashes: Boolean = false,
    val ignoreTimeouts: Boolean = false
) {
    fun toMonkeyCommand(): String {
        val parts = mutableListOf<String>()
        parts.add("monkey -p $packageName -v -v --throttle $throttleMs -s $seed")

        if (pctTouch > 0) parts.add("--pct-touch $pctTouch")
        if (pctMotion > 0) parts.add("--pct-motion $pctMotion")
        if (pctSyskeys > 0) parts.add("--pct-syskeys $pctSyskeys")
        if (pctAnyevent > 0) parts.add("--pct-anyevent $pctAnyevent")
        if (ignoreCrashes) parts.add("--ignore-crashes")
        if (ignoreTimeouts) parts.add("--ignore-timeouts")

        parts.add(eventCount.toString())
        return parts.joinToString(" ")
    }

    fun validatePercentages(): Boolean {
        return (pctTouch + pctMotion + pctSyskeys + pctAnyevent) == 100
    }
}
