# APK 自动化测试工具 — 技术文档

**版本**：v3.0
**最后更新**：2026-05-28
**适用范围**：系统签名（platform key）的 Android 测试设备（Android 7.0 ~ 14）

> **v3.0 架构变更**：本版本从 Root（su）方案全面迁移到**系统签名（platform key）方案**。APK 使用平台证书签名后放入 `/system/priv-app/`，以 `android.uid.system` 身份运行，通过 Framework API（含隐藏 API）和 system UID 权限完成所有操作，不再依赖 Root 和 `su` 命令。

---

## 0. 文档修订记录

| 版本 | 日期 | 修订内容 |
|------|------|---------|
| v1.0 | 2026-05-27 | 初版 |
| v2.0 | 2026-05-27 | 合并为单一 APK；修正"关机→重启"歧义；WiFi 操作改用 Root 命令；补充位置权限/SELinux/信号强度/截图/fsync；Activity 过滤；WiFi 报告 |
| v2.1 | 2026-05-27 | WiFi 命令 Android 版本降级策略；锁屏自动处理；JobScheduler 兜底；WiFi 密码不落盘；连续失败阈值可配置 |
| v2.2 | 2026-05-27 | Android 10+ 存储权限适配；路径B 连接改用 wpa_cli 避开 getConfiguredNetworks 废弃；Android 13+ 通知权限运行时申请；FGS specialUse 子类型声明；Monkey pct 映射表 |
| v3.0 | 2026-05-28 | **架构升级**：Root 方案 → 系统签名方案。移除所有 `su -c` 依赖，改用 Framework API + system UID 直接执行。WiFi 模块全路径统一用 WifiManager API。新增部署指南（平台签名 + 系统分区内置） |

---

## 概述

本方案是一个 **合并式 Android APK 工具**，内置为系统应用（platform key 签名 + `/system/priv-app/` 部署），以 `android.uid.system` 身份运行，提供两类自动化测试能力：

| 入口 | 用途 | 核心能力 |
|------|------|---------|
| **Monkey 测试** | 对任意应用执行 UI 压力测试 | 选应用/Activity、调参数、跑测试、崩溃截图、生成 HTML 报告，全程脱离 PC |
| **WiFi 重启循环测试** | 反复重启设备验证 WiFi 模块稳定性 | 重启→自动开机→检查 WiFi 列表 & 连接→记录结果→再重启，直到指定次数 |

> **重要概念澄清**：文档中的"循环"指的是 **reboot（热重启）**，不是 `power off`（彻底关机断电）。原因是 Android 设备完全断电后没有硬件级的自动开机机制（不像 PC BIOS 的 RTC Wake），纯软件无法实现"关机→自动开机→检测"的闭环。工厂产线/QA 场景下，实际需求就是验证设备反复重启后 WiFi 模块是否可靠恢复，reboot 完全可以覆盖这个测试目标。UI 上也统一标注为"重启循环测试"。

### 方案对比：Root vs 系统签名

| | Root (su) 方案 (v2.x) | 系统签名方案 (v3.0) |
|---|---|---|
| **权限模型** | 绕过 Android 权限系统，以 uid=0 执行任意命令 | 以 uid=1000 (system) 运行，获得所有 signature/privileged 级权限 |
| **操作方式** | `su -c "shell 命令"` | Framework API（含隐藏 API）+ 直接 `Runtime.exec("系统命令")` |
| **部署方式** | 普通安装 + Magisk/SuperSU 授权 | 平台证书签名 → push 到 `/system/priv-app/` → 重启 |
| **SELinux** | 能改 (`setenforce 0`) | **不能改**，但 system 进程 sepolicy 已有足够权限，无需 Permissive |
| **WiFi 操作** | `su -c cmd wifi` / `svc wifi` / `wpa_cli` | `WifiManager` 全套 API（system UID 绕过第三方调用限制） |
| **进程被杀风险** | 普通 app，国产 ROM 可能杀 | system UID 进程，OOM adj 极低，几乎不会被杀 |
| **依赖** | 需要 Magisk/SuperSU，首次弹窗授权 | 需要 OEM 配合预置或 AOSP 编译环境 |

---

# 第一部分：整体架构

## 1. 项目结构（v3.0 更新）

```
apk-test-tools/
├── app/
│   ├── build.gradle.kts
│   ├── keystore/                                    # ★ 签名材料目录
│   │   ├── platform.pk8                             # 平台私钥（从 AOSP 编译产物获取）
│   │   ├── platform.x509.pem                         # 平台证书
│   │   └── sign_apk.sh                              # 签名脚本
│   └── src/main/
│       ├── AndroidManifest.xml
│       └── java/com/example/apktesttools/
│           │
│           ├── MainActivity.kt                  # 首页，两个 Tab 入口
│           │
│           ├── monkey/                           # ===== Monkey 测试模块 =====
│           │   ├── MonkeyFragment.kt             # Monkey 功能的主界面（Fragment）
│           │   ├── MonkeyService.kt              # Foreground Service
│           │   ├── MonkeyRunner.kt               # 执行 monkey 命令 + 解析输出
│           │   ├── LogcatCollector.kt            # logcat 抓取（READ_LOGS 权限）
│           │   └── model/
│           │       ├── TestConfig.kt             # 测试参数
│           │       ├── TestResult.kt             # 单次结果
│           │       └── CrashInfo.kt              # 崩溃信息
│           │
│           ├── wifi/                             # ===== WiFi 测试模块 =====
│           │   ├── WifiFragment.kt               # WiFi 功能的主界面（Fragment）
│           │   ├── WifiTestService.kt            # Foreground Service
│           │   ├── BootCheckJobService.kt        # JobScheduler 兜底（国产 ROM 救星）
│           │   ├── WifiChecker.kt                # WiFi 扫描 / 连接检查（全部 Framework API）
│           │   ├── BootReceiver.kt               # 接收 BOOT_COMPLETED 广播
│           │   ├── model/
│           │   │   ├── WifiTestStatus.kt         # status.json 的数据结构
│           │   │   └── WifiTestRecord.kt         # CSV 一行 & 内存结构
│           │   └── persistence/
│           │       └── PersistenceManager.kt     # 读写 status.json / results.csv / stop.flag
│           │
│           ├── shared/                           # ===== 共用模块 =====
│           │   ├── SystemCommandExecutor.kt      # 系统命令执行器（★ 替代 RootExecutor，不加 su）
│           │   ├── ForegroundServiceBase.kt      # 前台服务基类
│           │   ├── HtmlReportGenerator.kt        # HTML 报告模板引擎
│           │   ├── ScreenshotHelper.kt           # 截图工具（SurfaceControl / screencap）
│           │   ├── SelinuxHelper.kt              # SELinux 检测 & 提示（只检测，不要求修改）
│           │   ├── LockScreenHelper.kt           # ★ 锁屏管理（反射 LockPatternUtils / WRITE_SECURE_SETTINGS）
│           │   └── NotificationPermissionHelper.kt  # Android 13+ 通知权限
│           │
│           └── ui/                               # ===== 共用 UI =====
│               ├── AppListAdapter.kt             # 已安装应用列表适配器
│               └── ReportViewActivity.kt         # 报告查看（WebView 渲染 HTML）
│
│       └── res/
│           ├── layout/
│           │   ├── activity_main.xml             # 主布局（TabLayout + ViewPager2）
│           │   ├── fragment_monkey.xml
│           │   └── fragment_wifi.xml
│           ├── drawable/                         # 图标
│           └── values/strings.xml
│
├── build.gradle.kts
└── settings.gradle.kts
```

