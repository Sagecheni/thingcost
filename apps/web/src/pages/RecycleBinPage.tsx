import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { api } from '../lib/api.js';
import { queryKeys } from '../lib/query-keys.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { ConfirmDialog } from '../components/ui/confirm-dialog.js';
import { EmptyState } from '../components/ui/empty-state.js';
import { FormError } from '../components/ui/form.js';
import { StubGhostGrid } from '../components/ui/ledger-skeleton.js';
import { PageHeader } from '../components/ui/page-header.js';

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
  const busy = restore.isPending || permanentlyDelete.isPending;
  /* 永久删除要求输入物品名称，由确认面板把关 */
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(
    null,
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader
        eyebrow="Recycle bin"
        title="物品回收站"
        description="删除后的物品保留 30 天。恢复不会改写历史；永久删除不可撤销。"
      />

      {recycleBin.isPending ? <StubGhostGrid count={6} /> : null}
      <FormError>{recycleBin.error?.message}</FormError>
      <FormError>{restore.error?.message}</FormError>
      <FormError>{permanentlyDelete.error?.message}</FormError>

      {!recycleBin.isPending && (recycleBin.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          title="回收站是空的"
          description="移入回收站的物品会在这里等待恢复或到期清理。"
        />
      ) : null}

      <div className="flex flex-col gap-3">
        {(recycleBin.data?.items ?? []).map((item) => (
          <article
            data-slot="card"
            className="flex flex-wrap items-start justify-between gap-3 p-4"
            key={item.id}
          >
            <div className="min-w-0 space-y-1">
              <Badge variant="outline">{item.category.name}</Badge>
              <h2 className="text-base font-semibold text-heading">{item.name}</h2>
              <p data-slot="amount" className="text-xs text-muted-foreground">
                移入时间：{formatDateTime(item.deletedAt)}
              </p>
              <p data-slot="amount" className="text-xs text-muted-foreground">
                自动清理：{item.purgeAfter ? formatDateTime(item.purgeAfter) : '未安排'}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                variant="secondary"
                type="button"
                disabled={busy}
                onClick={() => restore.mutate(item.id)}
              >
                <RotateCcw aria-hidden="true" /> 恢复
              </Button>
              <Button
                variant="destructive"
                type="button"
                disabled={busy}
                onClick={() => setPendingDelete({ id: item.id, name: item.name })}
              >
                <Trash2 aria-hidden="true" /> 永久删除
              </Button>
            </div>
          </article>
        ))}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete ? `永久删除“${pendingDelete.name}”？` : ''}
        description="物品与其历史将从账中核销，归档不再保留名称记录。"
        requireText={pendingDelete?.name}
        requireTextHint="永久删除不可恢复。请输入物品名称原文确认。"
        confirmLabel="永久删除"
        pendingLabel="正在核销…"
        pending={permanentlyDelete.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          permanentlyDelete.mutate(pendingDelete, {
            onSuccess: () => setPendingDelete(null),
          });
        }}
      />
    </div>
  );
}
