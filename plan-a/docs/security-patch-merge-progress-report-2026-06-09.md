# 安全补丁合入进度报告 - 2026-06-09

## 一、总体状态

截至 2026-06-09 16:10，本轮安全补丁合入已完成 V 项目的 build 日期更新、V vendor MTK 覆盖模块合入以及 V MSSI 编译验证。S 项目的 build 日期已更新，S MGK 正在编译中，MGVI/VEXT/PAC 尚未完成。

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| V build 安全补丁日期 | 已完成 | 已更新为 2026-05-05 |
| S build 安全补丁日期 | 已完成 | 已更新为 2026-05-05 |
| V vendor MTK 覆盖模块 | 已完成 | 28 个文件，覆盖 8 个模块 |
| V vendor 编译修复 | 已完成 | 修复 Bluetooth fmt/RawAddress 编译问题 |
| V MSSI 编译 | 已通过 | sys_images 编译成功，用时约 16 分钟 |
| S MGK 编译 | 进行中 | 已绕过 setlocalversion/git status 卡死问题 |
| S MGVI 编译 | 待启动 | 正确目标为 hal_mgvi_64_armv82-userdebug |
| S VEXT 编译 | 待启动 | 正确目标为 vext_k6789v1_64-userdebug |
| PAC 打包 | 待启动 | 需按 S 实际产物路径修正参数 |
| S vendor backport | 待评估/待执行 | Android 12 与 Android 15 vendor 结构差异大，不能直接套 V patch |

## 二、仓库修改汇总

| 仓库 | 路径 | 分支 | 本地提交 | 说明 |
| --- | --- | --- | --- | --- |
| V build | `/raid0/liuwenxi/gms/mt6789_v_v16/build` | `patch_security` | `b8f5611` | 安全补丁日期改为 2026-05-05 |
| S build | `/raid0/liuwenxi/gms/mt6789_s_v16/build` | `patch_security` | `8b8fcb7` | 安全补丁日期改为 2026-05-05 |
| V vendor | `/raid0/liuwenxi/gms/mt6789_v_v16/vendor` | `patch_security` | `c3e44a1bc4`, `da28dceb3d` | MTK 覆盖模块补丁及编译修复 |
| zlt build | `/raid0/liuwenxi/gms/codex_zlt_worktrees/build_zlt` | `codex_dk075b_zlt_build` | `fb66914` | zlt 临时分支日期同步 |
| zlt vendor | `/raid0/liuwenxi/gms/codex_zlt_worktrees/vendor_zlt` | `codex_dk075b_zlt_vendor` | `425a2914cb` | V vendor patch 来源临时分支 |

所有修改均为本地提交，未 push 到远程。

## 三、安全补丁日期

### V 项目 Android 15

以下 3 个文件均已更新为 `2026-05-05`：

| 文件 | 当前值 |
| --- | --- |
| `release/flag_declarations/RELEASE_PLATFORM_SECURITY_PATCH.textproto` | `string_value: "2026-05-05"` |
| `release/flag_values/ap2a/RELEASE_PLATFORM_SECURITY_PATCH.textproto` | `string_value: "2026-05-05"` |
| `release/flag_values/ap3a/RELEASE_PLATFORM_SECURITY_PATCH.textproto` | `string_value: "2026-05-05"` |

### S 项目 Android 12

| 文件 | 当前值 |
| --- | --- |
| `build/make/core/version_defaults.mk` | `PLATFORM_SECURITY_PATCH := 2026-05-05` |

## 四、V vendor MTK 覆盖模块合入情况

V vendor 已完成 MTK 覆盖模块安全补丁合入，共 2 个本地提交：

- `c3e44a1bc4` - `Merge security fixes into MTK vendor packages`
  - 28 个文件，约 +448/-93 行
- `da28dceb3d` - `fix: fmt format RawAddress`
  - 1 个文件，约 +2/-2 行
  - 用 `ADDRESS_TO_LOGGABLE_CSTR()` 适配 MTK fmt 库无法直接格式化 `RawAddress` 的问题

覆盖模块如下：

| 模块 | 文件数 | 说明 |
| --- | ---: | --- |
| Launcher3 | 3 | quickstep 安全路径增强 |
| MtkSettings | 8 | NFC 支付、Settings Slice、通知历史隐私、配置及测试 |
| SystemUI | 5 | AIDL 接口、隐私图标控制器、OverviewProxyService、通知行隐私动画及测试 |
| Bluetooth | 4 | BLE 加密、ACL、L2CAP、SMP 安全修复 |
| TelephonyProvider | 2 | MMS 路径规范化及测试 |
| Mms | 4 | 下载请求用户校验、PDU 写入及测试 |
| Telecomm | 1 | CallRedirection unbind 异常处理 |
| Telephony | 1 | FDN 联系人 URI 权限校验 |

说明：`vendor` 仓库中原本存在的 `blackview/`、`partner_gms/` 无关脏改动未处理、未提交、未回退。本次只提交了 `mediatek/proprietary/packages/...` 安全补丁相关文件。

## 五、V 编译验证

| 项目 | 结果 |
| --- | --- |
| target | `sys_mssi_MEGA_3_NEU-next-userdebug` |
| OUT_DIR | `out_sys` |
| 目标 | `sys_images` |
| 结果 | 编译成功 |
| 用时 | 约 15:56 |
| 产物 | `out_sys/target/product/mssi_MEGA_3_NEU/images/sys.target_files.zip` |
| 日志 | `build_mssi_20260609_1430.log` |