> **v3.0 关键变更**：
> - 移除 `RootExecutor.kt`，新增 `SystemCommandExecutor.kt`（不加 su 前缀）
> - 移除 `StoragePermissionHelper.kt`（system UID 对 `/sdcard/` 等路径有天然读写权限，Android 10+ scoped storage 不适用于 system UID 进程）
> - 新增 `LockScreenHelper.kt`（封装隐藏 API 操作锁屏）
> - Move `SelinuxHelper` 简化为仅检测模式（不能改也不要求改）

## 2. 模块交互简图

```
┌──────────────────────────────────────────────────────────┐
│                      MainActivity                        │
│                    (ViewPager2)                           │
│  ┌──────────────────────┐  ┌──────────────────────────┐ │
│  │   MonkeyFragment     │  │     WifiFragment          │ │
│  │   选应用→设参→开始    │  │   设参数→开始→看统计     │ │
│  └────────┬─────────────┘  └──────────┬───────────────┘ │
│           │                            │                  │
│  ┌────────▼─────────────┐  ┌──────────▼───────────────┐ │
│  │   MonkeyService      │  │   WifiTestService         │ │
│  │   (Foreground)        │  │   (Foreground, 开机自启) │ │
│  └────────┬─────────────┘  └──────────┬───────────────┘ │
│           │                            │                  │
│  ┌────────▼────────────────────────────▼───────────────┐ │
│  │                  共用层                              │ │
│  │  SystemCommandExecutor / ScreenshotHelper           │ │
│  │  SelinuxHelper / LockScreenHelper                  │ │
│  │  HtmlReportGenerator / PersistenceManager          │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ★ 所有组件以 system UID 运行，直接调用 Framework API    │
│    或 Runtime.exec() 系统二进制，无需 su                 │
└──────────────────────────────────────────────────────────┘
```

---

# 第二部分：Monkey 测试模块

## 1. 功能需求

### 1.1 测试前：选择目标

| 需求项 | 说明 |
|--------|------|
| 显示已安装应用列表 | `PackageManager.getInstalledApplications()` 获取包名 + 图标 + 应用名 |
| 搜索过滤 | 支持按包名或应用名模糊搜索 |
| **指定 Activity（v2 新增）** | 可选填目标 Activity 的完整类名。不填则对整个应用做随机测试。填入后 monkey 只操作该 Activity，适合聚焦测试某个页面 |
| 多选排队 | 支持一次选多个应用，按顺序依次测试 |

### 1.2 测试前：设置参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| 事件总次数 | 整数 | 10000 | monkey 执行的总事件数 |
| 事件间隔（ms） | 整数 | 200 | 两次随机操作之间的延迟 |
| 随机种子（seed） | 整数 | 随机 | 同一 seed + 同一参数 = 可精确复现。**这是复现 bug 的关键，不要丢！** |
| 目标 Activity | 字符串 | 空（整个应用） | 如 `com.example.MainActivity`。monkey 会加 `-c android.intent.category.LAUNCHER` 等参数约束 |
| 事件类型占比 | - | 触摸70% / 滑动15% / 按键10% / 其他5% | 映射表见下方，**所有值加起来必须等于 100** |

**事件类型 → monkey 参数映射表**：

| UI 分类 | monkey 参数 | 默认值 | 实际注入的行为 |
|---------|-----------|--------|--------------|
| 触摸 | `--pct-touch` | 70 | 点击、长按等触屏操作 |
| 滑动 | `--pct-motion` | 15 | 上下左右滑动手势 |
| 按键 | `--pct-syskeys` | 10 | 系统按键（Home、Back、音量等） |
| 其他 | `--pct-anyevent` | 5 | 任何未分类事件（轨迹球、导航等） |

> **实现注意**：UI 上不需要展示 `--pct` 参数名，但拼装命令时必须严格按上表映射。pct 总和 ≠ 100 时 monkey 拒绝执行。建议 UI 上加一个实时求和显示，超 100 时红色警告。

| 超时时间（秒） | 整数 | 600 | 单个应用最多跑多久，超时强杀 |
| 忽略崩溃 | 开关 | 关闭 | 开启 → `--ignore-crashes`，遇到 crash 继续跑 |
| 忽略 ANR | 开关 | 关闭 | 开启 → `--ignore-timeouts` |

### 1.3 v3.0 关键变更：Monkey 命令不再需要 su

monkey 二进制位于 `/system/bin/monkey`，需要 `INJECT_EVENTS` 和 `RETRIEVE_WINDOW_CONTENT` 权限——两者均为 signature 级。APK 以 system UID 运行后，**直接 `Runtime.exec("monkey ...")` 即可执行**，不再需要 `su -c` 前缀。

同样，`logcat` 需要 `READ_LOGS` 权限（signature 级，system UID 拥有），`screencap` 需要 `CAPTURE_VIDEO_OUTPUT` / `CAPTURE_SECURE_VIDEO_OUTPUT` 权限（system UID 拥有）。

### 1.4 测试执行

```
用户点"开始"
    ↓
①  SelinuxHelper.getMode() → 状态显示在 UI 上（纯信息提示，不阻塞流程）
    system UID 在 Enforcing 模式下的 sepolicy 权限已足够，不需要切 Permissive
    ↓
②  启动 MonkeyService（Foreground，通知栏"Monkey 测试中..."）
    ↓
③  循环处理每个选中的应用：
    ↓
    ├─ 拼装 monkey 命令（★ 不加 su -c）
    │   Runtime.exec("monkey -p <包名> -v -v --throttle <间隔> [--pct-xxx <n>...] <事件数>")
    │   指定 Activity：追加 -c android.intent.category.LAUNCHER
    │
    ├─ 启动 logcat 后台抓取（★ 不加 su -c，READ_LOGS 权限即可）
    │   Runtime.exec("logcat -v threadtime *:E")
    │
    ├─ 执行 monkey 命令 → 实时分析 stdout
    │   检测 CRASH / ANR / Exception / aborted / Application Not Responding
    │
    ├─ 每检测到一个崩溃 → ScreenshotHelper.capture() 自动截图
    │   ★ 两种实现路径（见第四部分 ScreenshotHelper 说明）：
    │   路径A: SurfaceControl.screenshot() (Android 9+, 隐藏 API)
    │   路径B: Runtime.exec("screencap -p <path>") (system UID 可直接执行)
    │
    ├─ 记录详细信息：
    │   - 崩溃时正在执行第几个事件
    │   - 事件类型与坐标
    │   - 异常类型与堆栈
    │   - 关联的 logcat 上下文（前后各 50 行）
    │   - 截图文件路径
    │
    └─ 清理被测进程（★ 不再用 kill 命令）：
        ActivityManager.forceStopPackage(pkg)  // FORCE_STOP_PACKAGES 是 signature 级
    ↓
④  全部跑完 → 生成 HTML 报告 → 通知栏"测试完成" → 点击跳转 ReportViewActivity
```

### 1.5 Monkey 输出解析规则

