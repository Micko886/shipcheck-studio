# ShipCheck Studio v0.7.0 · Search Lab 使用与验收

本版在原有 UI / UX / 响应式 / Accessibility / 业务交付 / 单页 SEO-GEO 扫描上，增加 **Search Lab**：有界站点抓取、源 HTML 与真实浏览器渲染差异、站内 SEO 关系、辅助内容分析、平台搜索数据读取。

> 目标：可核实、可复现、能交给编程 Agent 修复的结果。**不预测 SEO 排名、Google 收录率、ChatGPT 推荐概率或 AI 引用数量。**

## 1. Chrome 插件：不需要构建

1. 解压压缩包，进入包含 `manifest.json` 的 `shipcheck-ai` 目录。
2. Chrome → `chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选择该目录。
3. 打开你有权审计的 HTTP(S) 网站，点击扩展图标 → **开始交付检查**。
4. 在 **SEO / GEO** 标签向下找到 **Search Lab / 全站 SEO · GEO 验收**。
5. 检查 URL、设置页面上限（3 / 8 / 15），点击 **开始全站检查**。浏览器会请求这个站点的读取权限。插件只对这个 origin 进行公开内容抓取，不提交表单、不自动购买或发送邮件。
6. 查看页面 HTTP 状态、原始 HTML 可提取内容、已证实的渲染对照、Canonical/hreflang 关系、已抓取内部链接错误、重复 Title 与内容线索。
7. 导出 **JSON / Markdown / Agent 修复任务**。原有侧边栏其它检测功能不变。

**注意：** Chrome 插件仅拿得到当前打开并有权限执行脚本的页面的真实渲染对照；其余页面在源 HTML 抓取后标为「未验证」。如需对多个页面做实际 Chrome 渲染对照，请使用下方的 Node CLI / MCP。

### AI 内容语义复核（可选）

1. 先运行 Search Lab 站点检查。
2. 在 **AI 内容语义复核** 填写你自己拥有的 OpenAI-compatible Chat Completions API URL、模型 ID、API Key、业务目标。
3. 勾选明确授权，点击运行；此时才申请对应 API 域名权限，发送最多 5 页的**公开正文摘录**，而非整站源代码。
4. Key 不写入持久存储，调用结束后从输入框清空。请自行确认模型提供商的收费和隐私条款。
5. 输出只是**审查建议**，不能替代真实业务资料或实际索引数据。

对于登陆态站点，请避免发送私有页面内容；模型提示词不能提供绝对的 Prompt Injection 防护。

### Google / Bing 报表本地导入

- 在 Search Lab 上传从 Search Console 或 Bing Webmaster Tools 导出的 CSV / JSON。
- 页面显示导入行数、点击/曝光及示例行，不调用服务器，也不存储 API Key。
- 如果一个文件混合多个维度（Query + Page + Date），简单累加可能重复。请使用同维度的导出，核实日期范围与平台来源。

## 2. Node CLI · 真正的多页面源 HTML / Chrome 渲染对照

需要 **Node.js 22+ 与 Chrome/Chromium**。无第三方 npm 依赖。

```bash
# 在 shipcheck-ai 目录运行，最多 8 页
node mcp/server.js --site-audit https://example.com/ --max-pages 8 --json site-audit.json --md site-audit.md

# 如果不希望浏览器加载真实页面，仅做源 HTML/站内关系检查
node mcp/server.js --site-audit https://example.com/ --max-pages 8 --source-only --json site-audit.json
```

- 自动读取同站 `/robots.txt` 和最多 3 个 sitemap 候选/部分索引；抓取最多 20 个 HTML 页面。
- `fetch` 使用 `credentials: omit`，限制 2 MiB/请求、12 秒超时、同 origin 重定向；遵守简化的 `User-agent: *` 与 `ShipCheck` 允许/禁止规则。
- 访问失败、浏览器加载失败、缺失数据均保留「失败/未验证」；不能将不可访问页面判为已通过。
- Chrome 启动独立临时 Profile，不自动读取本机常用 Chrome 的 Cookie。
- 如站点从 `http://`、`www` 或旧域名跳转至不同 origin，请直接输入**最终规范 URL** 再运行。不同 origin 的重定向不会被自动跟随。
- 本地或 CI 运行时，Chrome 可能被沙箱或网络策略禁止导航；此时依旧能获得源 HTML 结果，但相应渲染结论会显示「未验证」。

## 3. Google Search Console · 只读真实数据

本版实现了 **OAuth 访问令牌消费接口**，未提供 Google 登录/OAuth 同意页面。需要自行获取具备以下只读 scope 的有效令牌：

