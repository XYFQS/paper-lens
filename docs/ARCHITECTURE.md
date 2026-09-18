# 源码结构

插件不依赖前端框架。界面使用 Zotero 的文档对象，业务逻辑与界面分别维护。

数据分三层：`core.js` 是不依赖 Zotero 的纯逻辑，`store.js` 只通过注入的文件接口读写索引，`app.js` 才接触 Zotero 对象。两层纯模块因此可以在 Node 中直接测试，`tests/native.js` 也从仓库目录加载同一份文件，保证两套测试跑的是同一段逻辑。

`ui/workspace.js` 管理共用范围、三个页面（找文献 / 文库 / 设置）的导航和下一步引导；`ui/library-panel.js` 管理读取文献、索引和标签设置；`ui/passport-panel.js` 管理搜索页内的文献身份证。开发预览由 `scripts/dev.ps1` 与 `scripts/dev-loader.js` 实现，详见 [开发文档](DEVELOPMENT.md)。

| 文件                                 | 职责                                                       |
| ------------------------------------ | ---------------------------------------------------------- |
| `addon/bootstrap.js`                 | 插件启动、窗口生命周期与模块加载顺序                       |
| `addon/content/core.js`              | 无 Zotero 依赖的关键词结构、AI 输出校验、搜索匹配与提示词  |
| `addon/content/store.js`             | 索引结构、v1 → v2 迁移、容错修复与原子写入（注入文件接口） |
| `addon/content/app.js`               | 缓存持久化、Zotero 条目操作、API 请求与任务状态            |
| `addon/content/view.js`              | 侧栏框架、表单组件、面板可见性与元数据显示                 |
| `addon/content/ui/workspace.js`      | 共用范围、页面导航、状态灯与下一步引导                     |
| `addon/content/ui/library-panel.js`  | 读取文献、生成画像、标签设置与维护工具                     |
| `addon/content/ui/search-panel.js`   | 可折叠搜索表单、条件行与搜索动作                           |
| `addon/content/ui/passport-panel.js` | 文献身份证：默认信息卡片，点「编辑」才展开控件             |
| `addon/content/ui/api-panel.js`      | API 配置的编辑、保存、锁定与连接测试                       |
| `addon/content/ui/sidebar-toggle.js` | 文库和阅读器原生导航栏中的显示/隐藏按钮                    |
| `addon/content/style.css`            | 自然有机风样式、窄侧栏适配及交互状态                       |
| `addon/content/icons/paper-lens.png` | 从用户提供的 `plot/plot1.png` 原样复制的插件图标           |
| `tests/`                             | 纯逻辑测试与独立 Zotero 文库集成测试                       |
| `scripts/`                           | 打包、测试准备与本机模拟 API                               |

界面模块导出明确命名的方法，在创建 `LensView` 前组合到其原型。它们共用表单构建方法，数据操作统一交给 `PaperLensApp`。导航按钮独立管理，销毁窗口时移除。

## 数据与写入

索引结构为 `{ version: 2, records: { [key]: record } }`。每条记录把三类信息分开存放：

| 字段        | 归属 | 说明                                                     |
| ----------- | ---- | -------------------------------------------------------- |
| `analysis`  | AI   | 状态、六类关键词、结论、模型与生成时间、对应的元数据指纹 |
| `workflow`  | 用户 | 阅读状态、重要程度、用途、记忆句改写                     |
| `manual`    | 用户 | 各类关键词的停用项与新增项                               |
| `ownedTags` | 插件 | 自己写入过的原生标签，删除时的唯一依据                   |

AI 路径只写 `analysis`；界面修改一律经过 `PaperLensApp.edit()`，它负责更新时间、重建检索文本并保存。这样“AI 不判断用途字段”“人工校正不被 AI 覆盖”是由结构保证的，而不是靠约定。`searchText` 只在内存中重建，序列化时会被剥离。

`core.js` 的 `aiInput()` 是发往模型的白名单，只包含题录字段；PDF、附件、笔记正文、分类和本地路径都没有入口。`scripts/mock.cjs` 在收到白名单以外的字段时直接返回 400，让越界在测试中暴露而不是被忽略。

写入使用 `IOUtils.writeUTF8` 的临时文件加改名，读取失败时不覆盖原文件，只另行备份并提示重建缓存。v1 索引在内存中升级，落盘前先把原文件复制为 `index-v1-backup.json`，且已存在的备份不会被再次覆盖。

## 界面约定

样式使用容器查询，面板宽度在 280–650 像素之间自适应：`.pl-panel` 声明 `container: paper-lens / inline-size`，宽于 440 像素时文献身份证唯一的那个关键词表单（`.pl-kw-form`）改为两列，中文与英文并排、类别与按钮横跨整行；窄于 440 像素时为单列。关键词标签在所有宽度下都自动换行。所有断点下都不应出现横向滚动。

文献身份证默认渲染成信息卡片，编辑控件全部带 `hidden`，因此日常视图里没有输入框、没有删除按钮。`renderPassport()` 只切换可见性并替换文本，不重建节点，这样在记忆句或关键词输入框里打字时，后台刷新不会打断输入；焦点落在输入框内时也不会用存储值覆盖它。

会触发重新渲染的控件（下拉框、用途标签）在事件回调开头先取出自己的值，再启动任务。启动任务会刷新状态栏并重新渲染面板，若在渲染之后才读取控件值，会读到被旧数据覆盖的结果。

## 代码格式

JavaScript、CSS、JSON 和 Markdown 使用 Prettier 3.6.2，配置见根目录 `.prettierrc.json`。统一两空格缩进、100 字符建议行宽、UTF-8 和 LF；PowerShell 使用四空格缩进。开发时运行 `npm install` 后可使用：

```sh
npm run format
npm run format:check
npm test
npm run build
```

Prettier 仅是开发工具，不会打入 XPI。安装和运行插件不需要 Node.js 或 npm。
