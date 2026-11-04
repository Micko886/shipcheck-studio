# v1.0.0 · 本地 Lighthouse 版（可安装源码 / 待真实环境全链路验收）

- 将 Google PageSpeed API 从默认界面和扩展权限中移除；旧版本的纯适配文件放在 docs/legacy。
- 新增 local-runner：Node.js 22.19+、本地 Lighthouse、127.0.0.1、随机 Token、任务队列和逐页 Mobile/Desktop 审计结果。
- 一键全站扫描完成后，若已连接本机运行器，可按设置（默认 3 页）继续抽样本地 Lighthouse；否则明确显示未执行。
- 速度标签展示性能、无障碍、最佳实践、基础 SEO 分数，FCP/LCP/TBT/CLS 和本地审计建议；JSON 导出。
- 扩展扫描报告新增逐页 Lighthouse 抽样覆盖及评分表。
- 保留 v0.9 既有 QA、SEO/GEO/AEO、axe-core 规则解释、左右滑动 Tab、MCP 等能力。
- 不提供模拟 CrUX/INP，也不把未覆盖页面记为通过。
