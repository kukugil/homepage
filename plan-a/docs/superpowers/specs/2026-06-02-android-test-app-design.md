# Android 自动化测试 APP 技术方案

## 1. 概述

系统级 Android 测试应用，内置 Monkey 测试和 WiFi 重启测试两个独立模块。
以平台证书签名，部署到 `/system/priv-app/`，获得 system UID 的所有系统级权限（重启、WiFi 控制、monkey 事件注入）。

技术栈：Kotlin + View-based UI + Coroutines + JobScheduler + WifiManager API

---

## 2. 整体架构

```
com.example.apktester/
├── MainActivity.kt            # 双 Tab 容器 (ViewPager2 + TabLayout)
│
├── monkey/                    # Monkey 测试模块
│   ├── MonkeyFragment.kt      # UI：应用列表多选 + 参数配置
│   ├── MonkeyService.kt       # 前台服务：测试编排
│   ├── MonkeyExecutor.kt      # shell monkey 执行 + 崩溃解析
│   ├── AppScanner.kt          # 扫描已安装可启动应用
│   ├── ForegroundMonitor.kt   # 前台监控协程（防下拉菜单/切出）
│   ├── MonkeyConfig.kt        # 测试参数 data class
│   └── MonkeyResult.kt        # 单应用测试结果 data class
│
├── wifi/                      # WiFi 重启测试模块
│   ├── WifiFragment.kt        # UI：配置 + 实时结果表格
│   ├── WifiTestService.kt     # 前台服务：循环编排 + 状态机
│   ├── WifiChecker.kt         # 扫描 + 连接 + 验证
│   ├── BootReceiver.kt        # 开机广播 → 拉起 WifiTestService
│   ├── WifiTestConfig.kt      # 测试参数 data class
│   └── CycleRecord.kt         # 单次循环结果 data class
│
└── shared/                    # 公共组件
    ├── SystemCmd.kt           # shell 命令执行
    ├── LockScreenHelper.kt    # 解除锁屏
    ├── Persistence.kt         # 文件持久化（WiFi 测试跨重启）
    ├── ReportGenerator.kt     # HTML 报告模板
    └── NotificationHelper.kt  # 通知权限 + 前台通知构建
```

两个测试模块独立运行，各自的前台服务互不干扰。WiFi 测试通过文件持久化状态跨重启保持数据。

---

## 3. Monkey 测试模块

### 3.1 功能

扫描已安装可启动应用 → 用户多选勾选 → 配置 monkey 参数 → 前台服务批量执行 → 崩溃/ANR 检测 → 生成报告。

### 3.2 应用扫描 (AppScanner)

```
pm list packages -3                    → 获取所有第三方应用
→ 过滤出带 LAUNCHER intent-filter 的   → 仅保留可启动应用
→ dumpsys package <pkg>               → 获取应用名称
→ 返回列表供用户多选勾选
```

### 3.3 Monkey 参数 (MonkeyConfig)

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| packageName | String | — | 被测应用包名 |
| appName | String | — | 被测应用显示名 |
| eventCount | Int | 10000 | 注入事件总数 |
| throttleMs | Int | 200 | 事件间隔(ms) |
| seed | Int | 随机 | monkey 种子，用于复现 |
| pctTouch | Int | 85 | 触摸事件比例(%) |
| pctMotion | Int | 5 | 滑动事件比例(%) |
| pctAnyevent | Int | 10 | 其他事件比例(%) |
| timeoutSeconds | Int | 600 | 单应用超时(秒) |
| ignoreCrashes | Boolean | false | 崩溃时是否继续 |

monkey 命令显式禁用导航事件 `--pct-nav 0 --pct-majornav 0 --pct-appswitch 0`，从源头减少被测应用被切出的概率。

### 3.4 单个应用测试流程 (MonkeyExecutor)

```
1. 预授权 (pm grant) — 为被测应用授予常用危险权限，防止 monkey 被权限弹窗卡住
2. 启动应用 — monkey -p xxx -c LAUNCHER 1
3. 启动前台监控协程 (ForegroundMonitor) — 与 monkey 并行运行
4. 执行 monkey — 带 -v -v 标志获取详细输出
5. 解析结果 — 从 stdout 提取崩溃/ANR/注入事件数
6. 停止应用 — am force-stop <pkg>
```

### 3.5 前台监控 (ForegroundMonitor)

与 monkey 主进程并行运行，每 2 秒检测当前前台应用：

| 检测结果 | 判定 | 处理 |
|----------|------|------|
| 前台 = 目标 app | 正常 | 继续监控 |
| 前台 = com.android.systemui | 下拉菜单/通知栏被误触 | `cmd statusbar collapse` 自动收起，不终止 monkey |
| 前台 = 其他 app | 被测 app 被切出 | 前 3 次：`monkey -p xxx -c LAUNCHER 1` 重新拉起；第 4 次：kill monkey，标记 killedByMonitor |

### 3.6 崩溃/ANR 检测