| 输出关键字 | 含义 | 处理 |
|-----------|------|------|
| `Events injected: N` | 实际注入事件数 | 提取 N，与期望对比 |
| `// CRASH: com.xxx (pid N)` | 应用崩溃 | **标记为失败**，提取崩溃详情 |
| `// NOT RESPONDING: com.xxx` | 应用无响应（ANR） | **标记为失败** |
| `** Monkey aborted due to error` | monkey 被异常中断 | 记录中断原因 |
| `** System appears to have crashed at event N` | 系统级崩溃 | 记录崩溃位置 |
| `:Dropped: keys=N pointers=N` | 被丢弃的事件 | 比例过高说明系统负载大 |

### 1.6 报告生成

**格式**：单个 HTML 文件，内嵌 CSS。

**内容**：

```
┌──────────────────────────────────────────────┐
│  Monkey 测试报告                              │
│  生成时间：2026-05-28 14:30:00                │
│  设备型号：Xiaomi 14 / Android 14 / uid=system │
├──────────────────────────────────────────────┤
│                                             │
│  【汇总摘要】                                 │
│  ┌──────────┬────────┬────────┬────────────┐ │
│  │ 应用名称  │ 事件数  │ 结果   │ 崩溃次数    │ │
│  ├──────────┼────────┼────────┼────────────┤ │
│  │ 微信     │ 10000  │ ❌失败  │ 2          │ │
│  │ 支付宝   │ 10000  │ ✅通过  │ 0          │ │
│  └──────────┴────────┴────────┴────────────┘ │
│                                             │
│  【详细日志 — 微信】                           │
│  ● 崩溃 #1                                   │
│    - 触发事件：第 3421 个（触摸，坐标 320,540） │
│    - 异常类型：java.lang.NullPointerException  │
│    - 堆栈：(点击展开)                          │
│    - logcat：(点击展开)                        │
│    - 📸 截图：screenshots/xxx_crash_1.png     │
│                                             │
│  【事件统计】                                  │
│  触摸: 7050 (70.5%) / 滑动: 1420 (14.2%)      │
│  按键: 1000 (10.0%) / 其他: 530 (5.3%)        │
│                                             │
│  【参数回放】                                  │
│  → monkey -p com.tencent.mm \                │
│    -v -v --throttle 200 -s 42 10000          │
└──────────────────────────────────────────────┘
```

---

# 第三部分：WiFi 重启循环测试模块

## 1. 核心流程（v3.0 重写）

> **v3.0 全部操作走 Framework API + signature 权限，不再使用任何 shell 命令操作 WiFi。**

```
用户点"开始测试"
    ↓
①  ★ 关闭锁屏（使用 signature 权限，不再需要 shell 命令）
    LockScreenHelper.clearLock()           ← 通过 LockPatternUtils 反射清除锁屏
    LockScreenHelper.disableLockScreen()   ← WRITE_SECURE_SETTINGS 直接写 settings
    ↓
②  记录状态到文件：currentCycle=0, shouldContinue=true
    ↓
③  执行重启：PowerManager.reboot(null)   ← android.permission.REBOOT (signature 级)
    ↓
④  设备重启 → Android 系统发送 BOOT_COMPLETED 广播
    ↓
⑤  BootReceiver 收到广播 → 启动 WifiTestService
    （同时 JobScheduler 启动延迟任务作为兜底——见下方"开机自启的双重保险"说明）
    ↓
⑥  等待 X 秒（可配置，默认 45 秒，让系统/WiFi 驱动初始化完毕）
    ↓
⑦  WifiChecker.check() 执行 WiFi 检查（全部用 WifiManager API，见下方）
    ↓
⑧  追加结果到 results.csv（含 signalDbm）
    更新 status.json：currentCycle += 1
    ↓
⑨  判断：
    ├─ currentCycle >= maxCycles → 停止，生成 HTML 报告，通知栏"完成"
    ├─ stop.flag 文件存在 → 停止
    ├─ 连续失败 >= maxConsecutiveFailures 次 → 停止，通知"疑似 WiFi 硬件故障"
    └─ 否则 → 等 5 秒 → 回到 ③（再次重启）
```

### 1.1 锁屏问题（v3.0 改用 signature API）

v2.x 通过 `su -c "locksettings clear"` + `su -c "settings put secure lock_screen_disabled 1"` 处理。v3.0 改用系统签名权限直接操作：

**方案一：反射 LockPatternUtils（推荐）**

```kotlin
object LockScreenHelper {
    /**
     * 清除锁屏密码/PIN/图案
     * 需要 SET_LOCK_SCREEN_DISABLED / MANAGE_DEVICE_ADMINS 权限（signature 级）
     */
    fun clearLock(context: Context) {
        try {
            // 反射 com.android.internal.widget.LockPatternUtils
            val lockPatternUtils = Class.forName(
                "com.android.internal.widget.LockPatternUtils"
            ).getConstructor(Context::class.java).newInstance(context)

            // 清除当前用户的锁屏凭据
            val userId = android.os.Process.myUserId()
            val clearMethod = lockPatternUtils.javaClass.getMethod(
                "clearLock", ByteArray::class.java, Int::class.javaPrimitiveType
            )
            clearMethod.invoke(lockPatternUtils, null, userId)
        } catch (e: Exception) {
            // 没设过锁屏时 no-op，不报错
        }
    }

    /**
     * 禁用锁屏 —— 直接写入安全设置
     * 需要 WRITE_SECURE_SETTINGS 权限（signature 级，system UID 拥有）
     */
    fun disableLockScreen(context: Context) {
        android.provider.Settings.Secure.putInt(
            context.contentResolver,
            "lock_screen_disabled", 1  // 注意 key 不带 "secure" 命名空间前缀
        )
    }
}
```

> `lock_screen_disabled` 重启后依然有效（写入 Settings 数据库）。两条操作叠加覆盖绝大多数情况。

**方案二（如果方案一在某些 Android 版本失效）：仍可回退到 shell 命令**

```kotlin
fun clearLockFallback() {
    // system UID 可直接执行 locksettings 二进制（不需要 su）
    // locksettings 在 AOSP 中是 shell command，system 进程有执行权限
    Runtime.getRuntime().exec("locksettings clear --old user-provided-pin")
}
```

注意：`locksettings clear` 在 Android 8+ 需要提供一个凭据参数（`--old` 或 `--current` 等），不同版本参数名不同。这也是推荐优先用方案一（反射 API）的原因。

### 1.2 开机自启的双重保险

```
BOOT_COMPLETED 广播发出
    │
    ├──→ [路径A] BootReceiver.onReceive()
    │        ↓ 收到广播，立刻启动 WifiTestService
    │        ⚠ 国产 ROM 可能拦截此路径，但 system UID 的 receiver 被拦截概率远低于普通 app
    │
    └──→ [路径B] JobScheduler 兜底
             ↓ 开机时已 schedule 了一个延迟 60 秒的 Job
             ↓ Job 触发时检查 status.json：
             │  - 如果 WifiTestService 已经在运行（路径A成功）→ 什么都不做
             │  - 如果 WifiTestService 没在运行（路径A被拦截）→ 启动 Service
             │
             ✅ system UID 的 JobScheduler 绝大多数 ROM 不会拦截
```

**v3.0 变化**：system UID 的 `BroadcastReceiver` 在国产 ROM 中的存活率显著高于普通 app，双重保险的可靠性大幅提升。但仍保留 JobScheduler 兜底以应对极端情况。

## 2. WiFi 检查实现（v3.0 全部用 WifiManager API）

