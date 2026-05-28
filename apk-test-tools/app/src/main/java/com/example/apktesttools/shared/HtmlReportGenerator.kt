package com.example.apktesttools.shared

import java.text.SimpleDateFormat
import java.util.*

object HtmlReportGenerator {

    private val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())

    fun template(title: String, deviceInfo: String, content: String): String {
        return """
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>$title</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; background:#f5f5f5; color:#333; padding:16px; }
.card { background:#fff; border-radius:8px; padding:16px; margin-bottom:16px; box-shadow:0 1px 3px rgba(0,0,0,0.1); }
h1 { font-size:20px; margin-bottom:4px; }
h2 { font-size:16px; color:#666; margin-bottom:12px; }
.meta { font-size:13px; color:#999; margin-bottom:16px; }
table { width:100%; border-collapse:collapse; margin:12px 0; }
th, td { padding:10px 12px; text-align:left; border-bottom:1px solid #eee; font-size:14px; }
th { background:#fafafa; font-weight:600; }
.pass { color:#4caf50; font-weight:600; }
.fail { color:#f44336; font-weight:600; }
.crash-detail { background:#fff3f3; border-left:3px solid #f44336; padding:12px; margin:8px 0; border-radius:4px; }
.crash-detail pre { font-size:12px; overflow-x:auto; white-space:pre-wrap; word-break:break-all; }
.summary { display:flex; gap:16px; flex-wrap:wrap; }
.summary-item { flex:1; min-width:120px; text-align:center; padding:16px; border-radius:8px; }
.summary-success { background:#e8f5e9; }
.summary-fail { background:#ffebee; }
.summary-item .num { font-size:32px; font-weight:700; }
.summary-item .label { font-size:13px; color:#666; margin-top:4px; }
.bar { display:inline-block; height:16px; border-radius:2px; vertical-align:middle; margin-right:4px; }
.bar-pass { background:#4caf50; }
.bar-fail { background:#f44336; }
.bar-warn { background:#ff9800; }
.replay-cmd { background:#263238; color:#aed581; padding:12px; border-radius:4px; font-family:monospace; font-size:13px; overflow-x:auto; white-space:pre-wrap; }
</style>
</head>
<body>
<h1>$title</h1>
<div class="meta">生成时间：${dateFormat.format(Date())}<br>设备信息：$deviceInfo</div>
$content
</body>
</html>
        """.trimIndent()
    }
}