从 monkey `-v -v` 输出解析：

- `// CRASH:` — 应用崩溃（含异常类型 + 30 行堆栈）
- `// NOT RESPONDING:` — ANR
- `** Monkey aborted` — monkey 进程自身异常终止

### 3.7 MonkeyResult 数据结构

```
MonkeyResult:
    packageName:         String
    appName:             String
    eventCountTotal:     Int          # 配置的总事件数
    eventsInjected:      Int          # 实际注入数
    durationMs:          Long         # 耗时
    success:             Boolean      # 无崩溃 + 有事件注入 + 无超时
    crashes:             List<CrashInfo>
    seed:                Int
    killedByMonitor:     Boolean      # 被前台监控终止
    replayCommand:       String       # 回放 monkey 命令
```

### 3.8 报告

测试完成后生成报告页，包含：

- 汇总卡片：被测应用数 / 通过 / 失败 / 崩溃总数 / 总事件注入 / 总耗时
- 结果明细表格：应用名、包名、事件注入率、耗时、崩溃数、通过/失败
- 崩溃详情：每项崩溃的异常类型、事件编号、堆栈
- 回放命令：`adb shell monkey -p xxx -v -v --throttle 200 -s <seed> ...`

---

## 4. WiFi 重启测试模块

### 4.1 测试逻辑

```
重启(开机)
   │
   ▼
系统初始化 (可配, 默认 60s)
   │
   ▼
开启 WiFi → 扫描
   │
   ├─ 扫描正常 (列表非空)
   │    │
   │    ├─ 未指定目标 SSID → PASS (仅验证扫描)
   │    └─ 指定目标 SSID → 连接 → 成功→PASS / 失败→PASS(连接失败但扫描正常不判FAIL)
   │
   └─ 扫描异常 (列表为空)
        │
        ▼
     方案一: 关闭WiFi → 等待(5s) → 重新打开WiFi → 重新扫描
        │
        ├─ 恢复成功 (列表非空) → PASS
        └─ 恢复失败 (列表仍为空) → FAIL
```

### 4.2 状态机

```
BOOT_WAIT  →  SCANNING  →  SCAN_OK  →  CONNECTING  →  CYCLE_DONE
                            ↓
                        SCAN_FAIL
                            ↓
                        PLAN_A_RECOVER
                            ↓
                    ┌───────┴───────┐
                    ↓               ↓
              PLAN_A_OK       PLAN_A_FAIL
                    ↓               ↓
              CONNECTING       CYCLE_FAIL
```

### 4.3 配置参数 (WifiTestConfig)

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| maxCycles | Int | 500 | 最大循环次数 |
| targetSsid | String | "" | 目标 WiFi SSID（空=仅扫描不连接） |
| targetPassword | String | "" | WiFi 密码（仅内存，不写文件） |
| bootWaitSeconds | Int | 60 | 开机后等待系统初始化时间 |
| recoveryWaitSeconds | Int | 5 | 方案一关/开 WiFi 之间的等待 |
| planATimeoutSeconds | Int | 30 | 方案一恢复超时 |

### 4.4 单轮测试流程 (WifiChecker)

```
1. 打开 WiFi (如果未开启)
   - WifiManager.setWifiEnabled(true)
   - 等待 3 秒确认状态
   - 若失败：svc wifi enable 兜底

2. 扫描 WiFi
   - WifiManager.startScan()
   - 等待 3 秒
   - 读取 scanResults
   - 若为空：cmd wifi list-scan-results 兜底

3. 判断扫描结果
   - 列表非空：扫描 OK
   - 列表为空：进入方案一

4. 连接 (仅在扫描 OK 且指定了 targetSsid 时)
   - 查找已保存网络 → 复用 (避免反复 addNetwork/removeNetwork 导致断连)
   - 若未保存 → addNetwork + enableNetwork + reconnect
   - 等待 5 秒 → 验证连接状态 (WifiManager.connectionInfo.ssid)
   - 若 API 返回 <unknown ssid> → cmd wifi status 兜底

5. 方案一 (仅在扫描异常时触发)
   - svc wifi disable
   - 等待 recoveryWaitSeconds 秒
   - svc wifi enable
   - 等待 3 秒
   - 重新扫描
   - 结果决定 PASS/FAIL
```

### 4.5 CycleRecord 数据结构

```
CycleRecord:
    cycle:        Int         # 第几轮
    time:         String      # 检测时间 HH:mm:ss
    scanOk:       Boolean     # 扫描是否正常
    ssidCount:    Int         # 扫描到的网络数
    connectOk:    Boolean?    # 连接目标 WiFi 是否成功 (null=未指定目标)
    signalDbm:    Int         # 信号强度 dBm (0=未记录)
    usedPlanA:    Boolean     # 是否触发了方案一
    planASuccess: Boolean?    # 方案一是否成功 (null=未触发)
    result:       String      # PASS / FAIL
    detail:       String      # 备注说明
```

### 4.6 循环编排 (WifiTestService)

