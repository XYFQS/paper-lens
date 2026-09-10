# 不重新安装的开发预览

正式安装的 XPI 是源码的打包快照，所以直接修改本地源码不会改变已安装的插件。项目提供独立开发加载器，用本地源码启动插件，并在保存后自动重新加载。

## 一键启动

在 VS Code 打开项目根目录 `paper-lens`，按 `Ctrl+Shift+P`，选择“任务: 运行任务”，再选择“文献透镜：开发预览（自动刷新）”。也可以在项目终端执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev.ps1
```

这会启动一个独立 Zotero 开发窗口。首次启动会创建 6 条明确标记为演示的论文元数据，用于检查界面与搜索流程；不是实际出版的文献。不需要额外安装 Node.js 或开发框架。

默认 Zotero 路径是 `D:\zotero\zotero.exe`。其他电脑可指定：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev.ps1 -ZoteroPath "C:\Program Files\Zotero\zotero.exe"
```

## 日常修改

1. 保持开发窗口打开，在 VS Code 修改 `addon/` 内的界面、样式或业务代码。
2. 保存后约 2 秒自动重新加载插件，无需打包或重装 XPI。正在执行任务时，会等任务结束再重新加载。
3. 也可用开发窗口“工具 → 文献透镜开发：重新加载源码”手动刷新。
4. 检查满意后，运行 `scripts/build.ps1`，把新 XPI 用于正式安装或发布。

刷新会恢复当前页面、文献范围和普通搜索文本；未保存的 API 编辑和条件行会重置。修改了 `bootstrap.js` 也会重新加载。`manifest.json` 中的插件身份、版本和兼容性需要通过正式 XPI 验证，开发加载器不会冒充这些安装元数据。

修改 `scripts/dev-loader.js` 或开发启动脚本后，关闭开发窗口并重新运行启动命令。开发加载器本身不热更新自己。

## 数据隔离

开发配置、演示文库与状态日志均位于项目 `.dev/`，已被 Git 忽略，不进入源码包或 XPI。正常 Zotero 的文库、已安装插件和 API 设置不受影响。开发加载器会核对数据目录，不匹配就拒绝运行。

开发窗口中的 API 设置独立，默认不带密钥。只有手动填写 API 并执行生成时才会调用真实服务；预览界面和普通搜索无需 API。

如果保存后没有更新，检查 `.dev/preview-status.json` 的错误信息，以及 `.dev/startup.log`。JavaScript 语法错误会在卸载旧界面前被拦截，修正并保存后会再试一次。需要关闭自动刷新时，关闭开发窗口后使用 `-NoWatch` 重新启动。

## 实现说明

`dev.ps1` 在独立配置中放置一个小型开发加载器。加载器通过 Zotero 的脚本加载接口读取 `addon/`，监听文件时间变化，调用原有的 `shutdown` / `startup` 生命周期；样式在开发模式使用刷新参数。没有把文件监听或开发入口放进正式 XPI。

Zotero 官方开发文档也介绍了[从源码加载插件与独立开发配置](https://www.zotero.org/support/dev/client_coding/plugin_development)。本项目把源码加载、自动刷新和独立数据目录整合到一个启动脚本中。
