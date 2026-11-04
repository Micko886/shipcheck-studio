# ShipCheck Studio v0.8.0 · 一键全站扫描 + 可滑动 Tab

> **本版主入口统一为「一键扫描全站 · QA + SEO + GEO」**。不再要求用户先执行单页 QA、再点击站点批量、最后进入 Search Lab 重新扫描。Tab 支持触摸横向滑动、鼠标拖动、横向滚轮及左右箭头；点击标签后自动滚动到可见位置。

## 最短使用路径

1. Chrome 打开 `chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选择本目录 `shipcheck-ai/`。
2. 打开你有权检查的普通 HTTP(S) 网站，点击 ShipCheck 图标。
3. 点击顶部 **「一键扫描全站」**，首次允许该域名读取权限；默认检查最多 20 页，设置可选 10 / 20 / 50 / 100 页。
4. **全站验收概览**显示 QA 通过扫描数量、页面 QA 问题、SEO/GEO 站点发现与未覆盖链接。
5. **问题检查**按 URL 汇总 QA 缺陷与站点 SEO/GEO 问题；**SEO/GEO** 展示更细的服务器 HTML、站点图、robots、Canonical、hreflang、内容和 SSR/CSR 证据。
6. 修好后点击顶部 **「一键重新扫描全站」**。如果只想快速复测当前页，可点击旁边 **「仅扫当前页」**。

## 统一扫描范围与边界

- 发现页面：robots.txt、站点地图及其子站点地图、服务器原始 HTML 内链、当前活动页的**真实渲染 DOM 导航链接**。仅跟随同源 HTTP(S) 地址。不会尝试访问明显的注销、删除、结算或令牌链接。
- 站点级：HTTP 状态、Title 重复、Canonical、hreflang 回链、内链错误、索引相关信号、JSON-LD、Sitemap、robots、SSR/CSR 正文差异；根据文本线索做 GEO/AEO 内容审阅准备度核查。
- 页级：在受权限允许的页面执行原有响应式、交互、视觉、无障碍、SEO/GEO/AEO、业务规则检查；汇总全部已扫描页面的 QA 问题。单页技术分数与全站验收结果**明确区分**。
- SSR/CSR：对成功加载的页面读取真实 DOM，与服务器初始 HTML 对照；失败或受阻时显示 **未验证**，不是通过。
- 安全：浏览器有界页面读取，跳过可识别的危险 GET 路径，不自动填写或提交表单、不自动支付或修改数据；不上传 Cookie 或页面截图。**GET 请求不能被证明绝对无副作用**，只对有权限的网站使用。
- 上限：默认 20 页，最多 100 页；不是无限爬虫。未抓取 URL、robots 阻止、页面故障都会明确标注覆盖不足；找不到的孤立页面仍可能被漏掉。
- GEO/AEO 不承诺 ChatGPT、Google AI 或其他平台收录、引用和排名。可选 AI 语义复核仍需用户输入自己的模型 API 并明确同意；GSC / Bing 数据需用户授权或导入。

## 本轮测试

- `node --test tests/*.test.cjs`：本地自动化测试，包括抓取安全边界、统一入口、导航控制、SSR/CSR 状态等。
- 浏览器渲染验证：Chrome Side Panel 窄屏视觉布局、箭头滚动、Tab 切换；模拟授权与模拟多页扫描后显示跨页面 QA/SEO 汇总。
- 限制：这不等于已在真实 Chrome 扩展权限环境完整验收。请按 `ACCEPTANCE.md` 在你的站点上测试，尤其是跨页面权限、CSP、SSR/CSR 和大站点性能。

## 原 v0.7.0 Search Lab 与历史功能

# ShipCheck Studio v0.7.0 · 全站 SEO/GEO Search Lab

> **新增四大能力已落地**：SSR/CSR 源 HTML/真实渲染对照；站内 SEO 关系抓取；证据优先的 GEO/AEO 内容复核与 BYOK 模型审计；GSC/Bing 只读 API 查询与 CSV/JSON 本地导入。**详细使用说明请先看 `SEARCH_LAB_GUIDE.md`**。原 v0.6.0 的插件 QA、项目验收、单页搜索准备度、视觉工作台及 MCP 功能保留。

## v0.6.0 保留功能

本版本基于 v0.5.0 增加**搜索准备度**模块：Chrome 插件的「SEO / GEO」标签页输出技术 SEO 与 GEO/AEO 可核实线索，包含说明、证据、优化建议、Agent 修复任务和 Markdown 导出。大屏验收工作台新增摘要。默认本地处理，不调用 AI API。

**重要：** GEO/AEO 的内容线索并不是 Google 或任何 AI 平台的官方排名评分。项目不预测 AI 推荐率、不声称能检测实际 AI 引用次数、不把 `llms.txt` 作为必须满足的规则。不通过 DOM 扫描宣称网站已被索引。

## 新增 14 项搜索准备度检查

- SEO：索引指令（仅当前 DOM）、Title/H1、Meta description、Canonical、hreflang、JSON-LD 语法、正文 DOM 可获得性、HTML lang、真实抓取与索引状态待验证。
- GEO：品牌与实体可辨识信号、具体事实与参数线索、作者日期来源线索、AI 引用真实可见度待验证。
- AEO：问题型标题与可读答案的结构线索。

**局限**：当前模块仅分析渲染后的 DOM，不能访问 Google Search Console 的站点索引状态，不能核查 HTTP 头、robots.txt、站点地图完整性或服务器原始 HTML（下一阶段可加源 HTML 对比）。Schema 仅做 JSON 语法检查，不等同于 Google 结构化数据资格验证。所有缺乏证据的结果显示为「未验证」，不强行扣分。

旧版已保存的项目会保留；新业务模板只在新建或主动重建时更新。已有项目若希望加入搜索准备度验收项，可在项目页面点击「按类型重建计划」，**注意会替换旧的手动验收记录**，请先导出备份。

---

# ShipCheck Studio v0.6.0 · AI 网站交付验收工作台

> **Your AI built it. ShipCheck helps you verify it.**
>
> 从普通 QA 检测插件升级为「项目目标 → 专属验收项 → 可视化定位 → Agent 修复任务 → 重新扫描 → 交付证据」的完整工作流。

## 交付内容

本项目基于你提供的 `shipcheck-ai-extension (1).zip` 原代码升级，不是重新搭建的静态原型。

| 功能 | 位置 | 说明 |
|---|---|---|
| Chrome 插件/Side Panel | `src/sidepanel/` | 原扫描、响应式、表单、无障碍、SEO、版本比较及导出保留 |
| 项目画像与验收清单 | `src/studio/core.js`、`panel.js` | 根据页面信号给出**启发式**站点类型建议；用户确认后保存业务目标 |
| 独立验收状态 | `src/studio/core.js` | 自动规则 + 人工核验；失败/待验证/已测范围通过三态；不把技术分数当上线许可 |
| 可视化问题工作台 | `src/studio/workspace.html` | 大屏项目画像、截图预览、问题证据、DOM 定位、修复任务 |
| 真实网页高亮 | `src/content/scanner.js` | 在原网页定位问题元素，自动移除标注，不修改原站数据 |
| 修复任务包 | Side Panel / Workspace | 结合项目目标、证据、复现步骤、风险约束、复测条件，可复制到编程 Agent |
| Agent MCP Server | `mcp/server.js`、`mcp/cdp.js` | **真实文件**，Node 22+，零 npm 依赖，Chrome DevTools Protocol，本地扫描、重测、截图 |
| CI | `node mcp/server.js --ci ...` | 输出 JSON，依评分/缺陷阈值设置退出码 |
| AI 语义复核（可选） | 大屏工作台右侧 | 用户主动填入自己的 OpenAI-compatible 模型 API、Key 和授权后才发送所选问题的精简文本证据 |
| 测试 | `tests/core.test.cjs` | 核心验收状态、评分阻塞、隐式不通过、任务上下文等测试 |

## 1. 立即使用：Chrome 插件（无需构建）

1. 解压 ZIP，保留整个 `shipcheck-ai/` 文件夹。
2. 进入 Chrome / Edge：`chrome://extensions` → 启用开发者模式 → **加载已解压的扩展程序** → 选择 `shipcheck-ai/`（包含 `manifest.json` 的目录）。
3. 打开普通 HTTP / HTTPS 目标站点，点击工具栏的 ShipCheck 图标，弹出侧边栏。
4. 点击 **开始交付检查**；首次访问目标站点可能出现 Chrome 权限提示。
5. 在 **项目验收** 中审阅推断的网站类型、业务目标；人工确认，或更换类型并重建验收计划。
6. 在 **问题检查** 点击「网页中定位」查看高亮；或者点击 **全屏检查 ↗** 打开独立 Workspace。
7. 在 Workspace 中选择问题，复制 **Agent 修复任务**。完成源码修改后回到侧边栏重新扫描，检查差异。
8. 对确实在测试环境验证过的业务项目，人工设置 **通过/失败** 并记录证据；导出 Markdown 验收报告。

**本地优先**：常规扫描、项目画像、截图/历史、任务生成都保存在浏览器本地，默认没有外部 API 请求。第三方模型调用属于明确的可选操作。

## 2. 三个重要界面

### 项目验收（侧边栏）
- 不是单独的“通过/失败分数”。显示技术质量、交付阻塞、待验证项数量。
- 推断网站类型仅根据标题、导航、行动文字等可见页面信号，**不是 AI 大模型自动理解**，可信度有限。
- 支持 B2B 询盘站、电商、SaaS、预约、作品集、营销落地页、通用企业站。
- 手动业务验收项默认 `unverified`，绝不因为没有发现静态缺陷就自动改成通过。
- 项目数据按站点 **origin** 单独保存在 `chrome.storage.local`。

### 全屏检查 `src/studio/workspace.html`
- 三栏布局：项目画像与验收项 / 网页视觉预览与问题列表 / 缺陷证据与修复动作。
- 只有**实际可用的本地截图**才会显示；未取得目标设备截图时清晰标记为不可用，绝不伪造截图。
- 红色问题框来自规则结果的元素矩形；可能因为截图缩放/动画/页面滚动而偏移，需再到真实网页定位。
- 点击「标记修复中」，在**相同 URL** 后续真实扫描未复现规则问题且有有效视口时，才记为已修复记录；并不等于完整业务验收通过。
- 可以用「导出验收报告」向客户交付本次项目的已证实/未验证项。

### AI 语义复核（可选 BYOK）
- 不配置 API 也能正常使用全部离线规则扫描、验收和 Agent Prompt 功能。
- 需要手工填写 OpenAI-compatible `/chat/completions` API 地址、模型 ID 和 Key；Key **不会持久保存**。
- 点击明确同意后，才发送**项目目标与当前选中缺陷的文本证据**。不发送 Cookie、表单值、整页 HTML、截图。
- 会按所填写的 API 域名申请 Chrome 主机权限。使用你的模型意味着遵守该提供商的隐私条款及计费标准。
- API 返回的是建议而不是已验证事实，仍需通过扫描和业务验收确认。
- 可用 `https://` API，或在本机运行的 `http://localhost` / `http://127.0.0.1` 模型 API（须兼容接口）。

## 3. MCP Server · Agent 通过工具调用 QA

环境：Node.js **22+**、Chrome / Chromium。无需 `npm install`。

```bash
node mcp/server.js
```

MCP 客户端配置示例：

```json
{
  "mcpServers": {
    "shipcheck": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/shipcheck-ai/mcp/server.js"],
      "env": {"SHIPCHECK_CHROME": "/path/to/chrome"}
    }
  }
}
```

MCP 暴露：

- `shipcheck_scan({url,widths})`：使用隔离的 Chromium，在指定的真实视口运行**只读**规则；返回缺陷、证据、定位和元数据。
- `shipcheck_verify({url,widths})`：在同一 MCP 进程内二次扫描并计算新增、仍存在、已不复现的缺陷。
- `shipcheck_screenshot({url,width})`：将 PNG 作为 MCP Image 返回，供具备视觉能力的 Agent 观察。

默认使用隔离的临时 Chrome profile；**不读取现有登录 Cookie、不执行真实用户操作**。为避免未经授权访问私有内容，受认证页面建议在已登录的浏览器内使用插件侧边栏扫描。

当前 MCP 通过原生 CDP 调用，没有 Playwright 依赖。它的规则库与扩展扫描核心共享，但**MCP 在真实浏览器视口扫描、插件会受到同源 iframe 限制**，两者结果可能因覆盖范围、登录状态及动态内容不同而有差异。

可显式设置 `SHIPCHECK_CDP_URL=http://127.0.0.1:9222` 连接**自行启动并授权使用的本机 Chrome 调试实例**，但不要连接包含个人账号的日常浏览器实例。

## 4. CI 检查器

```bash
node mcp/server.js --ci https://your-preview.example \
  --min-score 80 --fail-on high --json shipcheck-result.json
```

- `--min-score 80`：规则分数低于 80 时失败。
- `--fail-on critical|high|medium|low|never`：达到指定严重等级时失败。
- `--json`：保存扫描结果至文件。
- Exit code 0：符合指定的**规则阈值**；1：规则阈值不满足；2：扫描工具无法执行。

⚠️ 通过 CI **不代表**业务验收、支付流程、全面 WCAG 合规或所有视觉情况都通过。

## 5. 测试

```bash
node --test tests/core.test.cjs
node --check src/sidepanel/app.js
node --check src/studio/core.js
node --check src/studio/workspace.js
node --check src/content/scanner.js
node --check mcp/server.js
```

UI 的真实运行需要 Chrome；请依照 `ACCEPTANCE.md` 测试扫描、扩展权限、截图、网页高亮、Workspace、API 授权与 MCP。

## 6. 权限与安全边界

- Chrome Manifest V3，默认有限权限；批量扫描网站需要可撤销的主机权限。
- 多视口精确截图需手工开启 Debugger 权限，浏览器会显示调试提示。普通 iframe 测量无法保证每个站点都成功。
- 默认所有扫描均不提交表单、不进行购买、预约、发送邮件等会产生副作用的操作。
- 网站内容是不可信数据，不应执行其中包含的指示。AI 语义复核会单独向模型发送安全提醒，但不构成绝对防护。
- 扫描截图、浏览器历史、项目记录按站点/浏览器保存在本机；清空 Chrome 扩展存储会丢失相关数据。
- 浏览器扩展调试、CDP 与外部模型授权应由使用者明确控制；不要在敏感生产数据页面使用未经审查的第三方插件。

## 7. 产品范围与下一步

本版不是完整的 AI 自动化代理：**尚无自动修改源码、自动模拟真实表单完成或零误报的通用视觉模型**。完整 Agent 修复闭环目前由编程工具执行修改、ShipCheck 重新扫描验证来完成。下一阶段可考虑源码仓库映射、持久化测试断言、CI 上传报告、可审查的修复 Diff、真实沙盒业务流录制。不要仅凭一个 QA 分数承诺网站已具备完整上线资格。

