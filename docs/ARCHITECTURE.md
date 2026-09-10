# 源码结构

插件不依赖前端框架。界面使用 Zotero 的文档对象，业务逻辑与界面分别维护。

`ui/workspace.js` 管理共用范围、页面导航和下一步引导；`ui/library-panel.js` 管理准备文库、索引和标签设置。首次使用进入准备页面，已有索引时默认进入搜索。开发预览由 `scripts/dev.ps1` 与 `scripts/dev-loader.js` 实现，详见 [开发文档](DEVELOPMENT.md)。

| 文件                                 | 职责                                              |
| ------------------------------------ | ------------------------------------------------- |
| `addon/bootstrap.js`                 | 插件启动、窗口生命周期与模块加载顺序              |
| `addon/content/core.js`              | 无 Zotero 依赖的元数据处理、AI 输出校验与搜索匹配 |
| `addon/content/app.js`               | 缓存持久化、Zotero 条目操作、API 请求与任务状态   |
| `addon/content/view.js`              | 侧栏框架、表单组件、元数据和关键词显示            |
| `addon/content/ui/search-panel.js`   | 可折叠搜索表单、条件行与搜索动作                  |
| `addon/content/ui/api-panel.js`      | API 配置的编辑、保存、锁定与连接测试              |
| `addon/content/ui/sidebar-toggle.js` | 文库和阅读器原生导航栏中的显示/隐藏按钮           |
| `addon/content/style.css`            | 自然有机风样式、窄侧栏适配及交互状态              |
| `addon/content/icons/paper-lens.png` | 从用户提供的 `plot/plot1.png` 原样复制的插件图标  |
| `tests/`                             | 纯逻辑测试与独立 Zotero 文库集成测试              |
| `scripts/`                           | 打包、测试准备与本机模拟 API                      |

`search-panel.js` 和 `api-panel.js` 导出明确命名的界面方法，在创建 `LensView` 前组合到其原型。它们共用表单构建方法，数据操作统一交给 `PaperLensApp`。导航按钮独立管理，销毁窗口时移除。

API 锁定状态下，密码输入框仅包含固定掩码，不包含真实密钥。点击“修改 API”后清空掩码；留空保存会保留已有密钥。测试连接仅针对已保存配置。

## 代码格式

JavaScript、CSS、JSON 和 Markdown 使用 Prettier 3.6.2，配置见根目录 `.prettierrc.json`。统一两空格缩进、100 字符建议行宽、UTF-8 和 LF；PowerShell 使用四空格缩进。开发时运行 `npm install` 后可使用：

```sh
npm run format
npm run format:check
npm test
npm run build
```

Prettier 仅是开发工具，不会打入 XPI。安装和运行插件不需要 Node.js 或 npm。