### 2.0 核心思路：system UID 绕过 WifiManager 的第三方调用限制

Android 10+ 对 `WifiManager` 的部分方法加了**调用者检查**——第三方 app 不能调用 `setWifiEnabled()`、`startScan()` 等。但 system UID (`android.uid.system`) 的进程不受这些限制。

此外，`WifiManager` 有大量隐藏 API（如 `connect(int networkId, ActionListener listener)`、`save(WifiConfiguration config, ActionListener listener)`），system UID 可直接调用。

### 2.1 统一路径：Framework API（v3.0，不再区分 Android 版本）

```
function checkWiFi_v3():
    wifiManager = context.getSystemService(Context.WIFI_SERVICE)
    connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE)

    // ① 打开 WiFi
    //    ★ system UID 绕过 Android 10+ 禁止第三方调用的限制
    if (!wifiManager.isWifiEnabled()) {
        wifiManager.setWifiEnabled(true)
        sleep(5000)
    }

    // ② 扫描
    //    ★ system UID 不需要 ACCESS_FINE_LOCATION 权限
    //    ★ Android 10+ 的第三方限制不适用
    wifiManager.startScan()
    sleep(10000)
    results = wifiManager.getScanResults()  // 隐藏限制：Android 10+ 第三方调用受限，system UID 豁免

    if results == null or results.isEmpty():
        return Result(success=false, reason="WiFi 扫描列表为空")

    ssidList = results.map { it.SSID }
    signalDbm = null

    if targetSsid == null:
        return Result(success=true, ssidCount=ssidList.size())

    // ③ 连接目标 WiFi（★ 用隐藏 API 构造 WifiConfiguration，不依赖已保存网络）
    //    注意：WifiConfiguration 需通过反射创建，AOSP 内部类路径可能因版本而异
    val config = WifiConfiguration()  // 或通过反射: Class.forName("android.net.wifi.WifiConfiguration")
    config.SSID = "\"${targetSsid}\""
    config.preSharedKey = "\"${targetPassword}\""
    config.allowedKeyManagement.set(WifiConfiguration.KeyMgmt.WPA2_PSK)

    // connect() 是隐藏 API，需要反射调用或编译时引用 stubbed android.jar
    // system UID 权限下也可以走 save + enableNetwork
    val addResult = wifiManager.addNetwork(config)  // ★ 隐藏 API，返回 networkId
    if addResult == -1:
        return Result(success=false, reason="addNetwork 失败：WiFi 配置创建失败")

    // ④ 连接 & 启用以太网
    wifiManager.disconnect()  // 断开当前连接
    wifiManager.enableNetwork(addResult, true)
    wifiManager.reconnect()
    sleep(10000)

    // ⑤ 验证连接状态
    wifiInfo = wifiManager.connectionInfo
    connected = wifiInfo?.ssid != null && wifiInfo.ssid.contains(targetSsid)
    signalDbm = wifiInfo?.rssi  // 信号强度（dBm）

    // ⑥ 清理：忘记网络（通过反射调 removeNetwork）
    wifiManager.disableNetwork(addResult)
    // removeNetwork 是隐藏 API → 反射调用
    val removeMethod = wifiManager.javaClass.getMethod("removeNetwork", Int::class.javaPrimitiveType)
    removeMethod.invoke(wifiManager, addResult)
    wifiManager.saveConfiguration()  // 也是隐藏 API，持久化配置变更

    return Result(success=true, ssidCount=ssidList.size(),
                  signalDbm=signalDbm, connectOk=connected)
```

> **隐藏 API 说明**：`addNetwork(config)`、`removeNetwork(id)`、`saveConfiguration()` 是 `@hide` 方法、`connect()` 的带 listener 重载也是隐藏的。实际开发中有两种方式调用：
> 1. **编译时**：从 AOSP 拉一份完整的 `framework.jar`，放到项目 `libs/` 下并 `compileOnly`，gradle 编译通过
> 2. **运行时**：通过 Java 反射调用（兼容性好但代码冗长）
>
> 推荐编译时方案，维护性更好。

### 2.2 兼容性回退：仍保留 shell 命令备选

虽然 Framework API 是主力方案，但在某些重度定制 ROM 上隐藏 API 行为可能有差异。此时可降级为直接执行系统命令（不加 `su -c`）：

```kotlin
fun checkWiFi_Fallback():
    // ★ 不加 su -c，system UID 足以执行这些命令
    Runtime.getRuntime().exec("svc wifi enable")
    Runtime.getRuntime().exec("cmd wifi start-scan")
    scanOutput = getCmdOutput("cmd wifi list-scan-results")
    // ... 解析输出（和 v2 的 Root 方案类似，但去掉了 su）
    Runtime.getRuntime().exec("cmd wifi connect-network $ssid wpa2 $password")
```

system UID 在 shell 中对应 `uid=1000` (system)，shell 环境下的 sepolicy 域是 `system_server` 或 `system_app`，拥有足够的权限执行 wifi 相关命令。

### 2.3 操作速查表（v3.0 全部 Framework API 映射）

| 操作 | v2.x (Root) | v3.0 (System Signature) | 权限来源 |
|------|-------------|------------------------|---------|
| 打开 WiFi | `su -c "svc wifi enable"` | `WifiManager.setWifiEnabled(true)` | `CHANGE_WIFI_STATE` + system UID 豁免 |
| 关闭 WiFi | `su -c "svc wifi disable"` | `WifiManager.setWifiEnabled(false)` | 同上 |
| 扫描 | `su -c "cmd wifi start-scan"` | `WifiManager.startScan()` | system UID 绕过第三方限制 |
| 列出扫描结果 | `su -c "cmd wifi list-scan-results"` | `WifiManager.getScanResults()` | 无需位置权限 (system UID) |
| 添加网络 | `su -c "wpa_cli -i wlan0 add_network ..."` | `WifiManager.addNetwork(WifiConfiguration)` | 隐藏 API，system UID 可调用 |
| 连接网络 | `su -c "cmd wifi connect-network ..."` | `WifiManager.enableNetwork(id, true)` + `reconnect()` | system UID |
| 断开连接 | `su -c "cmd wifi disconnect"` | `WifiManager.disconnect()` | system UID |
| 删除网络 | — | `WifiManager.removeNetwork(id)` (反射) | 隐藏 API |
| 查看状态 | `su -c "dumpsys wifi \| grep Wi-Fi"` | `WifiManager.connectionInfo` | `ACCESS_WIFI_STATE` |
| 信号强度 | `su -c "dumpsys wifi \| grep RSSI"` | `WifiManager.connectionInfo.rssi` | `ACCESS_WIFI_STATE` |
| 重启 | `su -c "reboot"` | `PowerManager.reboot(null)` | `REBOOT` (signature 级) |
| 清除锁屏 | `su -c "locksettings clear"` | 反射 `LockPatternUtils.clearLock()` | `SET_LOCK_SCREEN_DISABLED` (signature) |
| 禁用锁屏 | `su -c "settings put secure lock_screen_disabled 1"` | `Settings.Secure.putInt("lock_screen_disabled", 1)` | `WRITE_SECURE_SETTINGS` (signature) |
| 截图 | `su -c "screencap -p <path>"` | `SurfaceControl.screenshot()` (反射) 或 `Runtime.exec("screencap -p ...")` | `CAPTURE_VIDEO_OUTPUT` (signature) |

