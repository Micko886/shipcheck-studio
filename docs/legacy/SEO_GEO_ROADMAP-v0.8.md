# v0.7.0 本轮实现状态

- ✅ 有界抓取 robots.txt / sitemap / HTTP 状态 / Canonical / hreflang 回链 / 已抓取内链错误 / 重复 Title。
- ✅ 源 HTML 与浏览器渲染对比（MCP/CLI 多页面；插件仅当前活动页，未完成则不下结论）。
- ✅ GEO/AEO 内容线索 + 可选 BYOK 模型复核（需人工核验业务事实）。
- ✅ GSC / Bing 只读数据接口（由用户提供令牌/Key）以及本地 CSV/JSON 导入。
- ❗ 未做完整 OAuth 登录、定期监控、全量索引覆盖、AI 引用真实追踪、自动源码修复。

完整使用说明见 `SEARCH_LAB_GUIDE.md`。

---

# ShipCheck SEO / GEO 下一阶段路线图

## 本次 0.6.0 已实现

- 单页搜索准备度扫描：Technical SEO / GEO / AEO 分组。
- 可核实状态：已检测 / 需关注 / 未验证，不用一个不存在的“GEO 评分”制造确定性。
- 14 项检查：noindex/nosnippet 的 DOM 信号、Title/H1、Meta、Canonical、hreflang、JSON-LD 语法、渲染 DOM 正文、lang、抓取结果待验、品牌实体信号、具体事实、作者来源线索、问题型标题、AI 可见度待验。
- 侧边栏「SEO / GEO」专用工作区，问题证据、优化建议、Markdown 报告与 Agent 修复任务。
- 大屏 Studio 左侧搜索准备度摘要。MCP 扫描结果也附带 searchReadiness 字段。
- 仅做本地只读检查，未新增域名权限或默认第三方 API 请求。

## 下一阶段建议：0.7.0 Technical Crawl Audit

1. **源 HTML vs 渲染 HTML**：在用户确认的本域测试范围内获取 HTTP 200 的 HTML 响应，比较首屏关键正文是否存在于源 HTML，标注 SSR/CSR 风险；不能简单说 JS 内容无法被 Google 识别。
2. **robots.txt、sitemap、HTTP 状态与响应头**：检查 X-Robots-Tag、robots.txt 冲突、sitemap 可访问性、重定向链，均标记实际请求结果；不同环境可能有不同规则。
3. **多页面站内关系**：Canonical 重复/冲突、hreflang 双向回链与目标状态、孤立页面、失效内部链接、分页和目录可达性。
4. **结构化数据语义验证**：比对可见内容，区分 Schema.org 语法和 Google 特定富媒体结果要求。
5. **内容与关键词地图**：以分类页/产品页/文章页区分搜索意图，检测标题高度相似、疑似关键词冲突，避免盲目数量建议。

## 后续：0.8.0 Search Intelligence（用户主动授权）

- 连接 Google Search Console、Bing Webmaster Tools 读取覆盖状态与性能，避免伪造“已被索引”。
- 维护已观察到的 AI 引用链接、时间、查询和平台，不以单次人工提示产生的结果推断覆盖率或保证出现。
- B2B 站点检查 MOQ、规格、产品范围、认证、交期与询盘信息的事实一致性；未知条款保留未验证状态。
- 不建议把 `llms.txt`、FAQ Schema 或所谓“AI 排名公式”当作成功的必要条件。

## 官方资料

- Google: https://developers.google.com/search/docs/appearance/ai-features
- Google: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
- Google: https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- Google: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- Bing: https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/