```
runCycle():
    1. 读取持久化状态 (WifiTestConfig + currentCycle + records)
    2. 检查停止条件: shouldContinue=false / stopFlag存在 / 达到maxCycles
    3. 等待 bootWaitSeconds 秒 (开机后系统初始化)
    4. 执行 WifiChecker.check() → 得到 CycleRecord
    5. 追加 record 到持久化文件
    6. 更新通知 + 更新UI (通过 LiveData/Flow)
    7. 判断:
       - 达到 maxCycles → finishTest() 生成报告
       - 收到停止信号 → finishTest() 生成报告
       - 继续 → scheduleNextBoot():
           a. 设置 RTC 闹钟: echo 0 > /sys/class/rtc/rtc0/wakealarm
                            echo +10 > /sys/class/rtc/rtc0/wakealarm
           b. 执行关机: reboot -p
       (RTC 闹钟 + 10 秒后自动唤醒设备 → BootReceiver → WifiTestService → runCycle)
```

### 4.7 跨重启状态持久化

WiFi 测试需在重启后恢复状态。使用文件持久化（system UID 可读写 `/data/user/0/<pkg>/files/`）：

```
WifiTest/files/
├── status.json        # WifiTestConfig + currentCycle + shouldContinue
├── records.jsonl      # 每轮 CycleRecord 追加一行 JSON
└── stop.flag          # 停止信号标记文件
```

- status.json 每轮结束后全量写一次
- records.jsonl 每轮结束后追加一行（追加写，避免内存中保存全部记录）
- stop.flag 用户点击"停止"时创建，下一轮循环检测到后终止

### 4.8 开机自动恢复

```
BootReceiver (BOOT_COMPLETED 广播)
    │
    ├─ 检查 status.json 是否存在且 shouldContinue = true
    │   ├─ 是 → startForegroundService(WifiTestService, ACTION_BOOT_CHECK)
    │   └─ 否 → 不处理
    │
    └─ JobScheduler 兜底（防止 BOOT_COMPLETED 广播延迟/丢失）
        BootCheckJobService: 60-90 秒后检查
```

### 4.9 实时界面表格

WifiFragment 在测试运行中实时展示：

**上方状态栏：**
- 汇总：已完成 N/M 轮 | 通过 X | 失败 Y | 成功率 Z%
- 当前状态：等待开机 / 正在扫描... / 方案一恢复中... / 连接中...

**实时表格：**

| # | 时间 | 扫描 | 网络数 | 连接 | 信号 | 方案一 | 结果 |
|---|------|------|--------|------|------|--------|------|
| 1 | 08:30:15 | ✅ | 12 | ✅ | -45 | — | PASS |
| 2 | 08:35:22 | ✅ | 15 | ❌ | -62 | — | PASS |
| 3 | 08:40:08 | ❌ | 0 | — | — | ✅ 恢复 | PASS |
| 4 | 08:45:31 | ❌ | 0 | — | — | ❌ 失败 | FAIL |

表格下方显示最近 10 轮（自动滚动到最新），完整记录在测试结束后通过报告查看。

---

## 5. WiFi 测试报告

测试完成后生成报告，包含：

- 汇总卡片：总循环次数 / 成功 / 失败 / 成功率 / 方案一触发次数 / 方案一成功率
- WiFi 信号分布柱状图：按 dBm 区间分组（-40~-49, -50~-59, -60~-69, -70~-79, -80+）
- 完整结果表格：全部 CycleRecord 明细
- 失败详情：仅列出 FAIL 的记录，附扫描结果和方案一执行情况
- 设备信息：品牌 + 型号 + API Level

---

## 6. 部署方式

以平台证书签名，安装到 `/system/priv-app/`：

```
1. 准备平台签名 keystore (platform.pk8 + platform.x509.pem)
2. build.gradle 配置 signingConfig 使用 platform keystore
3. AndroidManifest.xml: android:sharedUserId="android.uid.system"
4. gradle task: assemble → 签名 → adb push → /system/priv-app/
5. 修复 SELinux 上下文: chcon u:object_r:system_file:s0
6. 重启设备
```

所需系统级权限（system UID 自动持有）：

| 权限 | 用途 |
|------|------|
| REBOOT | 重启设备 |
| ACCESS_WIFI_STATE / CHANGE_WIFI_STATE | WiFi 扫描/连接 |
| WRITE_SECURE_SETTINGS | 关闭锁屏 |
| INJECT_EVENTS | monkey 事件注入 |
| READ_LOGS | logcat 读取 |
| RECEIVE_BOOT_COMPLETED | 开机自启 |

---

## 7. Monkey 测试报告

包含：

- 汇总卡片：被测应用数 / 通过 / 失败 / 崩溃总数
- 结果明细表格：应用名、包名、事件注入数、耗时、崩溃数、通过/失败
- 崩溃详情：异常类型、堆栈
- 回放命令：`adb shell monkey -p xxx -v -v --throttle 200 -s <seed> ...`