### 2.4 关于位置权限（v3.0 简化）

**结论：不需要了。**

`ACCESS_FINE_LOCATION` 目前在 v3.0 中**不再需要在 Manifest 中声明**。原因：

- system UID 的进程调用 `WifiManager.getScanResults()` 绕过 Android 10+ 引入的调用者检查（该检查通过 `AppOpsManager.noteOp()` 实现，检查的是调用者是否有 COARSE/FINE location 的 AppOps 权限）
- `WifiManager.startScan()` 同样对 system UID 豁免第三方限制
- system 进程的 `isSystem()` 返回 true，Framework 内部大量 `if (isSystem()) return true` 的短路逻辑

> 如果项目**同时也需要支持非系统签名模式的部署**（作为回退兼容），则需要保留 `ACCESS_FINE_LOCATION` 声明。当前 v3.0 设计为纯系统签名方案，故移除。

## 3. 状态持久化（不变）

### 3.1 文件结构

```
/sdcard/APKTestTools/WiFiTest/
├── status.json          # 当前状态
├── results.csv          # 每次循环的结果
├── test_report.html     # 测试完成后自动生成的 HTML 报告
└── stop.flag            # 紧急停止标记（空文件，存在即停）
```

> **v3.0 说明**：system UID 进程对 `/sdcard/` （FUSE/exFAT）有完整读写权限，且不受 Android 10+ Scoped Storage 限制（`Environment.isExternalStorageManager()` 对 system UID 也返回 true）。不需要 `MANAGE_EXTERNAL_STORAGE` 权限引导。

### 3.2 status.json

```json
{
    "shouldContinue": true,
    "currentCycle": 37,
    "maxCycles": 500,
    "maxConsecutiveFailures": 3,
    "startTime": "2026-05-28 14:30:00",
    "targetSsid": "TestWiFi-5G",
    "delaySeconds": 45
}
```

> **密码不落盘**（不变）：`targetPassword` 不写入 status.json，仅存 WifiTestService 内存。重启后 Service 重建，密码从持久化的 `targetPasswordHash`（可选增强安全）或用户重新输入中恢复。但实际上 system UID 的 WifiTestService 可直接通过 `WifiManager.addNetwork()` 构造连接配置（指定 SSID + PSK），不需要"已保存过的网络"。

### 3.3 results.csv

```csv
cycle,time,scanOk,ssidCount,connectOk,signalDbm,success,detail
1,14:32:15,true,5,true,-45,true,
2,14:34:30,true,3,false,-72,false,连接超时(30秒)
3,14:36:45,false,0,false,,false,WifiManager.getScanResults 返回空
4,14:39:00,true,5,true,-51,true,
```

### 3.4 写入安全策略（不变）

```
function safeWrite(filePath, content):
    tmpPath = filePath + ".tmp"
    File(tmpPath).writeText(content)
    FileOutputStream(tmpPath).fd.sync()
    File(tmpPath).renameTo(File(filePath))
    File(filePath).parentFile?.let { FileOutputStream(it).fd.sync() }
```

## 4. 停止机制（三层保险）

| 层级 | 方式 | 触发条件 |
|------|------|---------|
| 第一层 | 达到设定次数 | `currentCycle >= maxCycles` |
| 第二层 | `stop.flag` 文件存在 | 每次开机检查 |
| 第三层 | 安全模式（按住音量下开机） | 最终逃生手段 |

另：每次重启前预留 **5 秒窗口**，够用户在通知栏点"停止"或通过 adb 删 `stop.flag`。

## 5. 特殊场景处理

| 场景 | 处理方式 |
|------|---------|
| 电池没电自动关机 | 插电开机后 Service 从上次的 `currentCycle` 继续（不重置为 0） |
| 系统更新重启 | 同上 |
| 连续失败 | 次数达到 `maxConsecutiveFailures`（UI 可配，默认 3）→ **自动停止**，通知栏"疑似 WiFi 硬件故障" |
| 锁屏密码阻止自启 | 启动测试时通过反射 `LockPatternUtils.clearLock()` + `Settings.Secure` 写入 `lock_screen_disabled`。UI 上同时提示"测试前请关闭锁屏" |
| 存储空间不足 | results.csv 约 200 字节/行，1000 次 = 200KB，基本不会出问题 |
| SELinux = Enforcing | **不需要修改**。system 进程 sepolicy 足够。UI 上仅显示状态（信息提示） |
| WiFi 驱动初始化慢 | 等待时间可配置（默认 45 秒），不同设备可调 |
| 国产 ROM 拦截广播 | system UID 的 receiver 存活率远高于普通 app。JobScheduler 兜底延迟 60 秒 |

## 6. HTML 报告（v2 已有，不变）

WiFi 测试完成后同样生成 HTML 报告，内容包括：

```
┌──────────────────────────────────────────────┐
│  WiFi 重启循环测试报告                         │
│  测试时间：2026-05-28 14:30 → 05-29 09:15     │
│  设备型号 / Android 版本 / uid=system          │
├──────────────────────────────────────────────┤
│                                             │
│  【汇总】                                     │
│  总循环次数：500                              │
│  成功：483 次  (96.6%)                        │
│  失败： 17 次  (3.4%)                         │
│                                             │
│  【失败趋势】                                  │
│  (简单的 ASCII 时间轴，标记失败点)              │
│  14:30 |████████████░░░░░░░░░░░░░░░░░|        │
│        #34❌         #178❌  #201❌   #489❌    │
│  → 失败无明显聚集趋势，属于偶发故障             │
│                                             │
│  【失败详情】                                  │
│  #34  14:58  scanOk=false  "scan-results 为空" │
│  #178 16:42  signalDbm=-88  信号过弱导致超时   │
│  ...                                        │
│                                             │
│  【信号强度分布】                              │
│  -40~-49dBm: ████████████████ (60%)          │
│  -50~-59dBm: ██████████ (30%)               │
│  -60~-69dBm: ████ (8%)                      │
│  -70~-79dBm: █ (2%)                         │
│  -80+     : ▌ (<1%) ← 这几次容易失败          │
│                                             │
│  【参数】                                     │
│  目标 SSID / 延迟时间 / 总循环数               │
└──────────────────────────────────────────────┘
```

---

# 第四部分：共用模块说明

## 1. SystemCommandExecutor（★ 替代 RootExecutor）

```kotlin
/**
 * 系统命令执行器 —— v3.0 替代 RootExecutor
 *
 * 核心差异：不加 "su -c" 前缀。因为 APK 以 system UID 运行，
 * 直接 Runtime.exec() 执行系统二进制即可，命令自然获得 system 权限。
 */
class SystemCommandExecutor(
    val command: String,
    val timeoutMs: Long = 60000
) {
    data class Result(
        val stdout: String,
        val stderr: String,
        val exitCode: Int,
        val timedOut: Boolean
    )

    fun execute(): Result {
        // 1. Runtime.exec(command)  ← ★ 没有 su
        // 2. 两个线程分别读 stdout / stderr（防止缓冲区满死锁）
        // 3. process.waitFor(timeoutMs)
        // 4. 超时 → process.destroy() → timedOut = true
        // 5. 组装 Result 返回
    }
}
```

**可执行的命令（不加 su）**：monkey、screencap、logcat、svc（部分）、dumpsys、reboot、settings、locksettings 等。几乎所有 `/system/bin/` 下的二进制都可以由 system UID 进程直接调用。

