/* ShipCheck AI · 本地扫描引擎 v0.1.0  (ISOLATED world / content script)
 *
 * 设计原则（对应产品方案里的三层检测）：
 *   1. 确定性规则：溢出 / 空链接 / 资源失败 / 表单标签 / alt / lang 等，结论可复现。
 *   2. 证据关联：按 rule + selector 去重，合并视口，保留 DOM 定位与几何证据。
 *   3. AI 只做解释：本引擎不调用任何大模型，只产出结构化证据与修复任务，
 *      交给 Cursor / Claude Code 等 Agent 执行（Module F: AI Fix Handoff）。
 *
 * 隐私：所有计算在标签页内完成，仅把「缺陷摘要」回传给扩展侧边栏，
 *      不上传 HTML 源码、Cookie 或截图。
 */
(() => {
  'use strict';
  const ENGINE_VERSION = '0.9.0';
  if (window.__shipcheck && window.__shipcheck.ENGINE_VERSION === ENGINE_VERSION) return;
  window.__shipcheckReady = true;
  const SEV_ORDER = { critical: 4, high: 3, medium: 2, low: 1 };
  const SEV_WEIGHT = { critical: 12, high: 6, medium: 2.5, low: 0.8 };
  const MODULE_LABEL = {
    responsive: 'Responsive QA',
    interaction: 'Interaction QA',
    visual: 'Visual QA',
    a11y: 'Accessibility',
    seo: 'Technical SEO',
    geo: 'GEO / AEO Readiness',
    business: 'Business Flow QA'
  };

  const IS_TOP = (() => {
    try { return window.top === window; } catch (_) { return false; }
  })();

  /* ------------------------------------------------------------------ *
   * 规则库：默认复现步骤 / 可能原因 / 修复要求 / 复测清单
   * ------------------------------------------------------------------ */
  const RULES = {
    H_OVERFLOW: {
      module: 'responsive', severity: 'critical', confidence: 'confirmed',
      title: '页面出现横向水平溢出',
      repro: ['将浏览器视口调整到目标宽度并重新加载页面', '尝试左右拖动页面，确认是否出现横向滚动'],
      causes: [
        '容器使用固定 width / min-width，且未设置 max-width:100%',
        '图片、表格、代码块等替换元素缺少响应式约束',
        'white-space:nowrap 的长文本、负 margin 或绝对定位元素超出视口',
        '缺少 <meta name="viewport">，移动端按桌面宽度渲染'
      ],
      fixes: [
        '为超宽容器添加 max-width:100% 与 box-sizing:border-box',
        '把固定宽度改为 width:min(100%, Npx)，或用 grid / flex 的 minmax(0, 1fr)',
        '为 img / video / table 设置 max-width:100%; height:auto',
        '在对应断点下移除造成溢出的负 margin 与绝对定位偏移'
      ],
      retest: [
        'document.documentElement.scrollWidth <= document.documentElement.clientWidth',
        '目标视口下不出现横向滚动条',
        '390 / 768 / 1440px 下关键内容完整可见'
      ]
    },
    OVERFLOW_ELEMENT: {
      module: 'responsive', severity: 'high', confidence: 'confirmed',
      title: '元素超出视口可见区域',
      repro: ['在目标视口下打开页面', '检查该元素的 boundingClientRect 与 computed style'],
      causes: ['固定宽度或 min-width 大于视口', '父级 flex / grid 子项未收缩（缺少 min-width:0）', '绝对定位元素未按视口约束'],
      fixes: ['为该元素或其父级设置 min-width:0 / max-width:100%', '用相对单位（%、vw、clamp）替换固定像素宽度', '检查 transform / left 偏移是否把元素推出视口'],
      retest: ['元素 rect.right <= 视口 clientWidth', '不再出现在横向溢出候选列表中']
    },
    FIXED_WIDTH: {
      module: 'responsive', severity: 'medium', confidence: 'confirmed',
      title: '元素设置了大于视口的固定宽度',
      repro: ['在目标视口下检查该元素 computed width / min-width'],
      causes: ['硬编码像素宽度未随断点调整', '第三方组件使用内联固定宽度'],
      fixes: ['改为 width:100% 或 max-width:100%', '在媒体查询中覆盖该断点下的宽度'],
      retest: ['该元素在目标视口下宽度不超过 clientWidth']
    },
    OCCLUDED_CONTROL: {
      module: 'responsive', severity: 'high', confidence: 'needs-review',
      title: '交互元素疑似被其他元素遮挡',
      repro: ['在目标视口下打开页面', '尝试点击该元素，观察是否触发预期交互'],
      causes: ['固定定位的浮层 / 广告条 / Cookie 横幅盖住了控件', 'z-index 层级错误', '弹窗未正确关闭'],
      fixes: ['检查遮挡元素的 z-index 与 position', '为浮层添加关闭按钮并确保不覆盖关键 CTA', '在目标断点下重新验证点击区域'],
      retest: ['document.elementFromPoint(中心点) 返回该元素或其子节点', '手动点击可触发预期反馈']
    },
    SMALL_TAP_TARGET: {
      module: 'responsive', severity: 'low', confidence: 'needs-review',
      title: '移动端可点击目标尺寸偏小',
      repro: ['在移动端视口下查看该控件的实际渲染尺寸'],
      causes: ['图标按钮未设置足够的 padding', '内联链接过于密集'],
      fixes: ['将可点击区域扩展到至少 24×24px（推荐 44×44px）', '为图标按钮增加 padding 或伪元素热区'],
      retest: ['控件 boundingClientRect 宽高均 >= 24px']
    },
    TEXT_CLIPPED: {
      module: 'responsive', severity: 'low', confidence: 'needs-review',
      title: '文本内容疑似被容器裁切',
      repro: ['在目标视口下查看该容器内的文本是否完整显示'],
      causes: ['overflow:hidden 配合固定高度', 'line-clamp 未考虑换行后的实际高度'],
      fixes: ['改为 min-height 或允许容器自适应高度', '确认是否为有意的单行截断；若是则添加 title / aria-label'],
      retest: ['容器 scrollHeight <= clientHeight，或确认为有意截断']
    },
    DIALOG_OVERFLOW: {
      module: 'responsive', severity: 'high', confidence: 'confirmed',
      title: '弹窗 / 模态框超出视口',
      repro: ['在目标视口下打开该弹窗', '检查是否可完整看到内容与关闭按钮'],
      causes: ['弹窗使用固定宽度且未设置 max-width:100vw', '弹窗内部未开启滚动'],
      fixes: ['为弹窗设置 max-width:100vw; max-height:100vh; overflow:auto', '确保关闭按钮在视口内可见且可点击'],
      retest: ['弹窗 rect 完全位于视口内', '关闭按钮可点击']
    },
    NO_VIEWPORT_META: {
      module: 'responsive', severity: 'high', confidence: 'confirmed',
      title: '缺少 viewport meta，移动端无法按设备宽度渲染',
      repro: ['用手机访问该页面', '观察是否整体缩放、文字过小'],
      causes: ['<head> 中未声明 <meta name="viewport" content="width=device-width, initial-scale=1">'],
      fixes: ['在 <head> 中添加标准 viewport meta', '避免使用 user-scalable=no / maximum-scale=1'],
      retest: ['页面包含 name="viewport" 且含 width=device-width', '390px 视口下布局按移动端渲染']
    },
    EMPTY_LINK: {
      module: 'interaction', severity: 'high', confidence: 'confirmed',
      title: '按钮 / 链接缺少有效目标',
      repro: ['找到该元素并点击', '观察是否发生导航、打开弹窗或其他可观察反馈'],
      causes: ['href="#" / 空 href / javascript:void(0) 且没有绑定事件', '占位链接在交付时未替换为真实地址'],
      fixes: ['替换为真实 URL 或路由（React Router / Next Link 等）', '若确为脚本按钮，改用 <button type="button"> 并绑定处理函数', '补齐 aria-label 与键盘可操作性'],
      retest: ['点击后产生可观察的导航或状态变化', '链接具有有效 href 或明确为 button 语义']
    },
    BROKEN_ANCHOR: {
      module: 'interaction', severity: 'medium', confidence: 'confirmed',
      title: '锚点链接指向不存在的页面元素',
      repro: ['点击该锚点链接', '确认页面是否滚动到对应区块'],
      causes: ['目标区块被删除或 id 拼写不一致', '路由切换后锚点未同步更新'],
      fixes: ['修正 href 中的 id 或为目标区块补充 id', '使用 IntersectionObserver 前先确认目标存在'],
      retest: ['document.getElementById(锚点 id) 返回非空']
    },
    LINK_NO_NAME: {
      module: 'interaction', severity: 'medium', confidence: 'confirmed',
      title: '链接缺少可访问名称',
      repro: ['用键盘 Tab 聚焦该链接', '用屏幕阅读器或无障碍树检查读出的名称'],
      causes: ['图标链接内没有文本、aria-label 或 img alt'],
      fixes: ['添加可见文本或 aria-label', '为图标补充 aria-hidden="true" 与描述性名称'],
      retest: ['无障碍树中该链接具有非空名称']
    },
    BROKEN_IMAGE: {
      module: 'visual', severity: 'high', confidence: 'confirmed',
      title: '图片资源加载失败',
      repro: ['在网络面板中刷新页面', '检查该图片请求的状态码与响应'],
      causes: ['资源路径为本地绝对路径或相对路径错误', '构建后静态资源未部署 / CDN 404', 'src 为空或懒加载逻辑异常'],
      fixes: ['修正资源路径，使用构建产物的 public / assets 路径', '为关键图片补充 onError 兜底与占位图', '部署后验证线上资源可访问'],
      retest: ['img.complete === true 且 naturalWidth > 0', '网络面板中该请求返回 2xx']
    },
    RESOURCE_4XX: {
      module: 'visual', severity: 'high', confidence: 'confirmed',
      title: '静态资源请求失败（4xx / 5xx）',
      repro: ['打开 DevTools → Network 并刷新页面', '按状态码筛选失败请求'],
      causes: ['脚本 / 样式 / 字体路径错误', '部署后资源指纹或 base path 不匹配'],
      fixes: ['修正资源 URL 与部署 base path', '移除对不存在资源的引用'],
      retest: ['刷新后不再出现 4xx / 5xx 资源请求']
    },
    IMG_NO_ALT: {
      module: 'a11y', severity: 'medium', confidence: 'confirmed',
      title: '图片缺少替代文本',
      repro: ['关闭图片显示或用屏幕阅读器浏览页面', '确认是否能理解该图片传达的信息'],
      causes: ['<img> 未写 alt 属性', '把装饰性图片与内容性图片混为一谈'],
      fixes: ['为内容性图片添加描述性 alt', '纯装饰图片使用 alt="" 或 role="presentation"'],
      retest: ['所有内容性 img 均有非空 alt', '装饰性图片显式标记 alt=""']
    },
    FORM_NO_LABEL: {
      module: 'a11y', severity: 'high', confidence: 'confirmed',
      title: '表单控件缺少关联标签',
      repro: ['点击输入框旁的文字，确认焦点是否进入输入框', '用屏幕阅读器检查字段名称'],
      causes: ['仅有 placeholder，没有 <label for> / aria-label', 'label 与控件 id 不匹配'],
      fixes: ['为每个控件添加 <label for="id"> 或 aria-labelledby', 'placeholder 仅作为示例，不替代标签'],
      retest: ['每个 input / select / textarea 的 labels.length > 0 或存在 aria-label']
    },
    BUTTON_NO_NAME: {
      module: 'a11y', severity: 'medium', confidence: 'confirmed',
      title: '按钮缺少可访问名称',
      repro: ['用键盘 Tab 聚焦该按钮', '检查无障碍树中的名称'],
      causes: ['纯图标按钮没有文本或 aria-label'],
      fixes: ['添加 aria-label 或可见文本', '图标本身设置 aria-hidden="true"'],
      retest: ['按钮在计算后的可访问名称非空']
    },
    HTML_NO_LANG: {
      module: 'a11y', severity: 'medium', confidence: 'confirmed',
      title: 'html 元素缺少 lang 属性',
      repro: ['查看 <html> 标签属性'],
      causes: ['模板未声明语言'],
      fixes: ['为 <html> 添加 lang="zh-CN" 或与内容匹配的语言标记'],
      retest: ['document.documentElement.lang 非空']
    },
    LOW_CONTRAST: {
      module: 'a11y', severity: 'low', confidence: 'needs-review',
      title: '文字与背景对比度可能不足',
      repro: ['在目标视口下查看该文字', '用取色器确认前景色与背景色'],
      causes: ['浅灰文字配浅色背景', '背景为图片 / 渐变，规则引擎只能估算纯色背景'],
      fixes: ['将对比度提升到至少 4.5:1（大字号 3:1）', '对图片背景增加遮罩或文字阴影'],
      retest: ['用真实取色工具复核对比度 >= 4.5:1']
    },
    HEADING_ORDER: {
      module: 'a11y', severity: 'low', confidence: 'confirmed',
      title: '标题层级出现跳跃',
      repro: ['查看页面标题结构（h1 → h6）'],
      causes: ['为了字号而跳级使用标题标签'],
      fixes: ['按内容层级顺序使用 h1 → h2 → h3', '用 CSS 控制字号，不靠跳级标题实现'],
      retest: ['标题层级连续，不出现跳级']
    },
    TITLE_MISSING: {
      module: 'seo', severity: 'medium', confidence: 'confirmed',
      title: '页面缺少 title',
      repro: ['查看浏览器标签页标题'],
      causes: ['模板未提供 <title>'],
      fixes: ['添加简明、唯一的 <title>'],
      retest: ['document.title 非空']
    },
    META_DESC_MISSING: {
      module: 'seo', severity: 'low', confidence: 'confirmed',
      title: '缺少 meta description',
      repro: ['查看 <head> 中的 meta 标签'],
      causes: ['模板未提供描述'],
      fixes: ['添加 50–160 字的 <meta name="description">'],
      retest: ['页面存在非空 description']
    },
    H1_MISSING: {
      module: 'seo', severity: 'low', confidence: 'confirmed',
      title: '页面缺少 h1 主标题',
      repro: ['查看页面主标题结构'],
      causes: ['用 div 模拟标题'],
      fixes: ['为页面主内容添加唯一 h1'],
      retest: ['document.querySelectorAll("h1").length === 1']
    },
    H1_MULTIPLE: {
      module: 'seo', severity: 'low', confidence: 'needs-review', verification: true,
      title: '页面存在多个 h1（需判断语义结构）',
      repro: ['统计 h1 数量'],
      causes: ['多个组件各自输出 h1'],
      fixes: ['根据页面的实际语义层级调整标题，不要为了单 H1 而盲目改变可访问性结构'],
      retest: ['主内容标题层级清晰且符合页面信息架构']
    },
    CANONICAL_MULTIPLE: {
      module: 'seo', severity: 'low', confidence: 'confirmed',
      title: '存在多个 canonical 链接',
      repro: ['查看 <link rel="canonical"> 数量'],
      causes: ['框架与模板重复注入'],
      fixes: ['只保留一个 canonical'],
      retest: ['link[rel=canonical] 数量为 1']
    },
    ROBOTS_NOINDEX: {
      module: 'seo', severity: 'low', confidence: 'needs-review', verification: true,
      title: '页面声明 noindex（需确认发布环境）',
      repro: ['查看 robots meta 或响应头'],
      causes: ['开发环境的 noindex 配置带到生产'],
      fixes: ['确认网站是预览环境还是生产环境；只有应收录的生产页面才考虑移除 noindex'],
      retest: ['生产环境无 noindex']
    },
    FORM_RESULT_UNVERIFIED: {
      module: 'business', severity: 'low', confidence: 'needs-review', verification: true,
      title: '表单提交的业务结果未验证',
      repro: ['用测试数据提交一次表单', '确认是否真正写入数据库 / 发送邮件 / 创建记录'],
      causes: ['自动规则只能检查 DOM 与标签，无法确认服务端行为', '需要测试环境与预期结果断言'],
      fixes: ['在沙盒环境用测试数据走通提交流程', '配置断言：期望状态变化、落库记录或邮件到达'],
      retest: ['提交后能在测试环境查询到对应记录', '失败路径有明确错误提示且不误报成功']
    },
    CLICK_FEEDBACK_UNVERIFIED: {
      module: 'business', severity: 'low', confidence: 'needs-review', verification: true,
      title: '按钮 / 导航点击反馈未验证',
      repro: ['逐个点击关键 CTA 与导航项', '确认产生预期的状态变化或页面跳转'],
      causes: ['本引擎不模拟点击，无法区分「没反应」与「产生了预期业务结果」'],
      fixes: ['为关键交互配置显式断言或端到端测试用例', '上线前人工走查一遍关键路径'],
      retest: ['关键 CTA 与导航均有可观察反馈']
    },
    CHECKOUT_FLOW_UNVERIFIED: {
      module: 'business', severity: 'low', confidence: 'needs-review', verification: true,
      title: '关键业务流程未做端到端验证',
      repro: ['按站点类型走通核心流程（B2B 询盘 / 电商结账 / SaaS 注册）'],
      causes: ['业务流程测试需要测试账号、沙盒环境与授权，V1 不自动执行'],
      fixes: ['在独立测试环境中配置测试账号与预期结果', '禁止在未经授权时触发真实购买、发消息或改动生产数据'],
      retest: ['核心流程在测试环境可完整走通']
    },

    /* ---- 表单交付检查：全部静态只读，不提交任何数据 ---- */
    FORM_NO_SUBMIT_CONTROL: {
      module: 'business', severity: 'medium', confidence: 'needs-review',
      title: '表单中未发现明确的提交控件（需验证）',
      repro: ['聚焦该表单', '检查是否存在 type="submit" 的 button / input'],
      causes: [
        '按钮被写成 <button> 但缺少 type，又被 JS 改成纯展示逻辑',
        '提交按钮由外部元素触发，但未与表单关联（缺少 form 属性）',
        '模板套用时按钮被误删或改成 div'
      ],
      fixes: [
        '为表单提供 <button type="submit">提交</button>（或在表单外使用 form="formId" 关联）',
        '若依赖 JS 提交，仍应保留可聚焦的 submit 控件以支持键盘回车与无障碍'
      ],
      retest: ['表单内存在 type="submit" 的控件', '在输入框内按回车可触发表单校验']
    },
    FORM_FIELD_NO_NAME: {
      module: 'business', severity: 'medium', confidence: 'needs-review',
      title: '表单字段缺少 name，需检查 JS 是否显式收集',
      repro: ['在浏览器中填写该字段', '提交后查看网络请求的表单数据'],
      causes: ['用受控组件但遗漏 name 属性', '仅靠 id 或 class 做收集，未写入 FormData'],
      fixes: ['为每个参与提交的 input / select / textarea 补上唯一 name', '若字段由 JS 收集，确认已显式 append 到 FormData 或请求体'],
      retest: ['FormData 中出现该字段名与用户输入值']
    },
    FORM_BUTTON_NO_TYPE: {
      module: 'business', severity: 'medium', confidence: 'confirmed',
      title: '表单内按钮缺少 type，可能意外触发表单提交',
      repro: ['点击该按钮', '观察页面是否发生刷新或跳转'],
      causes: ['HTML 中 <button> 的默认 type 为 submit', '复制粘贴的「取消 / 上一步」按钮忘了写 type="button"'],
      fixes: ['非提交用途的按钮显式声明 type="button"', '仅在真正的提交按钮上保留 type="submit"'],
      retest: ['点击非提交按钮不触发表单提交与页面刷新']
    },
    FORM_NO_ERROR_SURFACE: {
      module: 'business', severity: 'medium', confidence: 'needs-review', verification: true,
      title: '表单缺少错误提示容器，校验失败时用户看不到原因',
      repro: ['留空必填项后提交', '观察页面是否出现可见错误提示'],
      causes: ['错误只打印在控制台', '错误提示依赖 role="alert" / aria-live 容器但未实现', '提示元素被 CSS 隐藏'],
      fixes: [
        '添加 role="alert" 或 aria-live="polite" 的错误提示区域并在校验失败时填充文本',
        '为出错字段添加 aria-invalid="true" 与 aria-describedby 指向错误文案'
      ],
      retest: ['提交非法数据后页面出现可读的错误提示', '读屏软件能播报错误内容']
    },
    FORM_REQUIRED_NO_HINT: {
      module: 'business', severity: 'low', confidence: 'needs-review',
      title: '必填字段没有可见的必填标记',
      repro: ['查看表单中带 required 的字段', '确认标签旁是否有 * 或「必填」等提示'],
      causes: ['仅用 required 属性，未在视觉上标注必填'],
      fixes: ['在标签中加入可见的必填标记，并为读屏提供「必填」文本', '或在表单顶部说明「全部字段均为必填」'],
      retest: ['必填字段在视觉与无障碍树上均可识别为必填']
    },
    FORM_FIELD_TYPE_MISMATCH: {
      module: 'business', severity: 'medium', confidence: 'confirmed',
      title: '字段语义与 input type 不匹配，移动端键盘与校验都会失效',
      repro: ['在手机上聚焦该字段', '检查弹出的键盘类型与浏览器内置校验'],
      causes: ['邮箱 / 电话 / 网址字段统一写成 type="text"', '从设计稿直接生成代码，忽略输入类型'],
      fixes: ['邮箱用 type="email"，电话用 type="tel" 并加 inputmode="tel"，网址用 type="url"', '数字量用 type="number" 或 inputmode="numeric"'],
      retest: ['移动端弹出对应键盘', '非法格式在提交前被浏览器拦下']
    },
    FORM_NO_AUTOCOMPLETE: {
      module: 'business', severity: 'low', confidence: 'confirmed',
      title: '身份类字段缺少 autocomplete，转化率与可访问性受影响',
      repro: ['聚焦邮箱 / 姓名 / 密码字段', '检查是否出现浏览器自动填充建议'],
      causes: ['未声明 autocomplete 属性', '误用 autocomplete="off" 关闭了自动填充'],
      fixes: ['邮箱 autocomplete="email"，姓名 name，密码区分 current-password / new-password', '地址类字段使用 street-address / postal-code 等标准值'],
      retest: ['浏览器可自动填充该字段', '密码管理器能正确识别登录与注册场景']
    },
    FORM_MIXED_CONTENT_ACTION: {
      module: 'business', severity: 'high', confidence: 'confirmed',
      title: 'HTTPS 页面的表单提交到 HTTP 地址，会被浏览器拦截或警告',
      repro: ['在 HTTPS 页面提交该表单', '观察控制台是否有混合内容 / 不安全表单警告'],
      causes: ['表单 action 写死为 http:// 旧地址', '第三方表单服务未升级到 HTTPS'],
      fixes: ['把 action 改为 https://', '若为第三方服务，确认其提供 HTTPS 端点'],
      retest: ['控制台无「不安全表单」警告', '提交请求走 HTTPS']
    },
    FORM_ID_DUPLICATE: {
      module: 'business', severity: 'medium', confidence: 'confirmed',
      title: '页面存在重复 id，label 与字段关联会错位',
      repro: ['用 document.querySelectorAll("[id=...]") 检查重复 id', '点击对应 label 观察焦点落到哪个字段'],
      causes: ['组件在多处复用但 id 写死', '服务端与前端同时渲染了同一表单'],
      fixes: ['为每个实例生成唯一 id（如带随机后缀）', '或用 label 包裹控件避免依赖 id'],
      retest: ['页面内 id 全局唯一', '点击每个 label 焦点落到正确字段']
    },
    FORM_NO_SPAM_GUARD: {
      module: 'business', severity: 'low', confidence: 'needs-review', verification: true,
      title: '公开表单缺少反垃圾机制，上线后可能收到大量垃圾提交',
      repro: ['检查表单是否包含 honeypot 隐藏字段或验证码', '观察是否有提交频率限制'],
      causes: ['开发阶段只关注样式与提交链路', '未接入任何验证码 / 限流服务'],
      fixes: ['添加对用户不可见的 honeypot 字段并在服务端丢弃命中该字段的提交', '或接入 Turnstile / reCAPTCHA 与服务端限流'],
      retest: ['脚本化重复提交被拦截', '正常用户无需额外操作即可提交']
    },
    FORM_SUCCESS_UNVERIFIABLE: {
      module: 'business', severity: 'low', confidence: 'needs-review', verification: true,
      title: '表单提交的成功态无法由静态规则确认',
      repro: ['在测试环境用测试数据提交', '确认返回的成功提示与真实业务结果一致'],
      causes: ['前端直接显示「提交成功」但请求可能失败', '未处理非 2xx 响应'],
      fixes: ['成功提示必须由服务端响应驱动，失败时展示可读错误', '在测试环境验证落库 / 邮件 / CRM 记录'],
      retest: ['失败请求不显示成功提示', '成功提交后能在后端查到记录']
    }
  };

  /* ------------------------------------------------------------------ *
   * 工具函数
   * ------------------------------------------------------------------ */
  const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(String(s)) : String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&'));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return '';
    const parts = [];
    let cur = el;
    for (let i = 0; cur && i < 4 && cur.nodeType === 1; i++, cur = cur.parentElement) {
      let seg = cur.tagName.toLowerCase();
      if (cur.id) {
        parts.unshift(seg + '#' + esc(cur.id));
        break;
      }
      const cls = typeof cur.className === 'string'
        ? cur.className.trim().split(/\s+/).filter((c) => c && !/^\d/.test(c)).slice(0, 2)
        : [];
      if (cls.length) seg += '.' + cls.map(esc).join('.');
      const parent = cur.parentElement;
      if (parent) {
        const same = Array.prototype.filter.call(parent.children, (c) => c.tagName === cur.tagName);
        if (same.length > 1) seg += ':nth-of-type(' + (same.indexOf(cur) + 1) + ')';
      }
      parts.unshift(seg);
    }
    return parts.join(' > ');
  }

  function labelOf(el) {
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
    if (t) return t.slice(0, 40);
    return el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt') || el.tagName.toLowerCase();
  }

  function isVisible(el, win) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = win.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    return true;
  }

  /* 隐藏字段（honeypot / 装饰性 / 屏幕外）不参与「可见性相关」的判断，
   * 否则反垃圾隐藏域会被误报成缺标签、类型不匹配或必填未标注。 */
  function isHiddenField(el, win) {
    if (!el) return false;
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'hidden') return true;
    if (el.getAttribute('aria-hidden') === 'true') return true;
    if (el.getAttribute('tabindex') === '-1') return true;
    try {
      const cs = win.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return true;
    } catch (_) { /* noop */ }
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return true;
    if (r.right < 0 || r.left > (win.innerWidth || 9999) || r.bottom < 0) return true;
    return false;
  }

  const SPAM_GUARD_SEL = 'input[type=hidden],input[tabindex="-1"],input[aria-hidden="true"],' +
    'input[name^=hp i],input[name*=honeypot i],input[name*=honey i],input[name*=gotcha i],input[name*=captcha i],' +
    'iframe[src*=recaptcha],iframe[src*=turnstile],.g-recaptcha,.cf-turnstile,[data-sitekey]';

  function add(list, key, opts) {    const r = RULES[key];
    if (!r) return null;
    const o = opts || {};
    const f = {
      id: key + '-' + list.length + '-' + Math.random().toString(36).slice(2, 7),
      rule: key,
      module: r.module,
      severity: r.severity,
      confidence: r.confidence,
      verification: !!r.verification,
      title: r.title,
      selector: o.selector || '',
      viewports: o.viewports ? o.viewports.slice() : ['当前页面'],
      evidence: (o.evidence || []).slice(),
      detail: o.detail || '',
      rect: o.rect || null,
      repro: (r.repro || []).slice(),
      causes: (r.causes || []).slice(),
      fixes: (r.fixes || []).slice(),
      retest: (r.retest || []).slice()
    };
    list.push(f);
    return f;
  }

  function progress(stage, percent) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        const p = chrome.runtime.sendMessage({ type: 'SHIPCHECK_PROGRESS', stage, percent });
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch (_) { /* 侧边栏未打开时忽略 */ }
  }

  /* ------------------------------------------------------------------ *
   * 单视口几何检查（Responsive QA，Module A）
   * ------------------------------------------------------------------ */
  function analyzeViewport(doc, win, label) {
    const issues = [];
    const de = doc.documentElement;
    if (!de) return { label, blocked: true, issues, clientWidth: 0, scrollWidth: 0, overflowPx: 0, height: 0, dpr: 1 };

    const clientWidth = de.clientWidth || win.innerWidth || 0;
    const scrollWidth = de.scrollWidth || 0;
    const overflowPx = Math.max(0, scrollWidth - clientWidth);
    const view = {
      label,
      width: clientWidth,
      height: win.innerHeight || 0,
      clientWidth,
      scrollWidth,
      overflowPx,
      dpr: win.devicePixelRatio || 1,
      blocked: false,
      note: '',
      issues
    };

    // 1) 水平溢出（确定性）
    if (overflowPx > 1) {
      add(issues, 'H_OVERFLOW', {
        viewports: [label],
        evidence: [
          '视口 clientWidth = ' + clientWidth + 'px',
          '文档 scrollWidth = ' + scrollWidth + 'px',
          '超出 ' + overflowPx + 'px，页面可横向滚动'
        ],
        detail: '在 ' + label + ' 下 documentElement.scrollWidth (' + scrollWidth + 'px) 大于 clientWidth (' + clientWidth + 'px)。'
      });

      // 2) 定位疑似造成溢出的元素（仅在确认溢出后报告，避免误报）
      const candidates = [];
      const all = doc.body ? Array.prototype.slice.call(doc.body.querySelectorAll('*'), 0, 4000) : [];
      for (let i = 0; i < all.length; i++) {
        const el = all[i];
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 4) continue;
        if (r.right <= clientWidth + 2 && r.left >= -2) continue;
        if (!isVisible(el, win)) continue;
        candidates.push({ el, r, score: (r.right - clientWidth) + Math.max(0, -r.left) });
      }
      candidates.sort((a, b) => b.score - a.score);
      const reported = [];
      let n = 0;
      for (let i = 0; i < candidates.length && n < 5; i++) {
        const c = candidates[i];
        if (reported.some((rep) => rep.contains(c.el))) continue;
        reported.push(c.el);
        const cs = win.getComputedStyle(c.el);
        add(issues, 'OVERFLOW_ELEMENT', {
          viewports: [label],
          selector: cssPath(c.el),
          rect: { x: c.r.left, y: c.r.top, width: c.r.width, height: c.r.height },
          evidence: [
            '元素「' + labelOf(c.el) + '」right = ' + Math.round(c.r.right) + 'px，视口宽度 = ' + clientWidth + 'px',
            '元素尺寸 ' + Math.round(c.r.width) + '×' + Math.round(c.r.height) + 'px',
            'computed: width=' + cs.width + ', min-width=' + cs.minWidth + ', max-width=' + cs.maxWidth + ', position=' + cs.position + ', overflow-x=' + cs.overflowX
          ],
          detail: '元素「' + labelOf(c.el) + '」在 ' + label + ' 下超出页面可见区域。'
        });
        n++;
      }
    }

    // 3) 固定宽度大于视口
    let fw = 0;
    const sized = doc.body ? Array.prototype.slice.call(doc.body.querySelectorAll('div,section,header,footer,main,aside,nav,table,img,video,iframe'), 0, 1200) : [];
    for (let i = 0; i < sized.length && fw < 3; i++) {
      const el = sized[i];
      if (!isVisible(el, win)) continue;
      const cs = win.getComputedStyle(el);
      const w = parseFloat(cs.width);
      const mw = parseFloat(cs.minWidth);
      const hard = (cs.width.indexOf('px') === cs.width.length - 2 && w > clientWidth + 4) ||
                   (cs.minWidth.indexOf('px') === cs.minWidth.length - 2 && mw > clientWidth + 4);
      if (!hard) continue;
      add(issues, 'FIXED_WIDTH', {
        viewports: [label], selector: cssPath(el),
        rect: rectOf(el),
        evidence: ['computed width=' + cs.width + ', min-width=' + cs.minWidth, '视口宽度 = ' + clientWidth + 'px'],
        detail: '元素「' + labelOf(el) + '」的固定宽度大于 ' + label + ' 视口。'
      });
      fw++;
    }

    // 4) 交互元素遮挡 / 点击区域
    const controls = doc.querySelectorAll('a[href], button, [role="button"], input, select, textarea, summary');
    let occ = 0, tap = 0;
    for (let i = 0; i < controls.length && i < 120; i++) {
      const el = controls[i];
      if (!isVisible(el, win)) continue;
      const r = el.getBoundingClientRect();
      if (r.right < 0 || r.left > clientWidth || r.bottom < 0 || r.top > (win.innerHeight || 900)) continue;
      if (occ < 4) {
        const cx = Math.min(clientWidth - 1, Math.max(1, r.left + r.width / 2));
        const cy = Math.min((win.innerHeight || 900) - 1, Math.max(1, r.top + r.height / 2));
        let hit = null;
        try { hit = doc.elementFromPoint(cx, cy); } catch (_) { /* noop */ }
        const ok = hit && (el === hit || el.contains(hit) || hit.contains(el));
        if (!ok) {
          add(issues, 'OCCLUDED_CONTROL', {
            viewports: [label], selector: cssPath(el),
            rect: { x: r.left, y: r.top, width: r.width, height: r.height },
            evidence: [
              '中心点 (' + Math.round(cx) + ', ' + Math.round(cy) + ') 的 elementFromPoint 命中：' + (hit ? cssPath(hit) : 'null'),
              '目标控件：' + labelOf(el)
            ],
            detail: '「' + labelOf(el) + '」在 ' + label + ' 下的中心点被其他元素覆盖。'
          });
          occ++;
        }
      }
      if (clientWidth <= 500 && tap < 3 && (r.width < 24 || r.height < 24)) {
        add(issues, 'SMALL_TAP_TARGET', {
          viewports: [label], selector: cssPath(el),
          rect: { x: r.left, y: r.top, width: r.width, height: r.height },
          evidence: ['控件尺寸 ' + Math.round(r.width) + '×' + Math.round(r.height) + 'px', '建议至少 24×24px（推荐 44×44px）'],
          detail: '「' + labelOf(el) + '」在移动端视口下点击区域偏小。'
        });
        tap++;
      }
    }

    // 5) 弹窗溢出
    const dialogs = doc.querySelectorAll('[role="dialog"], dialog[open], [aria-modal="true"], .modal.show, .modal.active, .popup.show');
    let dg = 0;
    for (let i = 0; i < dialogs.length && dg < 3; i++) {
      const el = dialogs[i];
      if (!isVisible(el, win)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > clientWidth + 2 || r.left < -2 || r.bottom > (win.innerHeight || 900) + 2) {
        add(issues, 'DIALOG_OVERFLOW', {
          viewports: [label], selector: cssPath(el),
          rect: { x: r.left, y: r.top, width: r.width, height: r.height },
          evidence: ['弹窗 rect: ' + JSON.stringify({ left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom) }), '视口: ' + clientWidth + '×' + (win.innerHeight || 900)],
          detail: '弹窗「' + labelOf(el) + '」在 ' + label + ' 下超出视口。'
        });
        dg++;
      }
    }

    // 6) 文本裁切（启发式，低优先级）
    let clip = 0;
    const blocks = doc.body ? Array.prototype.slice.call(doc.body.querySelectorAll('p,span,h1,h2,h3,h4,li,div'), 0, 800) : [];
    for (let i = 0; i < blocks.length && clip < 2; i++) {
      const el = blocks[i];
      if (!el.textContent || !el.textContent.trim()) continue;
      if (el.children.length > 2) continue;
      const cs = win.getComputedStyle(el);
      if (cs.overflow !== 'hidden' && cs.overflowY !== 'hidden') continue;
      if (el.scrollHeight > el.clientHeight + 12 && el.clientHeight > 0 && el.clientHeight < 200) {
        add(issues, 'TEXT_CLIPPED', {
          viewports: [label], selector: cssPath(el),
          rect: rectOf(el),
          evidence: ['clientHeight = ' + el.clientHeight + 'px，scrollHeight = ' + el.scrollHeight + 'px', 'computed overflow = ' + cs.overflow],
          detail: '「' + labelOf(el) + '」的内容高度超出容器高度，可能被裁切。'
        });
        clip++;
      }
    }

    return view;
  }

  function rectOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }

  /* ------------------------------------------------------------------ *
   * 静态规则（Interaction / Visual / A11y / SEO / 待验证项）
   * ------------------------------------------------------------------ */
  function collectInteraction(issues, doc, win) {
    const links = Array.prototype.slice.call(doc.querySelectorAll('a'));
    let empty = 0, brokenAnchor = 0, noName = 0;
    let emptySample = null, anchorSample = null, nameSample = null;
    const hasName = (el) => (el.textContent || '').trim() || el.getAttribute('aria-label') || el.getAttribute('title') ||
      Array.prototype.some.call(el.querySelectorAll('img'), (img) => img.getAttribute('alt'));

    for (let i = 0; i < links.length; i++) {
      const a = links[i];
      const href = a.getAttribute('href');
      const isEmpty = href === null || String(href).trim() === '' || String(href).trim() === '#' ||
        /^javascript\s*:\s*(void\s*\(0\)\s*;?|;)?\s*$/i.test(String(href));
      if (isEmpty) {
        empty++;
        if (!emptySample) emptySample = a;
      } else if (href.charAt(0) === '#' && href.length > 1) {
        let id = href.slice(1);
        try { id = decodeURIComponent(id); } catch (_) { /* noop */ }
        if (id && !doc.getElementById(id) && !doc.getElementsByName(id).length) {
          brokenAnchor++;
          if (!anchorSample) anchorSample = { el: a, id: id };
        }
      }
      if (!hasName(a)) {
        noName++;
        if (!nameSample) nameSample = a;
      }
    }

    if (empty) add(issues, 'EMPTY_LINK', {
      selector: emptySample ? cssPath(emptySample) : '',
      rect: emptySample ? rectOf(emptySample) : null,
      evidence: [
        '共发现 ' + empty + ' 个无有效目标的链接',
        '示例：' + (emptySample ? '<a href="' + (emptySample.getAttribute('href') || '(无 href)') + '">' + labelOf(emptySample) + '</a>' : '—'),
        'DOM 定位：' + (emptySample ? cssPath(emptySample) : '—')
      ],
      detail: '页面存在 ' + empty + ' 个 href="#" / 空 href / javascript:void(0) 的占位链接。'
    });

    if (brokenAnchor) add(issues, 'BROKEN_ANCHOR', {
      selector: anchorSample ? cssPath(anchorSample.el) : '',
      rect: anchorSample ? rectOf(anchorSample.el) : null,
      evidence: ['共 ' + brokenAnchor + ' 个锚点无对应目标', '示例：href="#' + anchorSample.id + '" 找不到 id/name 为 ' + anchorSample.id + ' 的元素'],
      detail: '页面存在指向不存在区块的锚点链接。'
    });

    if (noName) add(issues, 'LINK_NO_NAME', {
      selector: nameSample ? cssPath(nameSample) : '',
      rect: nameSample ? rectOf(nameSample) : null,
      evidence: ['共 ' + noName + ' 个链接没有可访问名称', '示例 DOM 定位：' + (nameSample ? cssPath(nameSample) : '—')],
      detail: '部分图标 / 空链接缺少文本或 aria-label。'
    });
  }

  function collectVisual(issues, doc, win) {
    const imgs = Array.prototype.slice.call(doc.querySelectorAll('img'));
    let broken = 0, sample = null;
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];
      const src = img.getAttribute('src');
      const srcset = img.getAttribute('srcset');
      const noSrc = !src && !srcset;
      const failed = img.complete && img.naturalWidth === 0 && img.naturalHeight === 0 && !noSrc;
      if (noSrc || failed) {
        broken++;
        if (!sample) sample = img;
      }
    }
    if (broken) add(issues, 'BROKEN_IMAGE', {
      selector: sample ? cssPath(sample) : '',
      rect: sample ? rectOf(sample) : null,
      evidence: ['共 ' + broken + ' 张图片加载失败或缺少 src', '示例 img：' + (sample ? (sample.getAttribute('src') || '(无 src)').slice(0, 160) : '—'), '示例 DOM 定位：' + (sample ? cssPath(sample) : '—')],
      detail: '页面存在 ' + broken + ' 张无法正常显示的图片。'
    });

    let failed = [];
    try {
      const entries = performance.getEntriesByType('resource');
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (e.responseStatus < 400) continue;
        // favicon 由浏览器自动请求，开发服务器常返回 404；它是品牌细节而非交付阻塞项，不计入。
        if (/\/favicon\.(ico|png|svg)(\?|$)/i.test(e.name)) continue;
        failed.push(e.name.slice(0, 160) + ' → HTTP ' + e.responseStatus);
      }
    } catch (_) { /* 部分浏览器不暴露 responseStatus */ }
    if (failed.length) add(issues, 'RESOURCE_4XX', {
      evidence: ['共 ' + failed.length + ' 个资源请求失败'].concat(failed.slice(0, 5)),
      detail: '资源面板中存在 ' + failed.length + ' 个 4xx / 5xx 请求。'
    });
  }

  function collectA11y(issues, doc, win, axeOk) {
    const imgs = Array.prototype.slice.call(doc.querySelectorAll('img'));
    let noAlt = 0, altSample = null;
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];
      const decorative = img.getAttribute('role') === 'presentation' || img.getAttribute('aria-hidden') === 'true';
      if (img.getAttribute('alt') === null && !decorative) {
        noAlt++;
        if (!altSample) altSample = img;
      }
    }
    if (noAlt) add(issues, 'IMG_NO_ALT', {
      selector: altSample ? cssPath(altSample) : '',
      rect: altSample ? rectOf(altSample) : null,
      evidence: ['共 ' + noAlt + ' 张图片缺少 alt 属性', '示例 DOM 定位：' + (altSample ? cssPath(altSample) : '—')],
      detail: '页面存在 ' + noAlt + ' 张没有替代文本的图片。'
    });

    const fields = doc.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea');
    let noLabel = 0, labelSample = null;
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (isHiddenField(f, win)) continue;
      const has = (f.labels && f.labels.length) || f.closest('label') || f.getAttribute('aria-label') || f.getAttribute('aria-labelledby');
      if (!has) {
        noLabel++;
        if (!labelSample) labelSample = f;
      }
    }
    if (noLabel) add(issues, 'FORM_NO_LABEL', {
      selector: labelSample ? cssPath(labelSample) : '',
      rect: labelSample ? rectOf(labelSample) : null,
      evidence: ['共 ' + noLabel + ' 个表单控件没有关联标签', '示例 DOM 定位：' + (labelSample ? cssPath(labelSample) : '—')],
      detail: '页面存在 ' + noLabel + ' 个仅靠 placeholder 或无标签的输入控件。'
    });

    const buttons = doc.querySelectorAll('button, [role="button"]');
    let noName = 0, nameSample = null;
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      const has = (b.textContent || '').trim() || b.getAttribute('aria-label') || b.getAttribute('aria-labelledby') || b.getAttribute('title') || b.getAttribute('value');
      if (!has) {
        noName++;
        if (!nameSample) nameSample = b;
      }
    }
    if (noName) add(issues, 'BUTTON_NO_NAME', {
      selector: nameSample ? cssPath(nameSample) : '',
      rect: nameSample ? rectOf(nameSample) : null,
      evidence: ['共 ' + noName + ' 个按钮没有可访问名称', '示例 DOM 定位：' + (nameSample ? cssPath(nameSample) : '—')],
      detail: '部分纯图标按钮缺少文本或 aria-label。'
    });

    if (!doc.documentElement.getAttribute('lang')) {
      add(issues, 'HTML_NO_LANG', {
        evidence: ['<html> 标签未声明 lang 属性'],
        detail: 'html 元素缺少 lang，屏幕阅读器无法正确选择语音。'
      });
    }

    const headings = doc.querySelectorAll('h1,h2,h3,h4,h5,h6');
    let last = 0, jumps = 0, jumpSample = null;
    for (let i = 0; i < headings.length; i++) {
      const lv = Number(headings[i].tagName.charAt(1));
      if (last && lv > last + 1) {
        jumps++;
        if (!jumpSample) jumpSample = headings[i];
      }
      last = lv;
    }
    if (jumps) add(issues, 'HEADING_ORDER', {
      selector: jumpSample ? cssPath(jumpSample) : '',
      evidence: ['共 ' + jumps + ' 处标题层级跳跃', '示例：h' + ' → ' + (jumpSample ? jumpSample.tagName.toLowerCase() : '—')],
      detail: '标题层级不连续，可能影响辅助技术理解页面结构。'
    });

    // axe 已能更准确地处理对比度；仅当 axe 不可用时用本地启发式兜底。
    if (!axeOk) collectContrast(issues, doc, win);
  }

  function collectContrast(issues, doc, win) {
    function parseColor(s) {
      const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i.exec(s || '');
      if (!m) return null;
      return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
    }
    function lum(c) {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    }
    function bg(el) {
      let cur = el;
      while (cur && cur.nodeType === 1) {
        const c = parseColor(win.getComputedStyle(cur).backgroundColor);
        if (c && c.a > 0.5) return c;
        cur = cur.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    }
    const nodes = doc.body ? Array.prototype.slice.call(doc.body.querySelectorAll('p,span,a,li,h1,h2,h3,h4,button,label,td,div'), 0, 600) : [];
    let count = 0;
    for (let i = 0; i < nodes.length && count < 4; i++) {
      const el = nodes[i];
      if (el.children.length > 1) continue;
      const text = (el.textContent || '').trim();
      if (!text || text.length < 2) continue;
      if (!isVisible(el, win)) continue;
      const cs = win.getComputedStyle(el);
      const fg = parseColor(cs.color);
      if (!fg || fg.a < 0.5) continue;
      const b = bg(el);
      const l1 = lum(fg), l2 = lum(b);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const size = parseFloat(cs.fontSize) || 16;
      const bold = parseInt(cs.fontWeight, 10) >= 700;
      const need = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5;
      if (ratio < need - 0.3) {
        add(issues, 'LOW_CONTRAST', {
          selector: cssPath(el),
          rect: rectOf(el),
          evidence: ['文字「' + text.slice(0, 24) + '」前景 ' + cs.color + ' / 背景 rgb(' + b.r + ',' + b.g + ',' + b.b + ')', '估算对比度 ' + ratio.toFixed(2) + ':1，低于 ' + need + ':1', '字号 ' + size + 'px'],
          detail: '「' + text.slice(0, 24) + '」文字与纯色背景的对比度可能不足（渐变 / 图片背景需人工复核）。'
        });
        count++;
      }
    }
  }

  function collectSeo(issues, doc, win) {
    if (!doc.querySelector('meta[name="viewport"]')) {
      add(issues, 'NO_VIEWPORT_META', {
        evidence: ['<head> 中未找到 <meta name="viewport">'],
        detail: '缺少 viewport meta，移动端会按桌面宽度缩放渲染。'
      });
    }
    if (!(doc.title || '').trim()) {
      add(issues, 'TITLE_MISSING', { evidence: ['document.title 为空'], detail: '页面没有 title。' });
    }
    const desc = doc.querySelector('meta[name="description"]');
    if (!desc || !(desc.getAttribute('content') || '').trim()) {
      add(issues, 'META_DESC_MISSING', { evidence: ['未找到非空的 <meta name="description">'], detail: '页面缺少描述信息。' });
    }
    const h1 = doc.querySelectorAll('h1');
    if (h1.length === 0) add(issues, 'H1_MISSING', { evidence: ['document.querySelectorAll("h1").length = 0'], detail: '页面没有 h1 主标题。' });
    else if (h1.length > 1) add(issues, 'H1_MULTIPLE', { evidence: ['h1 数量 = ' + h1.length], detail: '页面存在多个 h1。' });

    const canon = doc.querySelectorAll('link[rel="canonical"]');
    if (canon.length > 1) add(issues, 'CANONICAL_MULTIPLE', { evidence: ['canonical 数量 = ' + canon.length], detail: '存在多个 canonical 链接。' });

    const robots = doc.querySelector('meta[name="robots"]');
    if (robots && /noindex/i.test(robots.getAttribute('content') || '')) {
      add(issues, 'ROBOTS_NOINDEX', { evidence: ['robots meta = ' + robots.getAttribute('content')], detail: '页面被设置为 noindex，上线前需确认。' });
    }
  }

  /* ------------------------------------------------------------------ *
   * axe-core（MAIN world 桥接）
   * ------------------------------------------------------------------ */
  function requestAxe() {
    return new Promise((resolve) => {
      const id = 'axe_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      let settled = false;
      const finish = (data) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        resolve(data);
      };
      const onMessage = (ev) => {
        if (ev.source !== window || !ev.data || ev.data.__shipcheck !== 'axe-response' || ev.data.id !== id) return;
        finish(ev.data.data || {});
      };
      const timer = setTimeout(() => finish({ error: 'timeout' }), 6000);
      window.addEventListener('message', onMessage);
      window.postMessage({ __shipcheck: 'axe-request', id: id }, '*');
    });
  }

  // 本地规则已覆盖的 axe 规则，避免重复计分。
  const AXE_SKIP = new Set([
    'image-alt', 'label', 'button-name', 'html-has-lang', 'document-title',
    'meta-viewport', 'color-contrast', 'heading-order', 'link-name', 'landmark-one-main'
  ]);

  function collectAxeFindings(issues, axeData) {
    if (!axeData || !Array.isArray(axeData.violations)) return;
    for (const v of axeData.violations.slice(0, 16)) {
      if (AXE_SKIP.has(v.id)) continue;
      const sev = v.impact === 'critical' ? 'critical' : v.impact === 'serious' ? 'high' : v.impact === 'moderate' ? 'medium' : 'low';
      const nodes = v.nodes || [];
      const explain = window.ShipCheckIssueExplain?.explain(v);
      const evidence = explain ? explain.evidence.slice() : ['axe-core 规则：' + v.id + '（' + v.impact + '）', v.help || ''];
      if (!explain) for (const n of nodes.slice(0, 3)) {
        evidence.push((Array.isArray(n.target) ? n.target.join(' ') : String(n.target || '')) + (n.summary ? ' → ' + n.summary.replace(/\s+/g, ' ').slice(0, 140) : ''));
      }
      const f = {
        id: 'axe:' + v.id + '-' + Math.random().toString(36).slice(2, 7),
        rule: 'axe:' + v.id,
        module: 'a11y', severity: sev, confidence: 'confirmed', verification: false,
        title: explain?.title || ('无障碍问题：' + (v.help || v.id)),
        selector: explain?.selector || (nodes.length && Array.isArray(nodes[0].target) ? nodes[0].target.join(' ') : ''),
        viewports: ['当前页面'], evidence,
        reason: explain?.reason || v.description || '',
        solution: explain?.solution || (v.helpUrl ? '参考修复指南：' + v.helpUrl : '按 axe-core 规则说明修复'),
        elementPreview: explain?.elementPreview || '', affectedCount: explain?.affectedCount || nodes.length,
        summary: explain?.summary || '',
        detail: explain?.reason || v.description || '', rect: null,
        repro: ['在目标网页定位受影响元素：' + (explain?.selector || '见失败节点'), '确认该节点是否满足 axe-core ' + v.id + ' 规则'],
        causes: [explain?.reason || '违反 axe-core ' + v.id + ' 规则'],
        fixes: [explain?.solution || (v.helpUrl ? '参考修复指南：' + v.helpUrl : '按 axe-core 规则说明修复')],
        retest: ['重新运行 axe-core，无 ' + v.id + ' 违规节点']
      };
      issues.push(f);
    }
  }

  /* ------------------------------------------------------------------ *
   * 表单交付检查（Business Flow QA 的静态子集）
   * 全部只读：不填写、不提交、不点击，仅检查 DOM 结构与属性。
   * ------------------------------------------------------------------ */
  const FIELD_SEL = 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]), select, textarea';

  function fieldLabelText(f, doc) {
    let t = '';
    if (f.id) {
      const l = doc.querySelector('label[for="' + esc(f.id) + '"]');
      if (l) t = l.textContent || '';
    }
    if (!t) { const p = f.closest('label'); if (p) t = p.textContent || ''; }
    if (!t) t = f.getAttribute('aria-label') || '';
    if (!t) {
      const ids = (f.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
      for (const id of ids) { const n = doc.getElementById(id); if (n) t += ' ' + (n.textContent || ''); }
    }
    if (!t) t = f.getAttribute('placeholder') || '';
    return String(t).replace(/\s+/g, ' ').trim().slice(0, 60);
  }

  function collectForms(issues, doc, win) {
    const forms = Array.prototype.slice.call(doc.querySelectorAll('form'));

    // 表单外的裸字段（没有 form 归属又无 form 属性提交路径）
    for (const form of forms) {
      const sel = cssPath(form) || 'form';
      const fields = Array.prototype.slice.call(form.querySelectorAll(FIELD_SEL));
      const visible = fields.filter((f) => !isHiddenField(f, win));
      const submits = Array.from(doc.querySelectorAll('button:not([type]), button[type=submit], input[type=submit], input[type=image]')).filter((el) => el.form===form);
      const buttons = Array.prototype.slice.call(form.querySelectorAll('button'));

      if (visible.length && !submits.length) {
        add(issues, 'FORM_NO_SUBMIT_CONTROL', {
          selector: sel,
          evidence: [
            '表单内可见字段 ' + visible.length + ' 个',
            '未找到 type="submit" 的 button / input[type=submit]',
            '可用按钮：' + (buttons.length ? buttons.map((b) => '「' + labelOf(b) + '」type=' + (b.getAttribute('type') || '缺省')).join('、') : '无')
          ],
          detail: 'DOM 中没有找到与表单关联的明确提交控件；可能使用自定义 JS 或隐式提交，应手动复核。'
        });
      }

      const noName = visible.filter((f) => !f.getAttribute('name'));
      if (noName.length) {
        add(issues, 'FORM_FIELD_NO_NAME', {
          selector: sel,
          evidence: ['缺少 name 的字段 ' + noName.length + '/' + visible.length + '：' + noName.slice(0, 4).map((f) => cssPath(f)).join(' | ')],
          detail: '字段不会通过浏览器原生 FormData 自动序列化，但项目也可能通过 JS 显式收集并发送，需验证。'
        });
      }

      if (buttons.length >= 2) {
        const untyped = buttons.filter((b) => !b.hasAttribute('type'));
        const suspicious = untyped.filter((b) => /取消|返回|上一步|关闭|重置|cancel|back|close|prev|reset/i.test(labelOf(b)));
        if (suspicious.length) {
          add(issues, 'FORM_BUTTON_NO_TYPE', {
            selector: sel,
            evidence: suspicious.slice(0, 3).map((b) => '「' + labelOf(b) + '」' + cssPath(b) + ' 未声明 type'),
            detail: '<button> 在表单内默认 type="submit"，取消 / 返回类按钮会意外提交表单。'
          });
        }
      }

      if (visible.length >= 2) {
        const surface = form.querySelector('[role=alert],[aria-live],[class*=error],[class*=invalid],[data-error],[id*=error]');
        if (!surface) {
          add(issues, 'FORM_NO_ERROR_SURFACE', {
            selector: sel,
            evidence: ['字段 ' + visible.length + ' 个，未找到 role="alert" / aria-live / 错误容器'],
            detail: '静态 DOM 没有匹配到常见错误提示容器；组件可能动态生成错误提示，需在测试环境触发错误后验证。'
          });
        }
      }

      const required = visible.filter((f) => f.hasAttribute('required') || f.getAttribute('aria-required') === 'true');
      if (required.length) {
        const unhinted = required.filter((f) => !/[*＊]|必填|required/i.test(fieldLabelText(f, doc)));
        if (unhinted.length && unhinted.length === required.length) {
          add(issues, 'FORM_REQUIRED_NO_HINT', {
            selector: sel,
            evidence: ['required 字段 ' + required.length + ' 个，标签均无必填标记', '示例：' + unhinted.slice(0, 3).map((f) => '「' + (fieldLabelText(f, doc) || cssPath(f)) + '」').join('、')],
            detail: '仅靠 required 属性，用户在看到报错前不知道哪些字段必填。'
          });
        }
      }

      const mismatch = [];
      for (const f of visible) {
        const tag = f.tagName.toLowerCase();
        if (tag !== 'input') continue;
        const type = (f.getAttribute('type') || 'text').toLowerCase();
        const label = fieldLabelText(f, doc);
        const sig = [f.getAttribute('name'), f.id, f.getAttribute('placeholder'), label, f.getAttribute('autocomplete')].join(' ').toLowerCase();
        const mode = (f.getAttribute('inputmode') || '').toLowerCase();
        if (type === 'text' && /e-?mail|邮箱|邮件/.test(sig)) mismatch.push('「' + (label || cssPath(f)) + '」疑似邮箱字段却用 type="text"');
        else if (type === 'text' && !mode && /phone|tel\b|mobile|电话|手机/.test(sig)) mismatch.push('「' + (label || cssPath(f)) + '」疑似电话字段，建议 type="tel" + inputmode="tel"');
        else if (type === 'text' && /url|website|网址|官网|site/.test(sig)) mismatch.push('「' + (label || cssPath(f)) + '」疑似网址字段却用 type="text"');
      }
      if (mismatch.length) {
        add(issues, 'FORM_FIELD_TYPE_MISMATCH', {
          selector: sel,
          evidence: mismatch.slice(0, 4),
          detail: '输入类型不匹配会导致移动端键盘错误、丢失浏览器内置格式校验。'
        });
      }

      const acMissing = [];
      for (const f of visible) {
        if (f.tagName.toLowerCase() !== 'input') continue;
        const type = (f.getAttribute('type') || 'text').toLowerCase();
        const ac = (f.getAttribute('autocomplete') || '').toLowerCase();
        const label = fieldLabelText(f, doc);
        const sig = [f.getAttribute('name'), f.id, label].join(' ').toLowerCase();
        if (type === 'password') {
          if (!ac) acMissing.push('密码字段 ' + cssPath(f) + ' 缺少 autocomplete（current-password / new-password）');
          continue;
        }
        if (/e-?mail|邮箱/.test(sig) && !/email/.test(ac)) acMissing.push('邮箱字段 ' + cssPath(f) + ' 缺少 autocomplete="email"');
        else if (/name|姓名/.test(sig) && !/name/.test(ac) && type === 'text') acMissing.push('姓名字段 ' + cssPath(f) + ' 缺少 autocomplete="name"');
      }
      if (acMissing.length) {
        add(issues, 'FORM_NO_AUTOCOMPLETE', { selector: sel, evidence: acMissing.slice(0, 3), detail: '身份类字段缺少 autocomplete 会显著降低移动端填写与密码管理器成功率。' });
      }

      const action = (form.getAttribute('action') || '').trim();
      if (action && /^http:\/\//i.test(action) && win.location.protocol === 'https:') {
        add(issues, 'FORM_MIXED_CONTENT_ACTION', {
          selector: sel,
          evidence: ['页面协议 https:', '表单 action = ' + action],
          detail: 'HTTPS 页面提交到 HTTP 端点是混合内容，现代浏览器会拦截或显示不安全警告。'
        });
      }

      if (visible.length >= 3 && !isSearchForm(form)) {
        const hasGuard = form.querySelector(SPAM_GUARD_SEL);
        if (!hasGuard) {
          add(issues, 'FORM_NO_SPAM_GUARD', {
            selector: sel,
            evidence: ['可见字段 ' + visible.length + ' 个', '未发现 honeypot 隐藏字段 / Turnstile / reCAPTCHA / data-sitekey'],
            detail: '前端未发现常见反垃圾控件；服务端可能已有限流、蜜罐或验证，不可据此断言缺陷。'
          });
        }
      }
    }

    // 重复 id（全页检查，会直接破坏 label 关联与 JS 取值）
    const seen = Object.create(null);
    const dup = [];
    const all = doc.querySelectorAll('[id]');
    for (let i = 0; i < all.length; i++) {
      const id = all[i].id;
      if (!id) continue;
      if (seen[id]) { if (dup.indexOf(id) === -1) dup.push(id); } else seen[id] = 1;
    }
    if (dup.length) {
      add(issues, 'FORM_ID_DUPLICATE', {
        evidence: ['重复 id：' + dup.slice(0, 5).join(', '), '共 ' + dup.length + ' 个重复 id'],
        detail: '重复 id 会让 label[for] 指向第一个元素，后续实例的点击与无障碍关联全部错位。'
      });
    }
  }

  function isSearchForm(form) {
    const sig = ((form.getAttribute('role') || '') + ' ' + (form.getAttribute('class') || '') + ' ' + (form.getAttribute('action') || '') + ' ' + (form.getAttribute('id') || '')).toLowerCase();
    if (/search|搜索/.test(sig)) return true;
    const fields = form.querySelectorAll(FIELD_SEL);
    return fields.length <= 2 && !!form.querySelector('input[type=search],input[name=s i],input[name=q i]');
  }

  /* ------------------------------------------------------------------ *
   * 视口模拟：同源 iframe + sandbox（不上传 Cookie、不触发顶层跳转）
   * ------------------------------------------------------------------ */
  function blockedView(label, width, note) {
    return {
      label, width, height: 0, clientWidth: width, scrollWidth: width, overflowPx: 0,
      dpr: 1, blocked: true, note, issues: []
    };
  }

  async function measureInIframe(width, timeout) {
    const label = width + 'px';
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-same-origin allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    frame.setAttribute('title', 'shipcheck-viewport-' + width);
    Object.assign(frame.style, {
      position: 'fixed', left: '-100000px', top: '0px', width: width + 'px', height: '860px',
      border: '0', opacity: '0', pointerEvents: 'none', zIndex: '-2147483647', background: '#fff'
    });
    frame.src = location.href;

    let loaded = false;
    try {
      document.documentElement.appendChild(frame);
      loaded = await new Promise((resolve) => {
        let done = false;
        const finish = (v) => { if (done) return; done = true; clearTimeout(t); resolve(v); };
        const t = setTimeout(() => finish(false), timeout);
        frame.addEventListener('load', () => setTimeout(() => finish(true), 450), { once: true });
        frame.addEventListener('error', () => finish(false), { once: true });
      });
      if (loaded) await wait(350);
      let cw = frame.contentWindow;
      let cd = frame.contentDocument;
      if (!cw || !cd || !cd.body || cd.body.children.length === 0) {
        await wait(700);
        cw = frame.contentWindow;
        cd = frame.contentDocument;
      }
      if (!loaded || !cw || !cd || !cd.body || cd.body.children.length === 0 || (cd.URL || '').indexOf('about:') === 0) {
        return blockedView(label, width, '该站点禁止被嵌入（X-Frame-Options / CSP frame-ancestors），或视口渲染超时；此视口结果不可用。');
      }
      const v = analyzeViewport(cd, cw, label);
      v.requestedWidth = width;
      return v;
    } catch (err) {
      return blockedView(label, width, '视口渲染异常：' + String(err && err.message ? err.message : err));
    } finally {
      try { frame.remove(); } catch (_) { /* noop */ }
    }
  }

  async function renderViewports(widths, timeout, onStep) {
    const out = [];
    const currentW = document.documentElement.clientWidth || window.innerWidth;
    out.push(analyzeViewport(document, window, '当前视口 ' + currentW + 'px'));
    const targets = widths.filter((w) => Math.abs(w - currentW) > 60);
    for (let i = 0; i < targets.length; i++) {
      if (onStep) onStep(i, targets.length, targets[i]);
      out.push(await measureInIframe(targets[i], timeout));
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 证据去重 / 严重等级 / 评分
   * ------------------------------------------------------------------ */
  function normalize(findings) {
    const map = new Map();
    for (const f of findings) {
      // 同一规则 + 同一 DOM 定位视作同一个根因；不同视口只合并进 viewports，不重复计分。
      const key = f.rule + '|' + (f.selector || '');
      const prev = map.get(key);
      if (prev) {
        for (const v of f.viewports) if (prev.viewports.indexOf(v) === -1) prev.viewports.push(v);
        if (SEV_ORDER[f.severity] > SEV_ORDER[prev.severity]) prev.severity = f.severity;
        for (const e of f.evidence) if (prev.evidence.indexOf(e) === -1 && prev.evidence.length < 9) prev.evidence.push(e);
        if (!prev.rect && f.rect) prev.rect = f.rect;
        prev.occurrences = (prev.occurrences || 1) + 1;
      } else {
        map.set(key, Object.assign({}, f, { viewports: f.viewports.slice(), evidence: f.evidence.slice(), occurrences: 1 }));
      }
    }
    const list = Array.from(map.values());
    list.sort((a, b) => (SEV_ORDER[b.severity] - SEV_ORDER[a.severity]) || (a.module || '').localeCompare(b.module || '') || a.title.localeCompare(b.title));
    return list;
  }

  function computeScore(findings) {
    const byRule = {};
    for (const f of findings) {
      if (f.verification) continue;
      if (!byRule[f.rule]) byRule[f.rule] = { w: 0, n: 0 };
      byRule[f.rule].w = Math.max(byRule[f.rule].w, SEV_WEIGHT[f.severity] || 1);
      byRule[f.rule].n += 1;
    }
    let deduct = 0;
    for (const k in byRule) {
      const g = byRule[k];
      deduct += g.w * (1 + Math.min(g.n - 1, 4) * 0.3);
    }
    // 单一扣分上限，避免「缺陷多但可修复」的页面直接被判 0 分而失去参考意义。
    return Math.max(10, Math.min(100, Math.round(100 - Math.min(deduct, 90))));
  }

  /* ------------------------------------------------------------------ *
   * 静态规则汇总（不依赖视口渲染，可被扩展与 MCP Server 复用）
   * ------------------------------------------------------------------ */
  async function collectStatic(o, m, notes) {
    const staticFindings = [];
    let axeData = null;
    let axeOk = false;
    if (o && o.axeEnabled && m.a11y) {
      progress('运行 axe-core 无障碍规则', 18);
      axeData = await requestAxe();
      axeOk = !!(axeData && Array.isArray(axeData.violations));
      if (!axeOk) notes.push('axe-core 未就绪或页面 CSP 阻止了注入，已回退到本地确定性无障碍规则。');
    }
    const safe = (name, fn) => {
      try { fn(); } catch (err) { notes.push(name + ' 规则执行异常：' + String(err && err.message ? err.message : err)); }
    };
    if (m.interaction) safe('Interaction QA', () => collectInteraction(staticFindings, document, window));
    if (m.visual) safe('Visual QA', () => collectVisual(staticFindings, document, window));
    if (m.a11y) {
      safe('Accessibility', () => collectA11y(staticFindings, document, window, axeOk));
      safe('axe-core', () => collectAxeFindings(staticFindings, axeData));
    }
    if (m.seo) safe('Basic SEO', () => collectSeo(staticFindings, document, window));
    if (m.business) {
      safe('Form delivery', () => collectForms(staticFindings, document, window));
      // v0.9: no synthetic 'manual acceptance pending' findings. Only actual structure checks.
    }
    return { staticFindings, axeOk };
  }

  /* ------------------------------------------------------------------ *
   * 主流程
   * ------------------------------------------------------------------ */
  async function runScan(options) {
    const o = options || {};
    const widths = (Array.isArray(o.widths) && o.widths.length ? o.widths : [390, 768, 1440])
      .map(Number).filter((w) => w >= 240 && w <= 2560);
    const timeout = Math.max(1500, Math.min(9000, Number(o.timeout) || 3500));
    const m = Object.assign(
      { responsive: true, interaction: true, visual: true, a11y: true, seo: true, geo: true, business: true },
      o.modules || {}
    );
    const notes = [];
    const started = Date.now();

    if (!IS_TOP) {
      return { error: '扫描引擎只能在顶层页面运行', engine: ENGINE_VERSION };
    }

    progress('采集页面结构与静态规则', 10);
    const { staticFindings } = await collectStatic(o, m, notes);
    let searchReadiness = null;
    if (m.seo || m.geo) {
      try { if (window.ShipCheckSearch) {
        searchReadiness = window.ShipCheckSearch.run(document, window);
        searchReadiness.checks = searchReadiness.checks.filter(x => x.group === 'seo' ? m.seo : m.geo);
        searchReadiness.summary = {pass:0,attention:0,unverified:0};
        for (const x of searchReadiness.checks) searchReadiness.summary[x.status]++;
      } else notes.push('搜索准备度模块未加载；本轮仅运行原有基础 SEO 规则。'); }
      catch (err) { notes.push('搜索准备度分析失败：'+String(err.message||err)); }
    }

    progress('静态规则扫描完成', 32);

    let viewports = [];
    if (m.responsive) {
      viewports = await renderViewports(widths, timeout, (i, total, w) => {
        progress('渲染 ' + w + 'px 视口 (' + (i + 1) + '/' + total + ')', 35 + Math.round(45 * (i + 1) / total));
      });
      const blocked = viewports.filter((v) => v.blocked);
      if (blocked.length) notes.push(blocked.length + ' 个视口因站点禁止嵌入而未渲染，已用其余视口的结果继续分析。');
    } else {
      viewports = [analyzeViewport(document, window, '当前视口')];
    }

    progress('证据关联、去重与严重等级判定', 84);
    const viewportFindings = [];
    for (const v of viewports) for (const f of v.issues) viewportFindings.push(f);
    const findings = normalize(staticFindings.concat(viewportFindings));
    const scored = findings.filter((f) => !f.verification);
    const verification = findings.filter((f) => f.verification);
    const counts = { total: scored.length, critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of scored) counts[f.severity] += 1;

    progress('生成修复任务与交付报告', 96);
    return {
      engine: ENGINE_VERSION,
      url: location.href,
      title: document.title || '',
      searchReadiness,
      pageSignals: {
        description: (document.querySelector('meta[name=description]')?.content || '').slice(0,600),
        headings: Array.from(document.querySelectorAll('h1,h2')).slice(0,15).map(x=>(x.textContent||'').trim().slice(0,110)),
        navigation: Array.from(document.querySelectorAll('nav a')).slice(0,25).map(x=>(x.textContent||'').trim().slice(0,70)),
        actions: Array.from(document.querySelectorAll('a,button')).filter(x=>/quote|rfq|contact|cart|book|trial|sign up|询盘|联系|购买|预约/i.test(x.textContent||'')).slice(0,12).map(x=>(x.textContent||'').trim().slice(0,70)),
        formCount: document.querySelectorAll('form').length
      },
      time: new Date().toISOString(),
      dpr: window.devicePixelRatio || 1,
      userAgent: navigator.userAgent,
      score: computeScore(findings),
      counts,
      viewports: viewports.map((v) => ({
        label: v.label,
        width: v.width,
        clientWidth: v.clientWidth,
        scrollWidth: v.scrollWidth,
        height: v.height,
        overflowPx: v.overflowPx,
        dpr: v.dpr,
        blocked: !!v.blocked,
        note: v.note || '',
        requestedWidth: v.requestedWidth || null,
        issueCount: (v.issues || []).length
      })),
      findings,
      verification,
      notes,
      modules: m,
      widths,
      durationMs: Date.now() - started
    };
  }

  // 供冒烟测试 / 调试 / MCP Server 复用
  window.__shipcheck = {
    runScan, runStatic: collectStatic, analyzeViewport, collectForms, collectAxeFindings,
    cssPath, RULES, MODULE_LABEL, normalize, computeScore, ENGINE_VERSION
  };

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.type === 'SHIPCHECK_REVEAL') {
        try {
          const el=msg.selector ? document.querySelector(msg.selector) : null;
          if(!el) {sendResponse({ok:false,error:'未找到对应 DOM 元素，请重新扫描'});return undefined;}
          const old=document.getElementById('__shipcheck_focus_overlay');if(old)old.remove();
          el.scrollIntoView({behavior:'smooth',block:'center',inline:'center'});
          const frame=document.createElement('div');frame.id='__shipcheck_focus_overlay';
          frame.style.cssText='position:fixed;z-index:2147483647;pointer-events:none;border:3px solid #f43f5e;border-radius:7px;box-shadow:0 0 0 9999px rgba(6,18,24,.08),0 0 0 6px rgba(244,63,94,.2);transition:all .18s;';
          const badge=document.createElement('div');badge.textContent='ShipCheck · '+String(msg.title||'缺陷').slice(0,90);badge.style.cssText='position:absolute;bottom:calc(100% + 5px);left:0;max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:#be123c;color:#fff;border-radius:5px;padding:6px 9px;font:600 12px/1.3 system-ui,sans-serif;';frame.appendChild(badge);
          const sync=()=>{const r=el.getBoundingClientRect();frame.style.left=Math.max(0,r.left-3)+'px';frame.style.top=Math.max(0,r.top-3)+'px';frame.style.width=Math.max(3,r.width+6)+'px';frame.style.height=Math.max(3,r.height+6)+'px';};
          document.documentElement.appendChild(frame);sync();window.addEventListener('scroll',sync,true);window.addEventListener('resize',sync);
          const cleanup=()=>{frame.remove();window.removeEventListener('scroll',sync,true);window.removeEventListener('resize',sync);};
          setTimeout(cleanup,11000);sendResponse({ok:true});
        } catch(e) {sendResponse({ok:false,error:String(e&&e.message||e)});}
        return undefined;
      }
      if (!msg || msg.type !== 'SHIPCHECK_SCAN') return undefined;
      runScan(msg.options || {})
        .then((result) => sendResponse({ ok: true, result }))
        .catch((err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
      return true; // 保持消息通道，等待异步响应
    });
  }
})();
