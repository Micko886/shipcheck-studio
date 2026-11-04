/* ShipCheck AI · Service Worker (MV3)
 * 职责：声明 Side Panel 行为、提供旧版 Chrome 的降级入口、维护扫描历史上限、
 *      在用户显式授权后提供多视口精确截图。
 * 不采集、不转发任何页面内容。
 */

const MAX_HISTORY = 12;

/* ------------------------------------------------------------------ *
 * 多视口精确截图（可选 debugger 权限）
 * 只有在用户于设置里打开开关并同意授权后才会执行；
 * 截图仅回传给侧边栏做本机基线对比，不上传。
 * ------------------------------------------------------------------ */
async function captureViewports(tabId, widths) {
  const target = { tabId };
  const shots = [];
  await chrome.debugger.attach(target, '1.3');
  try {
    await chrome.debugger.sendCommand(target, 'Page.enable', {});
    for (const w of widths) {
      const width = Math.max(240, Math.min(2560, Number(w) || 390));
      await chrome.debugger.sendCommand(target, 'Emulation.setDeviceMetricsOverride', {
        width: width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 700
      });
      // 等待重排 + 媒体查询生效后再截
      await new Promise((r) => setTimeout(r, 700));
      const res = await chrome.debugger.sendCommand(target, 'Page.captureScreenshot', {
        format: 'jpeg',
        quality: 62,
        fromSurface: true,
        captureBeyondViewport: false
      });
      if (res && res.data) shots.push({ width: width, dataUrl: 'data:image/jpeg;base64,' + res.data });
    }
  } finally {
    try { await chrome.debugger.sendCommand(target, 'Emulation.clearDeviceMetricsOverride', {}); } catch (_) { /* noop */ }
    try { await chrome.debugger.detach(target); } catch (_) { /* noop */ }
  }
  return shots;
}

async function enableActionClick() {
  if (!chrome.sidePanel || !chrome.sidePanel.setPanelBehavior) return false;
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    return true;
  } catch (err) {
    console.warn('[ShipCheck] setPanelBehavior 失败:', err);
    return false;
  }
}

// 降级：若浏览器不支持 openPanelOnActionClick，则点击图标时手动打开侧边栏。
// 仅在 action 没有 default_popup 时 onClicked 才会触发。
chrome.action.onClicked.addListener(async (tab) => {
  if (!chrome.sidePanel || !chrome.sidePanel.open) return;
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (err) {
    console.warn('[ShipCheck] 无法打开侧边栏:', err);
  }
});

chrome.runtime.onInstalled.addListener(() => {
  enableActionClick();
  chrome.storage.local.get('shipcheck.settings').then((res) => {
    if (!res['shipcheck.settings']) {
      chrome.storage.local.set({
        'shipcheck.settings': {
          widths: [390, 768, 1440],
          modules: { responsive: true, interaction: true, visual: true, a11y: true, seo: true, geo: true, business: true },
          axe: true,
          baseline: true,
          maxPages: 20,
          autoLocalLighthouse: true
        }
      });
    }
  });
});

// Service Worker 冷启动时也要恢复行为设置。
enableActionClick();

// 侧边栏写入历史后，由后台统一裁剪长度，避免侧边栏被关闭时遗漏。
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return undefined;

  if (msg.type === 'SHIPCHECK_CAPTURE_VIEWPORTS') {
    const tabId = msg.tabId || (sender && sender.tab && sender.tab.id);
    if (!tabId) { sendResponse({ ok: false, error: '缺少 tabId' }); return undefined; }
    const widths = Array.isArray(msg.widths) && msg.widths.length ? msg.widths.slice(0, 4) : [390, 768, 1440];
    captureViewports(tabId, widths)
      .then((shots) => sendResponse({ ok: true, shots }))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
    return true;
  }

  if (msg.type !== 'SHIPCHECK_HISTORY_TRIM') {
    return undefined;
  }
  chrome.storage.local
    .get('shipcheck.history')
    .then((res) => {
      const list = Array.isArray(res['shipcheck.history']) ? res['shipcheck.history'] : [];
      const trimmed = list.slice(0, MAX_HISTORY);
      return chrome.storage.local.set({ 'shipcheck.history': trimmed }).then(() => trimmed);
    })
    .then(sendResponse)
    .catch((err) => sendResponse({ error: String(err) }));
  return true;
});
