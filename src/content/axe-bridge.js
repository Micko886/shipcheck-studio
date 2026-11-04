/* ShipCheck AI · axe-core 桥接脚本（注入 MAIN world）
 * 扫描引擎运行在 ISOLATED world，无法直接读取页面世界的 window.axe。
 * 这里在页面世界接收请求、运行 axe.run()，再用 postMessage 把结果回传。
 * 只有违规摘要（规则 id / 影响等级 / 选择器 / 失败摘要）会离开页面世界。
 */
(() => {
  'use strict';
  if (window.__shipcheckAxeBridgeReady) return;
  window.__shipcheckAxeBridgeReady = true;

  const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.__shipcheck !== 'axe-request') return;

    const reply = (payload) => {
      window.postMessage(
        { __shipcheck: 'axe-response', id: data.id, data: payload },
        '*'
      );
    };

    if (!window.axe || typeof window.axe.run !== 'function') {
      reply({ error: 'axe-core 未就绪' });
      return;
    }

    try {
      const result = await window.axe.run(document, {
        runOnly: { type: 'tag', values: TAGS },
        resultTypes: ['violations'],
        reporter: 'v2'
      });
      reply({
        violations: (result.violations || []).map((v) => ({
          id: v.id,
          impact: v.impact || 'minor',
          help: v.help,
          description: v.description,
          helpUrl: v.helpUrl,
          nodeCount: (v.nodes || []).length,
          nodes: (v.nodes || []).slice(0, 6).map((n) => ({
            target: n.target,
            html: (n.html || '').slice(0, 240),
            summary: (n.failureSummary || '').slice(0, 500)
          }))
        }))
      });
    } catch (err) {
      reply({ error: String(err && err.message ? err.message : err) });
    }
  });
})();