## 2. SelinuxHelper（v3.0 简化：仅检测）

```kotlin
object SelinuxHelper {
    /**
     * 读取 SELinux 状态
     * system UID 可以读取 /sys/fs/selinux/enforce
     */
    fun getMode(): String {
        return try {
            val file = java.io.File("/sys/fs/selinux/enforce")
            val value = file.readText().trim()
            if (value == "1") "Enforcing" else "Permissive"
        } catch (e: Exception) {
            // readText 可能因 sepolicy 拒绝读文件而失败
            // 回退：读 /sys/fs/selinux/enforce
            val result = SystemCommandExecutor("getenforce").execute()
            result.stdout.trim()
        }
    }

    fun isEnforcing(): Boolean = getMode() == "Enforcing"

    /**
     * v3.0 不再弹窗引导用户切 Permissive。
     * system UID 进程在 Enforcing 下的 sepolicy 权限已经足够，
     * 不需要修改 SELinux 模式。
     */
    fun getStatusText(): String {
        return "SELinux: ${getMode()}（system UID，无需切换）"
    }
}
```

## 3. ScreenshotHelper（v3.0 双路径）

```kotlin
object ScreenshotHelper {
    /**
     * 路径A：SurfaceControl.screenshot() (Android 9+)
     *   - 隐藏 API，需要反射或 stubbed framework.jar
     *   - system UID 下 CAPTURE_VIDEO_OUTPUT 权限自动持有
     *   - 优点：纯 Java，可写文件到任意路径
     */
    fun captureViaScreenshot(savePath: String): Boolean {
        return try {
            val surfaceControlClass = Class.forName("android.view.SurfaceControl")
            val screenshotMethod = surfaceControlClass.getMethod("screenshot",
                android.graphics.Rect::class.java,
                Int::class.javaPrimitiveType,
                Int::class.javaPrimitiveType,
                Int::class.javaPrimitiveType
            )
            val bitmap = screenshotMethod.invoke(null, null,
                getScreenWidth(), getScreenHeight(), 0) as android.graphics.Bitmap

            java.io.FileOutputStream(savePath).use { out ->
                bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, out)
            }
            bitmap.recycle()
            true
        } catch (e: Exception) {
            false  // → 降级到路径B
        }
    }

    /**
     * 路径B：screencap 系统二进制
     *   - system UID 直接 Runtime.exec 执行，无需 su
     *   - 全 Android 版本兼容
     */
    fun captureViaScreencap(savePath: String): Boolean {
        val result = SystemCommandExecutor("screencap -p $savePath").execute()
        return result.exitCode == 0
    }

    /** 组合调用 */
    fun capture(savePath: String): Boolean {
        java.io.File(savePath).parentFile?.mkdirs()
        return if (android.os.Build.VERSION.SDK_INT >= 28) {
            captureViaScreenshot(savePath) || captureViaScreencap(savePath)
        } else {
            captureViaScreencap(savePath)
        }
    }
}
```

`/sdcard/APKTestTools/MonkeyReports/screenshots/` 目录下按 `<包名>_crash_<序号>.png` 命名。

## 4. LockScreenHelper（★ v3.0 新增）

```kotlin
object LockScreenHelper {

    /**
     * 清除锁屏凭据（密码/PIN/图案）
     * 需要 SET_LOCK_SCREEN_DISABLED 权限（signature 级）
     */
    fun clearLock(context: Context): Boolean {
        return try {
            val lockPatternUtilsClass = Class.forName(
                "com.android.internal.widget.LockPatternUtils"
            )
            val lpu = lockPatternUtilsClass.getConstructor(Context::class.java)
                .newInstance(context)

            val userId = android.os.Process.myUserId()

            // Android 7~9: clearLock(byte[] savedCredential, int userHandle)
            // Android 10+: clearLock(byte[] credential, int userId)
            val clearMethod = lockPatternUtilsClass.getMethod(
                "clearLock", ByteArray::class.java, Int::class.javaPrimitiveType
            )
            clearMethod.invoke(lpu, null, userId)
            true
        } catch (e: Exception) {
            false
        }
    }

    /**
     * 禁用锁屏
     * 需要 WRITE_SECURE_SETTINGS 权限（signature 级）
     */
    fun disableLockScreen(context: Context): Boolean {
        return try {
            android.provider.Settings.Secure.putInt(
                context.contentResolver,
                "lock_screen_disabled", 1
            )
            true
        } catch (e: Exception) {
            false
        }
    }

    /**
     * 组合调用：启动测试前调用
     */
    fun prepareForTest(context: Context): Boolean {
        val lockCleared = clearLock(context)
        val lockDisabled = disableLockScreen(context)
        return lockCleared || lockDisabled  // 至少一个成功
    }
}
```

> 如果 `LockPatternUtils.clearLock()` 因为 Android 版本差异而反射失败，降级方案是直接用 `SystemCommandExecutor("locksettings clear --old null")`（system UID 执行的 shell 命令，不需要 su）。

## 5. NotificationPermissionHelper（不变）

Android 13+ `POST_NOTIFICATIONS` 是运行时权限。即使 system UID 进程也需要动态申请：

```kotlin
object NotificationPermissionHelper {
    fun ensureNotificationPermission(activity: Activity) {
        if (Build.VERSION.SDK_INT >= 33) {
            if (ActivityCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
                activity.requestPermissions(
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS), 200
                )
            }
        }
    }
}
```

## 6. 存储权限说明（v3.0 大幅简化）

**v3.0 不需要 StoragePermissionHelper。** 原因：

- system UID 进程的 `isSystem()` 返回 true
- Android 10+ Scoped Storage 的 `Environment.isExternalStorageManager()` 检查中，system UID 被自动认定为"已授权"
- `/sdcard/` 基于 FUSE 文件系统，system_app sepolicy 域有 `fuse_file` 的读写权限
- 不需要 `MANAGE_EXTERNAL_STORAGE`、`WRITE_EXTERNAL_STORAGE`、`requestLegacyExternalStorage` 等权限

> **例外**：如果设备使用了非标准的 `/sdcard/` 实现（如某些厂商的私有存储方案），文件写入路径可能需要适配。此时可改用应用内部存储 `context.filesDir` 或 `/data/system/apk_test_tools/` (需要 system 权限创建目录)。

## 7. 启动时的检查链（v3.0 更新）

```
MainActivity.onCreate()
    │
    ├── ① SelinuxHelper.getStatusText() → UI 显示状态（纯信息）
    ├── ② NotificationPermissionHelper.ensureNotificationPermission() → Android 13+
    ├── ③ 检查是否为系统应用：
    │      val uid = android.os.Process.myUid()
    │      val isSystem = (uid == android.os.Process.SYSTEM_UID)  // 1000
    │      if (!isSystem) → Toast "需要系统签名（uid=1000），当前 uid=$uid" 并退出
    └── ④ 全部就绪 → 按钮可用
```

---

# 第五部分：UI 设计

## 1. 首页（不变）

```
┌─────────────────────────────────┐
│  APK 测试工具                    │
├─────────────────────────────────┤
│  [ Monkey 测试 ] [ WiFi 重启测试 ]│  ← TabLayout
├─────────────────────────────────┤
│                                 │
│  (根据选中的 Tab 加载对应的       │
│   Fragment，下方内容切换)        │
│                                 │
└─────────────────────────────────┘
```

