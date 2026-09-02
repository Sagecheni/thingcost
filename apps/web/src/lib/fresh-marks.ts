import { useEffect, useState } from 'react';

/* 新记录的墨。
 *
 * 写操作成功后给刚写下的实体盖一个"新鲜"标记：那一行短暂显眼（墨迹未干），
 * 然后归于平静。标记按实体 id 记在模块级 Map 里，组件用 useFreshMark 订阅。
 * 过期由 TTL 清理 —— 一秒钟后谁都不记得它新，账本只记录事实不记录情绪。
 */

const FRESH_TTL_MS = 2500;
const FRESH_HIGHLIGHT_MS = 900;

const freshIds = new Set<string>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function markFresh(id: string | null | undefined): void {
  if (!id) return;
  if (freshIds.has(id)) return;
  freshIds.add(id);
  emit();
  window.setTimeout(() => {
    if (freshIds.delete(id)) emit();
  }, FRESH_TTL_MS);
}

function isFresh(id: string | null | undefined): boolean {
  return id !== null && id !== undefined && freshIds.has(id);
}

/* 组件挂载时若 id 正新鲜 → 立即点亮；之后写操作命中同一 id
 * （就地更新不重新挂载）也会点亮。点亮持续一个动效周期后熄灭。 */
export function useFreshMark(id: string | null | undefined): boolean {
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    if (!id) return;
    let timer: number | undefined;
    const check = () => {
      if (isFresh(id)) {
        setFresh(true);
        window.clearTimeout(timer);
        timer = window.setTimeout(() => setFresh(false), FRESH_HIGHLIGHT_MS);
      }
    };
    check();
    listeners.add(check);
    return () => {
      listeners.delete(check);
      window.clearTimeout(timer);
    };
  }, [id]);

  return fresh;
}
