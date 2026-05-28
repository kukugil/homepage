package com.example.apktesttools

import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentActivity
import androidx.viewpager2.adapter.FragmentStateAdapter
import com.example.apktesttools.monkey.MonkeyFragment
import com.example.apktesttools.wifi.WifiFragment

class MainPagerAdapter(activity: FragmentActivity) : FragmentStateAdapter(activity) {

    override fun getItemCount(): Int = 2

    override fun createFragment(position: Int): Fragment {
        return when (position) {
            0 -> MonkeyFragment()
            1 -> WifiFragment()
            else -> throw IllegalArgumentException("Unknown position $position")
        }
    }
}
