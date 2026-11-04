# ShipCheck Studio v1.0.0 · 本地 Lighthouse 增强版

> 这是可以安装、继续开发和测试的**本地功能集成版本**，尚未在用户真实 Chrome 安装环境中完成 Lighthouse 全链路验收。保留 v0.9 的 QA / SEO / GEO / AEO、axe-core、问题解释、Tab 左右滑动和 Agent 报告；用本地 Lighthouse 取代默认 Google PageSpeed API 检测。

## 1. 为什么采用双引擎

- **Chrome 插件（无需本地程序）**：继续执行已经具备的网页 QA、SEO/GEO/AEO、无障碍规则及同源有界页面发现。
- **本地 Lighthouse 运行器（可选，首次安装依赖）**：在用户电脑使用 Chrome/Chromium + 开源 Lighthouse 执行性能、无障碍、最佳实践和基础 SEO 实验室测试。
- **没有 ShipCheck 云端检测服务器**：本地运行器仅监听 `127.0.0.1:48762`，使用随机访问令牌和仅允许扩展 Origin 的 CORS 校验。
- **联网范围**：首次执行 `npm install` 需要获取开源依赖；检测公开网站时 Chromium 会访问目标站及其资源。可选 AI 审计或外部数据 API 如果用户自己开启，仍有独立的第三方网络访问。

## 2. 安装与启动（Windows）

1. 从 ZIP 解压完整 `shipcheck-ai` 文件夹，其中包含 `manifest.json` 和 `local-runner/`。
2. 安装 **Node.js 22.19+（或更新的 24 LTS）** 和 Chrome/Chromium。
3. 双击 `local-runner/start-windows.cmd`。首次联网下载 Lighthouse 依赖，以后不需要重复安装。终端显示 64 位令牌（token），保持窗口运行。
4. Chrome 打开 `chrome://extensions`，开启开发者模式，加载已解压的 `shipcheck-ai` 文件夹（**不要只加载 local-runner**）。
5. 在插件「速度 / CWV」中粘贴本地令牌，点击「连接本地检测器」，允许访问 `http://127.0.0.1`。
6. 打开网站点击「一键扫描全站」。先完成 QA/SEO/GEO，再由本机 Lighthouse 对已完成扫描的页面抽样执行 Mobile + Desktop 测试。可在「速度 / CWV」调整抽样页数为 1/3/5/10/20。

## 3. macOS / Linux

进入 `local-runner` 目录后运行：

```sh
chmod +x start-mac-linux.sh
./start-mac-linux.sh
```

然后同样通过 Chrome 插件「速度 / CWV」输入终端令牌、连接，开始全站扫描。如果 Lighthouse 找不到 Chrome，可设置 `CHROME_PATH` 环境变量指向浏览器可执行文件。

## 4. 如何判断检测是否完成

- **QA/SEO/GEO**：按扫描页数及覆盖率汇总，即使本地运行器未安装也能执行。
- **Lighthouse**：独立显示 `本机检测器已连接 / 未连接`，任务完成数量、逐 URL 手机和桌面四项评分、FCP/LCP/TBT/CLS 指标和修复方向。失败不会显示为 0 分。
- **Core Web Vitals**：这里的 Lighthouse 是**实验室数据**，不提供真实用户数据的 INP / CrUX。工具明确显示未测得，不能冒充用户实测。
- **抽样限制**：默认三页，单任务上限 20 页；本地 Lighthouse 的耗时随页面数增加，未检查的页面不能视为通过。
- **报告**：速度标签可导出检测 JSON；正式全站报告含每个被抽样 URL 的测试状态和分数。

## 5. 安全与隐私

- 运行器只监听 `127.0.0.1`，并验证请求 Token；不能由任意第三方网页跨域调用。
- 访问令牌保存在 `local-runner/.shipcheck-token` 和浏览器扩展本地存储；请勿上传这些本机配置文件。
- 扫描任务只允许同源 HTTP(S) URL，每次最多 20 页；不会执行真实购买、发邮件或写入业务系统。
- 对 `localhost` 的 Lighthouse 审计需要本地 Runner；它使用隔离 Chromium，会话状态**不会自动复用**用户 Chrome 中的登录 Cookie。
- 自动化 Lighthouse 本身可能访问页面所包含的第三方网络资源；“本地运行”不等于目标页面可以完全离线加载。

## 6. 源码结构与测试

- `local-runner/server.cjs`：带 Token 的本机 HTTP 任务调度器和 Lighthouse CLI 执行。
- `local-runner/core.cjs`：URL 校验、任务边界及 LHR 结果解析。
- `src/studio/local-lighthouse-panel.js`：Chrome 插件本地连接、任务状态及可视化展示。
- `src/sidepanel/app.js`：统一扫描后可选触发本机 Lighthouse；报告包含抽样结果。
- `docs/legacy/v0.9.0-pagespeed*`：旧云端 PageSpeed 代码仅保留参考，**当前界面不加载、Manifest 不再声明 Google API 授权**。

检查源码与单元测试：

```sh
node --test tests/*.test.cjs
```

测试包含本地 Server 认证、来源限制、URL 校验、Lighthouse JSON 解析、页面接线验证；**尚未等于在用户电脑执行了真实 Chrome Lighthouse 完整任务**。如果本地 npm 无法访问软件仓库，就需要用户在其机器安装依赖后验证。

## 7. 已知限制

1. 一次 Lighthouse 扫描会启动独立 Chromium；20 页 × 2 设备非常耗时，建议先以 3 页作为验证。
2. 由于本地 Runner 不获取浏览器扩展 Cookie，登录态或私有路由可能不能直接扫描。
3. 网络限速、设备模拟和 Chromium 版本会影响 Lighthouse 分数。修复前后应尽量使用一致环境并多次测试。
4. 完整一键全站 QA 和 SEO/GEO 的“全站”仍受页面发现覆盖率和设置页数上限约束。
5. 目前不提供 Windows exe 一键安装包；专业用户需要 Node.js 与本地依赖。以后可再打包独立桌面应用降低门槛。
