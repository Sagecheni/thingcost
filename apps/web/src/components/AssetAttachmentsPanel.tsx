import { useMutation } from '@tanstack/react-query';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  ImagePlus,
  Images,
  Pencil,
  Star,
  Trash2,
} from 'lucide-react';
import { type ChangeEvent, useRef, useState } from 'react';

import type {
  AssetAttachment,
  AssetDetail,
  UpdateAssetAttachmentInput,
} from '@thingcost/contracts';
import { cn } from '@thingcost/ui';

import { api } from '../lib/api.js';
import { Button, buttonVariants } from './ui/button.js';
import { ConfirmDialog } from './ui/confirm-dialog.js';
import { FormError, Panel } from './ui/form.js';

interface AssetAttachmentsPanelProps {
  asset: AssetDetail;
  onUpdated: () => Promise<void>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) {
    return `${String(bytes)} B`;
  }

  if (bytes < 1_048_576) {
    return `${(bytes / 1_024).toFixed(1)} KB`;
  }

  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

/* 上传入口是 label 包着隐藏的 file input —— 按钮样式借 buttonVariants，
 * 不新造一套。 */
const uploadTrigger = cn(
  buttonVariants({ variant: 'secondary', size: 'sm' }),
  'cursor-pointer [&>input]:sr-only',
);

/* 缩略图上的小操作：贴在卡片底部一条，不用悬停才出现 ——
 * 产品要求信息不依赖悬停。 */
const tileAction = cn(
  'flex size-7 items-center justify-center border border-border bg-card',
  'text-muted-foreground transition duration-150',
  'hover:border-border-strong hover:text-foreground',
  'disabled:pointer-events-none disabled:opacity-40',
);

