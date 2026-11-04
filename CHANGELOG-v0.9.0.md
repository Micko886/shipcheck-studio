# ShipCheck Studio v0.9.0 修改记录

## 删除
- 不再自动生成「关键页面 / 主要行动入口 / 真实移动端业务操作」等需要人工勾选通过或失败的验收项。
- 不再显示 `DELIVERY READINESS 验收未完成` 等阻塞性状态。
- 删除旧的 `FLOWS` 人工验收模板与 `collectVerification()` 合成的业务待办缺陷。

## 新增
- Google PageSpeed Insights 官方 API（四类 Lighthouse 评分；Mobile & Desktop）
- LCP、FCP、CLS、TBT、Speed Index 实验室指标；如果 Google 返回 CrUX 则独立展示网页级真实用户指标，包括 INP
- 低分 Lighthouse 审计的具体可执行建议；JSON 导出；结果写入本次扫描记录和 Markdown 报告
- 用户可选的一键扫描后主页 PageSpeed 自动检查（显式授权，默认禁用）
- axe 无障碍问题的中文标题、CSS 定位、被检查元素、影响节点数、原因与解决方式
- 缺陷卡片无需展开即可看到「位置 / 原因 / 修复」三要素
- 大屏检查工作台中也显示自动扫描覆盖和直接可读的缺陷原因/建议

## 仍未实现 / 不做虚假承诺
- PageSpeed 对所有页面逐个测试（为保护配额仅默认测首页）
- 不保证真实 Google PSI API 在无 Key 或受限环境下成功
- 不提供人工/自动认证 WCAG AA 完全合规；不代替真实手机测试
- 不会自动提交真实订单、注册、询盘或访问受保护服务端数据
- 当前插件端的 Google API 权限与真实站点在用户 Chrome 上的最终兼容性仍需现场验证
