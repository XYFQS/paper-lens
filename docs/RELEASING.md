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
| `dist/paper-lens-2.0.0.xpi`        | 用户直接安装的插件包        |
| `dist/paper-lens-2.0.0-source.zip` | 完整源码与文档              |
| `dist/SHA256SUMS.txt`              | 两个压缩包的 SHA-256 校验值 |

文件名里的版本号取自 `addon/manifest.json`，改完版本号后表格这两行要同步更新。`dist/` 被 Git 忽略，因此 VS Code 同步源码不会上传安装包。这三个文件应作为 Release 附件上传。

打包脚本会先删除 `dist/` 中此前的 `paper-lens-*.xpi` 和 `*.zip`，避免误传旧版本。

## 2. 创建 Release

1. 打开仓库的 **Releases**，点击 **Draft a new release**（首次可能显示 **Create a new release**）。
2. 在 **Choose a tag** 中创建 `v2.0.0`，**Target** 选择刚推送源码所在的分支。仓库早期标签 `V1.0.0` 用的是大写，从 `v1.0.1` 起改用小写 `v`，后续保持小写。
3. 标题填写 `文献透镜 Paper Lens v2.0.0`，填写下方发布说明。
4. 将 `dist/` 中上述三个文件拖入附件上传区，等待上传完成。
5. 正式版不勾选 **This is a pre-release**；检查内容后点击 **Publish release**。需要暂存时选 **Save draft**。

步骤依据 [GitHub 官方 Release 管理指南](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)。

可直接使用的发布说明：

```markdown
文献透镜 2.0.0，支持 Windows / Zotero 9.0.6。

关键词从三类扩展为六类，新增文献身份证、人工校正和按维度检索。文献身份证现在是一张干净的信息卡片，只有点“编辑”才会展开控件。

新增

- 六类中英关键词：主题、区域、对象、方法、数据、变量，每类最多 5 个，中英文成对生成。信息不足时该类为空，不猜测、不凑数。
- 主要结论：只从标题、摘要或明确的元数据提取，最多 3 条。
- 文献身份证：搜索页内显示选中论文的记忆句、研究画像、结论和文献管理字段，默认是一张只有文字的信息卡片，不再是独立的第四个页面。
- 记忆句：自动生成“作者 年份 | 期刊 | 区域 | 方法 | 结论”，可手动改写或恢复自动生成，不额外调用 AI。
- 阅读进度与用途：阅读状态、重要程度、在论文中的用途，完全由你设置，AI 不会判断。
- 人工校正：停用不准确的 AI 关键词，或补充自己的中英配对；AI 重新生成后仍然有效。
- 十二个检索维度：条目类型、六类关键词、年份、期刊、阅读进度、重要程度、用途。

变化

- 文献身份证改为默认信息卡片：日常视图里没有输入框、删除按钮和维护动作，只有点“编辑”才展开，点“完成”收起。信息顺序固定为论文基本信息 → 记忆句 → 研究画像 → 主要结论 → 文献管理。
- 六个关键词类别共用同一套添加控件；人工改动存在时才显示“恢复 AI 原始画像”。
- 顶部页面改为“找文献 / 文库 / 设置”，“准备文库”并入“文库”。
- 原生标签改为英文规范前缀 T:: R:: O:: M:: D:: V::，写入为 Zotero 自动标签，只保留一套英文命名。
- 旧的“研究区域：中国”式标签会自动替换为规范形式，只处理插件自己创建的标签。

升级

首次读取文献信息时自动升级索引，并在同一目录写入 index-v1-backup.json 备份。原有的研究区域、研究对象、研究方法关键词会保留，主题、数据、变量三类为空并提示重新生成。文献信息与人工标签不受影响，无需任何手动操作。

修复

- 文献身份证中的下拉框和用途标签选择后偶发回退到原值。
- 会议论文与书籍章节的期刊字段现在也会参与记忆句和检索。

安装：下载 paper-lens-2.0.0.xpi，在 Zotero 中选择“工具 → 插件 → 齿轮 → 从文件安装插件”。无需解压。

不读取 PDF 全文，不推测论文结果，不移动文献，不管理文献分类；生成画像需自备 API Key，可能产生服务商费用。
当前版本需手动下载安装更新。
```

## 3. 发布后检查

在 Release 的 **Assets** 中确认能下载 `.xpi`。GitHub 自动附带的 **Source code (zip)** 和 **Source code (tar.gz)** 是标签对应的仓库源码，不能直接安装到 Zotero，见 [GitHub 关于 Release 的说明](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)。

下载一次上传的 `.xpi`，确认安装后版本正确，并用一个已有 1.x 索引的文库确认首次读取时会生成 `index-v1-backup.json` 且关键词保留。向用户分享 [Releases 页面](https://github.com/XYFQS/paper-lens/releases) 即可。

## 后续版本

更新 `addon/manifest.json` 和 `package.json` 的版本号，在 `CHANGELOG.md` 增加对应条目，完成测试、提交推送、重新打包，再创建对应标签及 Release，例如 `2.0.1` / `v2.0.1`。已经发布过的版本号不再复用。

当前 `manifest.json` 的 `update_url` 是占位地址，发布 Release 不会自动启用 Zotero 插件更新。自动更新需要另行配置更新清单和真实地址；配置前继续使用手动安装新版 `.xpi` 的方式。