## 2. Monkey Tab

同 v2 设计，SELinux 状态按以下文字显示：

- 绿色 `system UID (uid=1000) ✓` — 表示已获得系统权限
- 红色 `非系统应用 (uid=XXXXX) ✗` — 表示签名错误，要求重新部署

## 3. WiFi 重启测试 Tab

```
┌────────────────────────────────────────────┐
│  WiFi 重启循环测试                          │
│  ⓘ 本测试将反复重启设备                     │
│     以验证 WiFi 模块稳定性                  │
│  ⚠ 测试前请关闭锁屏密码！                   │
│     （APP 会自动清除，但建议手动确认）        │
├────────────────────────────────────────────┤
│                                            │
│  运行模式: 🟢 system UID (uid=1000)         │
│                                            │
│  重启次数：      [  500  ]                 │
│  开机等待：      [   45   ] 秒             │
│  连续失败上限：  [    3   ] 次（达上限自停） │
│                                            │
│  ═══ WiFi 连接测试（可选） ═══              │
│  WiFi名称： [ TestWiFi-5G ] (不填则只测扫描)│
│  WiFi密码： [ ********    ]                │
│     ℹ️ 密码仅存内存，不写入文件。            │
│     连接通过 WifiManager API 完成。         │
│                                            │
│  ┌──────────────────────────────────┐      │
│  │       开 始 测 试                 │      │
│  │  （点击后将清除锁屏并立即重启）    │      │
│  └──────────────────────────────────┘      │
│  ┌──────────────────────────────────┐      │
│  │       停 止 测 试                 │      │
│  └──────────────────────────────────┘      │
│                                            │
│  ── 当前进度 ──                             │
│  已完成：37 / 500                          │
│  成功：  35 次  (94.6%)                    │
│  失败：   2 次                              │
│  连续失败：0 次                             │
│  开始时间：2026-05-28 14:30                 │
│                                            │
│  ── 最近结果 ──                             │
│  #35 ✅ 14:10  5个网络, -45dBm              │
│  #36 ❌ 14:12  列表为空                     │
│  #37 ✅ 14:15  4个网络, -51dBm              │
│                                            │
│  [导出 HTML 报告]  [查看全部日志]           │
└────────────────────────────────────────────┘
```

---

# 第六部分：Android 权限与清单声明

```xml
<!-- AndroidManifest.xml 关键声明 (v3.0) -->

<!-- ★ 核心：声明 sharedUserId 为 android.uid.system，进程将以 system UID 运行 -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.apktesttools"
    android:sharedUserId="android.uid.system"
    coreApp="true">

    <!-- 前台服务 -->
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <!-- 注意：Android 13+ POST_NOTIFICATIONS 是运行时权限，需要动态申请（system UID 也不能跳过） -->

    <!-- WiFi 操作 -->
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
    <uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.CHANGE_NETWORK_STATE" />
    <uses-permission android:name="android.permission.INTERNET" />

    <!-- ★ v3.0 移除：ACCESS_FINE_LOCATION（system UID 不需要位置权限即可获取 WiFi 扫描结果） -->

    <!-- 开机自启 -->
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />

    <!-- ★ v3.0 新增：系统级权限（均为 signature 级，system UID 自动持有） -->
    <!-- 重启设备 -->
    <uses-permission android:name="android.permission.REBOOT" />
    <!-- 读系统日志 -->
    <uses-permission android:name="android.permission.READ_LOGS" />
    <!-- 强制停止应用 -->
    <uses-permission android:name="android.permission.FORCE_STOP_PACKAGES" />
    <!-- 写安全设置（禁用锁屏用） -->
    <uses-permission android:name="android.permission.WRITE_SECURE_SETTINGS" />
    <!-- 清除/禁用锁屏 -->
    <uses-permission android:name="android.permission.SET_LOCK_SCREEN_DISABLED" />
    <!-- 系统 dump（调试用） -->
    <uses-permission android:name="android.permission.DUMP" />
    <!-- 注入事件（monkey 需要） -->
    <uses-permission android:name="android.permission.INJECT_EVENTS" />
    <!-- 截图 -->
    <uses-permission android:name="android.permission.CAPTURE_VIDEO_OUTPUT" />
    <uses-permission android:name="android.permission.CAPTURE_SECURE_VIDEO_OUTPUT" />

    <!-- ★ v3.0 移除：MANAGE_EXTERNAL_STORAGE / WRITE_EXTERNAL_STORAGE
         system UID 不受 Scoped Storage 限制 -->

    <!-- 防止休眠 -->
    <uses-permission android:name="android.permission.WAKE_LOCK" />

    <application
        android:persistent="true">  <!-- ★ system 应用建议设为 persistent，减少被杀概率 -->

        <!-- Monkey 测试 Service -->
        <service android:name=".monkey.MonkeyService"
            android:foregroundServiceType="specialUse"
            android:exported="false">
            <property
                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
                android:value="automated_monkey_testing" />
        </service>

        <!-- WiFi 测试 Service -->
        <service android:name=".wifi.WifiTestService"
            android:foregroundServiceType="specialUse"
            android:exported="false">
            <property
                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
                android:value="automated_wifi_stability_testing" />
        </service>

        <!-- JobScheduler 兜底 Service -->
        <service android:name=".wifi.BootCheckJobService"
            android:permission="android.permission.BIND_JOB_SERVICE"
            android:exported="true" />

        <!-- 开机广播接收器 -->
        <receiver android:name=".wifi.BootReceiver"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
            </intent-filter>
        </receiver>
    </application>
</manifest>
```

> **关键声明说明**：
> - `android:sharedUserId="android.uid.system"` — 使 APK 以 system UID (1000) 运行，这是整个方案的基础
> - `coreApp="true"` — 标记为核心系统应用，降低被 ActivityManager 回收的概率
> - `android:persistent="true"` — 系统启动时自动启动该应用（注意：这会导致 Application.onCreate 在 BOOT_COMPLETED 之前被调用，但 Service 仍然需要广播触发）

---

# 第七部分：部署指南（★ v3.0 新增）

## 1. 签名材料准备

需要从 AOSP 编译产物（或设备厂商提供）获取以下文件：

| 文件 | 说明 | 典型路径 |
|------|------|---------|
| `platform.pk8` | 平台私钥（DER 格式） | `build/target/product/security/platform.pk8` |
| `platform.x509.pem` | 平台证书（PEM 格式） | `build/target/product/security/platform.x509.pem` |

## 2. 签名流程

### 步骤 1：用平台证书给 APK 签名

```bash
# 方法A：使用 signapk.jar（AOSP 自带）
java -jar out/host/linux-x86/framework/signapk.jar \
    platform.x509.pem platform.pk8 \
    app-debug.apk app-signed.apk

# 方法B：使用 apksigner（Android SDK 工具，需要先转换 key 格式）
openssl pkcs8 -in platform.pk8 -inform DER -outform PEM -out platform.pem -nocrypt
openssl pkcs12 -export -in platform.x509.pem -inkey platform.pem \
    -out platform.p12 -password pass:android -name platform

keytool -importkeystore \
    -destkeystore platform.keystore -deststorepass android \
    -srckeystore platform.p12 -srcstoretype PKCS12 -srcstorepass android

apksigner sign --ks platform.keystore --ks-pass pass:android \
    --ks-key-alias platform app-debug.apk
```

