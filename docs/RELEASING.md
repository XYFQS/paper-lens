# 发布文献透镜到 GitHub

本指南面向项目维护者。普通用户只需从 Releases 下载 `.xpi`，它就是 Zotero 插件安装包。

## 1. 准备源码与安装包

在 VS Code 中提交并推送本次准备发布的源码和文档，确认 GitHub 仓库显示的是这些改动。当前仓库为 [XYFQS/paper-lens](https://github.com/XYFQS/paper-lens)。

在项目根目录运行打包命令（需要 Windows PowerShell，无需额外下载打包软件）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build.ps1
```

当前版本会生成：

| 文件                               | 用途                        |
| ---------------------------------- | --------------------------- |
| `dist/paper-lens-1.0.1.xpi`        | 用户直接安装的插件包        |
| `dist/paper-lens-1.0.1-source.zip` | 完整源码与文档              |
| `dist/SHA256SUMS.txt`              | 两个压缩包的 SHA-256 校验值 |

文件名里的版本号取自 `addon/manifest.json`，改完版本号后表格这两行要同步更新。`dist/` 被 Git 忽略，因此 VS Code 同步源码不会上传安装包。这三个文件应作为 Release 附件上传。

## 2. 创建 Release

1. 打开仓库的 **Releases**，点击 **Draft a new release**（首次可能显示 **Create a new release**）。
2. 在 **Choose a tag** 中创建 `V1.0.1`，**Target** 选择刚推送源码所在的分支。标签沿用已有的 `V1.0.0`，用大写 `V` 保持仓库标签一致。
3. 标题填写 `文献透镜 Paper Lens V1.0.1`，填写下方发布说明。
4. 将 `dist/` 中上述三个文件拖入附件上传区，等待上传完成。
5. 正式版不勾选 **This is a pre-release**；检查内容后点击 **Publish release**。需要暂存时选 **Save draft**。

步骤依据 [GitHub 官方 Release 管理指南](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)。

可直接使用的发布说明：

```markdown
文献透镜 1.0.1，支持 Windows / Zotero 9.0.6。

修复：收起 Zotero 原生条目侧栏后，插件面板与分隔条不再残留，会随原生侧栏一起完全隐藏，展开时恢复。收起状态下点击插件的导航按钮会先展开原生侧栏，之后仍可独立隐藏或恢复插件面板。

- 本地读取与搜索文献元数据。
- AI 生成中英双语研究区域、研究对象、研究方法关键词。
- 支持条目类型与研究关键词组合检索，结果显示在 Zotero 主列表。
- 可选同步 Zotero 原生双语标签。

安装：下载 paper-lens-1.0.1.xpi，在 Zotero 中选择“工具 → 插件 → 齿轮 → 从文件安装插件”。无需解压。

不读取 PDF 全文；生成关键词需自备 API Key，可能产生服务商费用。
当前版本需手动下载安装更新。
```

## 3. 发布后检查

在 Release 的 **Assets** 中确认能下载 `.xpi`。GitHub 自动附带的 **Source code (zip)** 和 **Source code (tar.gz)** 是标签对应的仓库源码，不能直接安装到 Zotero，见 [GitHub 关于 Release 的说明](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)。

下载一次上传的 `.xpi`，确认安装后版本正确。向用户分享 [Releases 页面](https://github.com/XYFQS/paper-lens/releases) 即可。

## 后续版本

更新 `addon/manifest.json` 和 `package.json` 的版本号，完成测试、提交推送、重新打包，再创建对应标签及 Release，例如 `1.0.2` / `V1.0.2`。如果 `V1.0.0` 已正式发布，后续改动应使用新版本号。

当前 `manifest.json` 的 `update_url` 是占位地址，发布 Release 不会自动启用 Zotero 插件更新。自动更新需要另行配置更新清单和真实地址；配置前继续使用手动安装新版 `.xpi` 的方式。
