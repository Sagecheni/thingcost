import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Trash2 } from 'lucide-react';

import { api } from '../lib/api.js';
import { queryKeys } from '../lib/query-keys.js';

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function RecycleBinPage() {
  const queryClient = useQueryClient();
  const recycleBin = useQuery({
    queryKey: queryKeys.recycleBin,
    queryFn: api.recycleBin,
  });
  const restore = useMutation({
    mutationFn: api.restoreAsset,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.recycleBin }),
        queryClient.invalidateQueries({ queryKey: queryKeys.assetLists }),
      ]);
    },
  });
  const permanentlyDelete = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.permanentlyDeleteAsset(id, name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.recycleBin });
    },
  });

  return (
    <>
      <header className="topbar page-topbar">
        <div>
          <p className="eyebrow">Recycle bin</p>
          <h1>物品回收站</h1>
          <p className="muted-copy">
            删除后的物品保留 30 天。恢复不会改写历史；永久删除不可撤销。
          </p>
        </div>
      </header>

      {recycleBin.isPending ? <div className="page-loading">正在读取回收站…</div> : null}
      {recycleBin.isError ? (
        <div className="form-error">{recycleBin.error.message}</div>
      ) : null}
      {restore.isError ? <div className="form-error">{restore.error.message}</div> : null}
      {permanentlyDelete.isError ? (
        <div className="form-error">{permanentlyDelete.error.message}</div>
      ) : null}

      {!recycleBin.isPending && (recycleBin.data?.items.length ?? 0) === 0 ? (
        <div className="empty-state">
          <span className="empty-pixel">空</span>
          <h3>回收站是空的</h3>
          <p>移入回收站的物品会在这里等待恢复或到期清理。</p>
        </div>
      ) : null}

      <div className="recycle-list">
        {(recycleBin.data?.items ?? []).map((item) => (
          <article className="recycle-card" key={item.id}>
            <div>
              <span className="status-chip">{item.category.name}</span>
              <h2>{item.name}</h2>
              <p>移入时间：{formatDateTime(item.deletedAt)}</p>
              <p>
                自动清理：
                {item.purgeAfter ? formatDateTime(item.purgeAfter) : '未安排'}
              </p>
            </div>
            <div className="recycle-actions">
              <button
                className="secondary-action"
                type="button"
                disabled={restore.isPending || permanentlyDelete.isPending}
                onClick={() => restore.mutate(item.id)}
              >
                <RotateCcw size={16} /> 恢复
              </button>
              <button
                className="danger-action"
                type="button"
                disabled={restore.isPending || permanentlyDelete.isPending}
                onClick={() => {
                  const confirmation = window.prompt(
                    `永久删除不可恢复。请输入物品名称“${item.name}”确认：`,
                  );
                  if (confirmation === item.name) {
                    permanentlyDelete.mutate({ id: item.id, name: item.name });
                  }
                }}
              >
                <Trash2 size={16} /> 永久删除
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