### 步骤 2：安装到系统分区

```bash
# 推送到设备系统分区
adb root                              # ★ 需要 root 或 unlocked bootloader
adb remount                           # 重新挂载 system 为可读写
adb push app-signed.apk /system/priv-app/APKTestTools/APKTestTools.apk
adb reboot
```

### 步骤 3：验证

重启后检查 APK 是否正确以 system UID 运行：

```bash
adb shell ps -A | grep apktesttools
# 应该看到 uid=1000 (system)
# 例如: system    12345  ...  com.example.apktesttools
```

或在 APP 内部日志输出 `android.os.Process.myUid()` → 应为 `1000`。

## 3. 预置方案（OEM 配合）

如果设备是 OEM 定制的，可以直接在 AOSP 源码树中集成：

```
AOSP_SOURCE/
├── packages/apps/APKTestTools/        # ← 放在这里
│   ├── Android.mk 或 Android.bp
│   ├── app-signed.apk
│   └── ...
└── device/<vendor>/<product>/
    └── product_packages.mk
        PRODUCT_PACKAGES += APKTestTools
```

这样编译系统镜像时自动打包，ROM 自带。

## 4. 非 userdebug 设备的注意事项

| 设备类型 | 能否部署 | 说明 |
|---------|---------|------|
| **userdebug / eng 固件** | ✅ 可以 | `adb remount` 可用，直接 push |
| **user 固件 + unlocked bootloader** | ✅ 可以 | 通过 `fastboot flash system` 刷入修改过的 system.img |
| **user 固件 + locked bootloader** | ❌ 不能 | 无法修改系统分区，需要 OEM 预置 |
| **模拟器** | ✅ 可以 | 模拟器默认是 userdebug |
| **Treble GSI** | ✅ 可以 | GSI 本身可被替换为加入 APK 的版本 |

---

# 第八部分：已知限制与风险（v3.0 更新）

| 限制/风险 | 影响 | 缓解措施 |
|-----------|------|---------|
| **必须平台证书签名** | 无法像普通 APP 一样安装使用 | 需要 OEM 配合或 AOSP 编译环境。部署指南见第七部分 |
| **SELinux Enforcing** | system 进程有足够的 sepolicy 权限，**不需要改** | UI 上显示 SELinux 状态作为参考（信息提示），不要求用户修改 |
| **隐藏 API 兼容性** | 不同 Android 版本/厂商的隐藏 API 可能有差异 | 反射调用时 catch exception；每个隐藏 API 保留降级路径（SystemCommandExecutor） |
| **锁屏阻止 BOOT_COMPLETED** | 有锁屏密码时重启后广播可能不触发 | LockScreenHelper 通过反射 LockPatternUtils + WRITE_SECURE_SETTINGS 自动清除 |
| **厂商修改 WifiManager 行为** | 部分 ROM 可能修改了隐藏 API 的实现，导致调用的返回值异常 | 保留 shell 命令降级路径（`Runtime.exec("cmd wifi ...")`），system UID 也够权限 |
| **国产 ROM 自启动管理** | BOOT_COMPLETED 广播可能被拦截（system UID 下发生率显著降低） | JobScheduler 60 秒延迟兜底 + `android:persistent="true"` |
| **Android 版本碎片化** | 隐藏 API 签名可能因版本而异 | 每个反射调用点做 SDK_INT 判断；编译时用对应版本 AOSP 的 framework.jar |
| **BOOT_COMPLETED 需要首次手动打开** | 刚部署完未启动过的 APP 不会收到广播 | 部署脚本自动调 `adb shell am start -n com.example.apktesttools/.MainActivity` 触发首次启动 |
| **monkey 可能搞死被测设备** | 如果不小心把 monkey 对准了 system_server 或 launcher | 应用列表过滤掉系统关键进程（用 FLAG_SYSTEM 标识过滤） |
| **WiFi 密码安全** | 明文密码在内存中可能被 dump | 密码不写入任何文件，仅存 Service 内存。system UID 进程的内存已需要 root/adb 才能读取 |
| **getConfiguredNetworks 已废弃** | Android 10+ 返回空 | v3.0 统一用 `addNetwork(WifiConfiguration)` 构造，不依赖 `configuredNetworks` |
| **addNetwork 等隐藏 API 未在 SDK 中公开** | 编译可能报找不到符号 | 从 AOSP 提取完整 `framework.jar` 放在 `libs/` 目录，`compileOnly` 引用 |
| **PowerManager.reboot() 可能被厂商拦截** | 部分 ROM 定制了 PowerManager | 回退：`SystemCommandExecutor("reboot").execute()`（system UID 可直接执行）|

---

# 第九部分：v2.x → v3.0 迁移清单

| v2.x (Root) 组件/概念 | v3.0 (System Signature) 对应 |
|---|---|
| `RootExecutor.execute("su")` | `SystemCommandExecutor.execute(command)` — 去掉 `su -c` |
| `su -c "monkey ..."` | `Runtime.exec("monkey ...")` — monkey 是 system 二进制 |
| `su -c "svc wifi enable"` | `wifiManager.setWifiEnabled(true)` |
| `su -c "cmd wifi start-scan"` | `wifiManager.startScan()` |
| `su -c "cmd wifi list-scan-results"` | `wifiManager.getScanResults()` |
| `su -c "cmd wifi connect-network ..."` | `wifiManager.enableNetwork(netId, true)` + `reconnect()` |
| `su -c "wpa_cli -i wlan0 ..."` | `wifiManager.addNetwork(WifiConfiguration)` — 不再需要 wpa_cli |
| `su -c "dumpsys wifi \| grep RSSI"` | `wifiManager.connectionInfo.rssi` |
| `su -c "reboot"` | `powerManager.reboot(null)` |
| `su -c "locksettings clear"` | 反射 `LockPatternUtils.clearLock(null, userId)` |
| `su -c "settings put secure lock_screen_disabled 1"` | `Settings.Secure.putInt(resolver, "lock_screen_disabled", 1)` |
| `su -c "screencap -p <path>"` | `SurfaceControl.screenshot()` (反射) 或 `Runtime.exec("screencap -p ...")` |
| `su -c "logcat -v threadtime *:E"` | `Runtime.exec("logcat -v threadtime *:E")` — READ_LOGS 权限 |
| `su -c kill <pid>` | `ActivityManager.forceStopPackage(pkg)` |
| `su -c "getenforce"` | 读 `/sys/fs/selinux/enforce` |
| `StoragePermissionHelper` | 移除 — system UID 不受 Scoped Storage 限制 |
| 启动时 Root 检测 (`id` 输出含 `uid=0`) | 启动时 UID 检测 (`Process.myUid()` == `1000`) |
| 普通 APK 安装 | 平台证书签名 + push 到 `/system/priv-app/` |

---

# 附：UI 文案规范

所有对外显示的文案中：

- ✅ 用"**重启循环测试**"，不用"关机测试"
- ✅ 用"**重启次数**"，不用"关机次数"
- ✅ 按钮文案"开始测试（点击后设备将立即重启）"——给用户明确的预期
- ✅ 通知栏文案"WiFi 重启测试中 · 第 37/500 次"——清晰标识当前进度
- ✅ 权限状态显示"系统应用 (uid=1000)"——表明以 system UID 运行
- ✅ 移除所有 "Root 权限" 相关提示文案