export function AssetAttachmentsPanel({ asset, onUpdated }: AssetAttachmentsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [editingCaptionId, setEditingCaptionId] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [pendingRemove, setPendingRemove] = useState<AssetAttachment | null>(null);
  const photos = asset.attachments.filter((attachment) => attachment.kind === 'photo');
  const documents = asset.attachments.filter(
    (attachment) => attachment.kind === 'document',
  );
  const cover = asset.coverAttachment ?? photos[0] ?? null;

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        await api.uploadAttachment(asset.id, file);
      }
    },
    onSuccess: async () => {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      if (cameraInputRef.current) {
        cameraInputRef.current.value = '';
      }
      await onUpdated();
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({
      attachmentId,
      input,
    }: {
      attachmentId: string;
      input: UpdateAssetAttachmentInput;
    }) => api.updateAttachment(asset.id, attachmentId, input),
    onSuccess: async () => {
      setEditingCaptionId(null);
      await onUpdated();
    },
  });
  const reorderMutation = useMutation({
    mutationFn: async ({
      current,
      neighbor,
    }: {
      current: AssetAttachment;
      neighbor: AssetAttachment;
    }) => {
      await api.updateAttachment(asset.id, current.id, {
        sortOrder: neighbor.sortOrder,
      });
      await api.updateAttachment(asset.id, neighbor.id, {
        sortOrder: current.sortOrder,
      });
    },
    onSuccess: onUpdated,
  });
  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) => api.deleteAttachment(asset.id, attachmentId),
    onSuccess: onUpdated,
  });

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) {
      uploadMutation.mutate(files);
    }
  };
  const error =
    uploadMutation.error?.message ??
    updateMutation.error?.message ??
    reorderMutation.error?.message ??
    deleteMutation.error?.message;
  const busy =
    uploadMutation.isPending ||
    updateMutation.isPending ||
    reorderMutation.isPending ||
    deleteMutation.isPending;

  const removeAttachment = (attachment: AssetAttachment) => {
    setPendingRemove(attachment);
  };

  const captionEditor = (attachmentId: string) => (
    <form
      className="flex gap-2 pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        updateMutation.mutate({
          attachmentId,
          input: { caption: caption.trim() || null },
        });
      }}
    >
      <input
        data-slot="field"
        className="h-8 min-w-0 flex-1 px-2 text-xs text-foreground focus-visible:outline-none"
        value={caption}
        onChange={(event) => setCaption(event.target.value)}
        placeholder="照片说明"
        maxLength={500}
        autoFocus
      />
      <Button size="sm" className="h-8 shrink-0" disabled={updateMutation.isPending}>
        保存
      </Button>
    </form>
  );

  return (
    <Panel
      eyebrow="Private archive"
      title="影像与凭证"
      description="文件保存在私有目录中，只有登录后才能读取。"
      action={
        <>
          <label className={uploadTrigger}>
            <ImagePlus aria-hidden="true" />
            {uploadMutation.isPending ? '正在上传…' : '上传文件'}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
              onChange={handleFiles}
              disabled={busy}
            />
          </label>
          <label className={uploadTrigger}>
            <Camera aria-hidden="true" /> 拍照
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={handleFiles}
              disabled={busy}
            />
          </label>
        </>
      }
    >
      {asset.attachments.length === 0 ? (
        <button
          type="button"
          className={cn(
            'flex flex-col items-center justify-center gap-2 border border-dashed',
            'border-border bg-muted/35 px-6 py-10 text-center',
            'hover:border-border-strong disabled:pointer-events-none disabled:opacity-45',
          )}
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
        >
          <Images aria-hidden="true" className="size-7 text-muted-foreground" />
          <strong className="text-sm font-medium text-heading">
            添加第一张照片或凭证
          </strong>
          <span className="text-xs text-muted-foreground">
            支持 JPEG、PNG、WebP、GIF 与 PDF；单文件限制以服务端设置为准。
          </span>
        </button>
      ) : (
        <>
          {cover ? (
            <div className="flex flex-col gap-4 sm:flex-row">
              <a
                className="relative block shrink-0 border border-border"
                href={cover.contentUrl}
                target="_blank"
                rel="noreferrer"
                data-slot="photo-mount"
              >
                {/* 真实照片保持原样，不做任何滤镜或像素化 */}
                <img
                  className="block h-40 w-full object-cover sm:w-56"
                  src={cover.thumbnailUrl ?? cover.contentUrl}
                  alt={cover.caption || `${asset.name}封面`}
                />
                <span className="absolute bottom-0 left-0 flex items-center gap-1 bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">
                  <Star aria-hidden="true" className="size-3" fill="currentColor" />
                  当前封面
                </span>
              </a>
              <div className="min-w-0 flex-1 space-y-1">
                <p data-slot="ledger-label">Cover memory</p>
                <h3 className="text-sm font-semibold text-heading">
                  {cover.caption || cover.originalName}
                </h3>
                <p data-slot="amount" className="text-xs text-muted-foreground">
                  {cover.width && cover.height
                    ? `${String(cover.width)} × ${String(cover.height)} · `
                    : ''}
                  {formatBytes(cover.sizeBytes)}
                </p>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  type="button"
                  onClick={() => {
                    setEditingCaptionId(cover.id);
                    setCaption(cover.caption ?? '');
                  }}
                >
                  编辑说明
                </Button>
              </div>
            </div>
          ) : null}

          {photos.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 data-slot="ledger-label">照片</h3>
                <span data-slot="amount" className="text-xs text-muted-foreground">
                  {photos.length} 张
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {photos.map((photo, index) => (
                  <article
                    className={cn(
                      'flex flex-col border border-border',
                      photo.isCover && 'border-primary',
                    )}
                    key={photo.id}
                  >
                    <a
                      href={photo.contentUrl}
                      target="_blank"
                      rel="noreferrer"
                      data-slot="photo-mount"
                    >
                      <img
                        className="block h-32 w-full object-cover"
                        src={photo.thumbnailUrl ?? photo.contentUrl}
                        alt={photo.caption || photo.originalName}
                        loading="lazy"
                      />
                    </a>
                    <div className="min-w-0 space-y-0.5 px-2.5 pt-2">
                      <strong className="block truncate text-xs font-medium text-heading">
                        {photo.caption || photo.originalName}
                      </strong>
                      <small data-slot="amount" className="text-xs text-muted-foreground">
                        {formatBytes(photo.sizeBytes)}
                      </small>
                    </div>
                    <div className="flex flex-wrap gap-1 px-2.5 pt-2 pb-2.5">
                      <button
                        className={tileAction}
                        type="button"
                        title="前移"
                        aria-label="前移"
                        disabled={busy || index === 0}
                        onClick={() => {
                          const neighbor = photos[index - 1];
                          if (neighbor)
                            reorderMutation.mutate({ current: photo, neighbor });
                        }}
                      >
                        <ChevronLeft aria-hidden="true" className="size-3.5" />
                      </button>
                      <button
                        className={tileAction}
                        type="button"
                        title="后移"
                        aria-label="后移"
                        disabled={busy || index === photos.length - 1}
                        onClick={() => {
                          const neighbor = photos[index + 1];
                          if (neighbor)
                            reorderMutation.mutate({ current: photo, neighbor });
                        }}
                      >
                        <ChevronRight aria-hidden="true" className="size-3.5" />
                      </button>
                      {!photo.isCover ? (
                        <button
                          className={tileAction}
                          type="button"
                          title="设为封面"
                          aria-label="设为封面"
                          disabled={busy}
                          onClick={() =>
                            updateMutation.mutate({
                              attachmentId: photo.id,
                              input: { isCover: true },
                            })
                          }
                        >
                          <Star aria-hidden="true" className="size-3.5" />
                        </button>
                      ) : null}
                      <button
                        className={tileAction}
                        type="button"
                        title="编辑说明"
                        aria-label="编辑说明"
                        disabled={busy}
                        onClick={() => {
                          setEditingCaptionId(photo.id);
                          setCaption(photo.caption ?? '');
                        }}
                      >
                        <Pencil aria-hidden="true" className="size-3.5" />
                      </button>
                      <button
                        className={cn(
                          tileAction,
                          'hover:border-destructive/50 hover:text-destructive',
                        )}
                        type="button"
                        title="删除照片"
                        aria-label="删除照片"
                        disabled={busy}
                        onClick={() => removeAttachment(photo)}
                      >
                        <Trash2 aria-hidden="true" className="size-3.5" />
                      </button>
                    </div>
                    {editingCaptionId === photo.id ? (
                      <div className="px-2.5 pb-2.5">{captionEditor(photo.id)}</div>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {documents.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 data-slot="ledger-label">凭证与文档</h3>
                <span data-slot="amount" className="text-xs text-muted-foreground">
                  {documents.length} 份
                </span>
              </div>
              <ul className="flex flex-col">
                {documents.map((document) => (
                  <li
                    className="flex items-center gap-3 border-b border-dashed border-border py-2.5 last:border-0"
                    key={document.id}
                  >
                    <FileText
                      aria-hidden="true"
                      className="size-[19px] shrink-0 text-muted-foreground"
                    />
                    <div className="min-w-0 flex-1">
                      <strong className="block truncate text-sm font-medium text-heading">
                        {document.caption || document.originalName}
                      </strong>
                      <small data-slot="amount" className="text-xs text-muted-foreground">
                        PDF · {formatBytes(document.sizeBytes)}
                      </small>
                    </div>
                    <a
                      className={tileAction}
                      href={document.contentUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="下载"
                      aria-label="下载"
                    >
                      <Download aria-hidden="true" className="size-4" />
                    </a>
                    <button
                      className={cn(
                        tileAction,
                        'hover:border-destructive/50 hover:text-destructive',
                      )}
                      type="button"
                      title="删除文档"
                      aria-label="删除文档"
                      disabled={busy}
                      onClick={() => removeAttachment(document)}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}

      {/* 封面不在照片列表里时（比如封面是文档），说明编辑器单独挂在面板底部 */}
      {editingCaptionId === cover?.id && !photos.some((photo) => photo.id === cover.id)
        ? captionEditor(cover.id)
        : null}

      <FormError>{error}</FormError>

      <ConfirmDialog
        open={pendingRemove !== null}
        title={pendingRemove ? `删除“${pendingRemove.originalName}”？` : ''}
        description="此操作会同时删除私有存储中的文件，附件不再可恢复。"
        confirmLabel="删除"
        pendingLabel="正在删除…"
        pending={deleteMutation.isPending}
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => {
          if (!pendingRemove) return;
          deleteMutation.mutate(pendingRemove.id, {
            onSuccess: () => setPendingRemove(null),
          });
        }}
      />
    </Panel>
  );
}
