package com.example.apktesttools.ui

import android.graphics.drawable.Drawable
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.apktesttools.R

class AppListAdapter(
    private val apps: List<AppInfo>,
    private val onSelectionChanged: (() -> Unit)? = null
) : RecyclerView.Adapter<AppListAdapter.ViewHolder>() {

    data class AppInfo(
        val packageName: String,
        val appName: String,
        val icon: Drawable,
        var selected: Boolean = false
    )

    private val selectedSet = mutableSetOf<String>()

    inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val checkBox: CheckBox = view.findViewById(R.id.cb_app)
        val icon: ImageView = view.findViewById(R.id.iv_app_icon)
        val appName: TextView = view.findViewById(R.id.tv_app_name)
        val packageName: TextView = view.findViewById(R.id.tv_package_name)

        fun bind(app: AppInfo) {
            icon.setImageDrawable(app.icon)
            appName.text = app.appName
            packageName.text = app.packageName
            checkBox.isChecked = selectedSet.contains(app.packageName)

            checkBox.setOnCheckedChangeListener { _, checked ->
                if (checked) selectedSet.add(app.packageName)
                else selectedSet.remove(app.packageName)
                app.selected = checked
                onSelectionChanged?.invoke()
            }

            itemView.setOnClickListener {
                checkBox.isChecked = !checkBox.isChecked
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_app, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(apps[position])
    }

    override fun getItemCount(): Int = apps.size

    fun getSelectedPackages(): List<AppInfo> {
        return apps.filter { selectedSet.contains(it.packageName) }
    }

    fun filter(query: String): List<AppInfo> {
        return if (query.isBlank()) apps
        else apps.filter {
            it.appName.contains(query, ignoreCase = true) ||
                    it.packageName.contains(query, ignoreCase = true)
        }
    }
}
