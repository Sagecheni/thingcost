import { useMutation } from '@tanstack/react-query';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  ImagePlus,
  Images,
  Star,
  Trash2,
} from 'lucide-react';
import { type ChangeEvent, useRef, useState } from 'react';

import type {
  AssetAttachment,
  AssetDetail,
  UpdateAssetAttachmentInput,
} from '@thingcost/contracts';

import { api } from '../lib/api.js';

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

export function AssetAttachmentsPanel({ asset, onUpdated }: AssetAttachmentsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [editingCaptionId, setEditingCaptionId] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
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
    if (
      window.confirm(
        `确定删除“${attachment.originalName}”吗？此操作会同时删除私有存储中的文件。`,
      )
    ) {
      deleteMutation.mutate(attachment.id);
    }
  };

  return (
    <section className="attachment-panel">
      <div className="attachment-heading">
        <div>
          <p className="eyebrow">Private archive</p>
          <h2>影像与凭证</h2>
          <p className="muted-copy">文件保存在私有目录中，只有登录后才能读取。</p>
        </div>
        <div className="attachment-actions">
          <label className="secondary-action upload-action">
            <ImagePlus size={16} />
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
          <label className="secondary-action upload-action attachment-camera-action">
            <Camera size={16} /> 拍照
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={handleFiles}
              disabled={busy}
            />
          </label>
        </div>
      </div>

      {asset.attachments.length === 0 ? (
        <button
          type="button"
          className="attachment-empty"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
        >
          <Images size={28} />
          <strong>添加第一张照片或凭证</strong>
          <span>支持 JPEG、PNG、WebP、GIF 与 PDF；单文件限制以服务端设置为准。</span>
        </button>
      ) : (
        <>
          {cover && (
            <div className="attachment-cover-layout">
              <a
                className="attachment-cover"
                href={cover.contentUrl}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={cover.thumbnailUrl ?? cover.contentUrl}
                  alt={cover.caption || `${asset.name}封面`}
                />
                <span>
                  <Star size={13} fill="currentColor" /> 当前封面
                </span>
              </a>
              <div className="attachment-cover-copy">
                <p className="eyebrow">Cover memory</p>
                <h3>{cover.caption || cover.originalName}</h3>
                <p>
                  {cover.width && cover.height
                    ? `${String(cover.width)} × ${String(cover.height)} · `
                    : ''}
                  {formatBytes(cover.sizeBytes)}
                </p>
                <button
                  className="text-action"
                  type="button"
                  onClick={() => {
                    setEditingCaptionId(cover.id);
                    setCaption(cover.caption ?? '');
                  }}
                >
                  编辑说明
                </button>
              </div>
            </div>
          )}

          {photos.length > 0 && (
            <div className="attachment-subsection">
              <div className="attachment-subheading">
                <h3>照片</h3>
                <span>{photos.length} 张</span>
              </div>
              <div className="attachment-gallery">
                {photos.map((photo, index) => (
                  <article className={photo.isCover ? 'is-cover' : ''} key={photo.id}>
                    <a href={photo.contentUrl} target="_blank" rel="noreferrer">
                      <img
                        src={photo.thumbnailUrl ?? photo.contentUrl}
                        alt={photo.caption || photo.originalName}
                        loading="lazy"
                      />
                    </a>
                    <div className="attachment-card-copy">
                      <strong>{photo.caption || photo.originalName}</strong>
                      <small>{formatBytes(photo.sizeBytes)}</small>
                    </div>
                    <div className="attachment-card-actions">
                      <button
                        type="button"
                        title="前移"
                        disabled={busy || index === 0}
                        onClick={() => {
                          const neighbor = photos[index - 1];
                          if (neighbor)
                            reorderMutation.mutate({ current: photo, neighbor });
                        }}
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <button
                        type="button"
                        title="后移"
                        disabled={busy || index === photos.length - 1}
                        onClick={() => {
                          const neighbor = photos[index + 1];
                          if (neighbor)
                            reorderMutation.mutate({ current: photo, neighbor });
                        }}
                      >
                        <ChevronRight size={14} />
                      </button>
                      {!photo.isCover && (
                        <button
                          type="button"
                          title="设为封面"
                          disabled={busy}
                          onClick={() =>
                            updateMutation.mutate({
                              attachmentId: photo.id,
                              input: { isCover: true },
                            })
                          }
                        >
                          <Star size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        title="编辑说明"
                        disabled={busy}
                        onClick={() => {
                          setEditingCaptionId(photo.id);
                          setCaption(photo.caption ?? '');
                        }}
                      >
                        编
                      </button>
                      <button
                        className="danger-icon"
                        type="button"
                        title="删除照片"
                        disabled={busy}
                        onClick={() => removeAttachment(photo)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {editingCaptionId === photo.id && (
                      <form
                        className="attachment-caption-editor"
                        onSubmit={(event) => {
                          event.preventDefault();
                          updateMutation.mutate({
                            attachmentId: photo.id,
                            input: { caption: caption.trim() || null },
                          });
                        }}
                      >
                        <input
                          value={caption}
                          onChange={(event) => setCaption(event.target.value)}
                          placeholder="照片说明"
                          maxLength={500}
                          autoFocus
                        />
                        <button disabled={updateMutation.isPending}>保存</button>
                      </form>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}

          {documents.length > 0 && (
            <div className="attachment-subsection">
              <div className="attachment-subheading">
                <h3>凭证与文档</h3>
                <span>{documents.length} 份</span>
              </div>
              <div className="attachment-documents">
                {documents.map((document) => (
                  <article key={document.id}>
                    <span className="document-icon">
                      <FileText size={19} />
                    </span>
                    <div>
                      <strong>{document.caption || document.originalName}</strong>
                      <small>PDF · {formatBytes(document.sizeBytes)}</small>
                    </div>
                    <a
                      href={document.contentUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="下载"
                    >
                      <Download size={16} />
                    </a>
                    <button
                      className="danger-icon"
                      type="button"
                      title="删除文档"
                      disabled={busy}
                      onClick={() => removeAttachment(document)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </article>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {editingCaptionId === cover?.id &&
        !photos.some((photo) => photo.id === cover.id) && (
          <form
            className="attachment-caption-editor"
            onSubmit={(event) => {
              event.preventDefault();
              updateMutation.mutate({
                attachmentId: cover.id,
                input: { caption: caption.trim() || null },
              });
            }}
          >
            <input
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              maxLength={500}
            />
            <button disabled={updateMutation.isPending}>保存</button>
          </form>
        )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