首轮编译发现 `btm_ble_sec.cc` 中新增日志直接传入 `RawAddress`，MTK 当前 fmt 库没有对应 formatter。已改为项目中既有的 `ADDRESS_TO_LOGGABLE_CSTR()` 写法，并重新编译通过。

## 六、S vendor backport 评估

S 项目不能直接套用 V vendor 的 28 文件 patch。原因是 S 为 Android 12，V 为 Android 15，两者 vendor 覆盖方式、Bluetooth 栈和部分 framework API 均不同。

| 模块 | 评估 | 说明 |
| --- | --- | --- |
| Launcher3 | 需手工适配 | quickstep API 差异较大 |
| MtkSettings | 部分可 backport | SettingsSliceProvider、NotificationStation 逻辑较接近；Payment/DefaultPayment 存在 API 差异 |
| SystemUI | 部分适用 | AIDL、OverviewProxyService、ExpandableNotificationRow 可评估；HeaderPrivacyIconsController 在 S 中不存在 |
| Bluetooth | 不可直接套用 | V 使用 `packages/modules/Bluetooth`，S 使用 `system/bt` Fluoride 栈 |
| TelephonyProvider | 可 backport 评估 | MMS 路径规范化逻辑需逐行对比 |
| Mms | 可手工 backport | callingUser 用户校验在 A12 可实现 |
| Telecomm | 可 backport | `unbindService` try-catch 简单直接 |
| Telephony | 需适配 | `ComponentCaller` 为高版本 API，S 中需改为 Binder/calling uid 方式 |

已确认 S 中缺失的修补项包括：

- `CallRedirectionProcessor.java` 缺少 `IllegalArgumentException` try-catch
- `MmsService.java` 缺少 `callingUser` / `getUserIdFromUri` 用户校验
- `DownloadRequest.java` 缺少 `mCallingUser` 字段
- `SettingsSliceProvider.java` 缺少 `Build.IS_DEBUGGABLE` 开发者白名单控制

S vendor 后续需要按补丁意图逐文件 backport，不能按 V patch 自动套用。

## 七、S MGK 编译问题诊断

S MGK 目标：`krn_mgk_64_entry_level_k510-userdebug`

MGK 多次卡在 kernel 模块构建阶段，进程链路定位到：

```text
build.sh -> make -> Makefile.modpost -> scripts/setlocalversion -> git status
```

`kernel-5.10/scripts/setlocalversion` 会调用：

```text
git --no-optional-locks status -uno --porcelain
```

服务器上存在其他用户遗留的长时间卡死 git 进程，导致 `setlocalversion` 在多个模块构建时陷入等待。已将 `setlocalversion` 临时替换为 no-op，并保留备份：

```text
kernel-5.10/scripts/setlocalversion.bak
```

说明：

- 此改动是构建环境绕过措施，不是安全补丁内容。
- `setlocalversion` 主要影响 kernel local version 后缀，不影响安全补丁逻辑。
- 编译完成后需要恢复原始文件：

```bash
mv kernel-5.10/scripts/setlocalversion.bak kernel-5.10/scripts/setlocalversion
```

## 八、MGVI/VEXT 目标确认

S repo 中不存在 `hal_mgvi_MEGA_3_NEU-userdebug` 和 `vext_MEGA_3_NEU-userdebug`。

| 来源 | MGVI | VEXT |
| --- | --- | --- |
| `ud-MEGA_3_NEU.sh` | `hal_mgvi_MEGA_3_NEU-userdebug` | `vext_MEGA_3_NEU-userdebug` |
| `zbuild_v3.sh` | `hal_mgvi_64_armv82-userdebug` | `vext_k6789v1_64-userdebug` |
| 实际 lunch 测试 | MEGA_3_NEU product not found | MEGA_3_NEU product not found |
| S device tree | 存在 `mgvi_64_armv82` | 存在 `k6789v1_64` |

结论：S 项目应使用标准 MTK 目标：

```text
MGVI: hal_mgvi_64_armv82-userdebug
VEXT: vext_k6789v1_64-userdebug
```

PAC 打包路径也需按 S 实际产物修正：

```diff
- --vendor-dir ../mt6789_s_v16/out_hal/target/product/mgvi_MEGA_3_NEU/images
+ --vendor-dir ../mt6789_s_v16/out_hal/target/product/mgvi_64_armv82/images

- --vext-dir ../mt6789_s_v16/out/target/product/MEGA_3/images
+ --vext-dir ../mt6789_s_v16/out/target/product/k6789v1_64/images
```

## 九、后续工作

1. 继续等待 S MGK 编译完成。
2. MGK 成功后启动 MGVI：
   - `lunch hal_mgvi_64_armv82-userdebug`
   - `make hal_images`
3. MGVI 成功后启动 VEXT：
   - `lunch vext_k6789v1_64-userdebug`
   - `make vext_images`
4. 按 S 实际产物路径执行 PAC 打包。
5. 恢复 `kernel-5.10/scripts/setlocalversion` 原始文件。
6. 对 S vendor 做逐文件 backport 评估和合入。
7. 完成最终编译和产物路径汇总。

