/* 移动端浏览器栏颜色跟随当前档案载体与明暗。
 *
 * 读计算值而不是维护一张映射表：--c-bg 由载体层（data-style × data-theme ×
 * prefers-color-scheme）自行解析，四种组合共用这一条路径，永远不会有第二份拷贝。
 */

const THEME_COLOR_SELECTOR = 'meta[name="theme-color"]';

function syncThemeColor(): void {
  const meta = document.querySelector<HTMLMetaElement>(THEME_COLOR_SELECTOR);
  if (!meta) return;
  const background = getComputedStyle(document.documentElement)
    .getPropertyValue('--c-bg')
    .trim();
  if (background && meta.getAttribute('content') !== background) {
    meta.setAttribute('content', background);
  }
}

export function initThemeColorSync(): void {
  syncThemeColor();
  new MutationObserver(syncThemeColor).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-style'],
  });
  // data-theme="system" 时，明暗切换发生在媒体查询里，属性不会变 —— 单独监听。
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    syncThemeColor();
  });
}
