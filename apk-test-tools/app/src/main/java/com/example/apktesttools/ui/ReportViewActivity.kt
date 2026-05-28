package com.example.apktesttools.ui

import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.example.apktesttools.R
import java.io.File

class ReportViewActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_report)

        val webView = findViewById<WebView>(R.id.webview_report)
        webView.settings.javaScriptEnabled = true
        webView.webViewClient = WebViewClient()

        val reportPath = intent.getStringExtra("report_path") ?: return
        val file = File(reportPath)
        if (file.exists()) {
            webView.loadUrl("file://$reportPath")
        } else {
            Toast.makeText(this, "报告文件不存在: $reportPath", Toast.LENGTH_LONG).show()
            finish()
        }
    }
}