`https://www.googleapis.com/auth/webmasters.readonly`

使用环境变量传入，不要把密钥写进源码：

```powershell
# Windows PowerShell — 当前终端会话
$env:SHIPCHECK_GSC_TOKEN = "<your-readonly-access-token>"
node mcp/server.js --search-data "sc-domain:example.com" --from 2026-10-01 --to 2026-10-28 --json performance.json
Remove-Item Env:SHIPCHECK_GSC_TOKEN
```

GSC 支持 `searchAnalytics.query`（聚合 Page 数据）与按指定 URL 的 `urlInspection.index.inspect`：

```bash
node mcp/server.js --search-data https://www.example.com/ --from 2026-10-01 --to 2026-10-28 --inspect https://www.example.com/products/ --json search-data.json
```

- `searchAnalytics` 不是全量索引枚举，不证明每个网址是否收录。
- `URL Inspection` 是 Google 索引记录，不是实时的 live test；字段也可能不完整。
- GSC Token 由用户提供；使用到期后需重新授权。该软件不静默刷新、存储或发送凭据到中间服务。

官方资料：
- https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect

## 4. Bing Webmaster Tools · 只读真实数据

从 Bing Webmaster Tools → Settings → API Access 获得你自己的 API Key。**本版只调用 JSON/HTTP REST**，不使用 2026-08-31 后已淘汰的 SOAP / POX。

```powershell
$env:SHIPCHECK_BING_KEY = "<your-api-key>"
node mcp/server.js --search-data "https://www.example.com/" --json bing-report.json
Remove-Item Env:SHIPCHECK_BING_KEY
```

若 GSC 和 Bing 环境变量同时提供，会读取两个渠道。未提供时对应渠道只返回 `not_connected`，不会填零或虚构数据。

仅实现 `GetQueryStats` 与 `GetPageStats` 只读查询；如 Bing 更换数据结构，CLI 将明确返回错误。尚无完整的网页登录 OAuth、多网站授权管理或自动定时同步功能。

官方资料：
- https://learn.microsoft.com/en-us/bingwebmaster/
- https://learn.microsoft.com/en-us/bingwebmaster/getting-access

## 5. MCP · AI 编程 Agent 工作流

```bash
node mcp/server.js
```

保留原三个：
- `shipcheck_scan`：已有的 UI/交互/单页 SEO-GEO 规则检测。
- `shipcheck_verify`：对上次相同 URL 扫描做缺陷差异。
- `shipcheck_screenshot`：截图。

新增三个：
- `shipcheck_site_audit({url,maxPages,sourceOnly})`：有界跨页技术 SEO / SSR-CSR / 内容线索审查。
- `shipcheck_search_data({property,startDate,endDate,inspectUrl,providers})`：有凭据时查询 GSC/Bing，否则返回未连接。
- `shipcheck_content_review({url,goal,maxPages,confirmExternalUpload:true})`：**用户明确许可**后，使用进程环境中的 `SHIPCHECK_AI_URL`、`SHIPCHECK_AI_MODEL`、`SHIPCHECK_AI_KEY` 调用模型进行证据内容复核。不自动修改网站源码。

`shipcheck_content_review` 使用自己的 API Key、公开页面文本片段，最多 5 页；模型建议仍须人工审查。

## 6. 需要在自己 Chrome / Windows 上复核的功能

- [ ] Chrome 扩展新版本正常加载，不影响旧项目数据。
- [ ] 在有权测试的正常公网网站申请权限后，Search Lab 能抓取 3/8 页。
- [ ] 拒绝权限后清晰提示，不提交任何站点请求。
- [ ] 本地链接与 HTTP 状态正确，非 HTML 页面不会被当成正常 HTML。
- [ ] 手动将服务器 HTML 主体置空但使用 JS 填充，Node CLI 显示正确源/渲染差异。
- [ ] 搜索数据导入后有提示，API 令牌为空时返回 `not_connected`。
- [ ] BYOK 发送信息前有确认提示，结束时清空 Key。
- [ ] 搜索问题导出的 Agent 任务有页面 URL、证据和重新验证要求。

运行测试：

```bash
node --test tests/*.test.cjs
```

## 明确的产品边界

这个版本不做完整 Googlebot 模拟、不保证 JS 被/不被 Google 收录，不提供 Search Console 的完整 OAuth 登录 UI，没有 Bing 新的聊天引用独立数据检测，也不能预测任何 AI 搜索平台的引用概率。`robots.txt` 解析仅覆盖基础规则，复杂的通配符和针对特定 Bot 的规则需要后续增强。
