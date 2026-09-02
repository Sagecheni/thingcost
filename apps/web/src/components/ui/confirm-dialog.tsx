import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Button } from './button.js';

/* 确认面板：把 OS 原生 confirm/prompt 收进账簿语系。
 *
 * 形态：一张压在账页上的纸（1px 边框 + 顶边粗规则线），不发光不浮起。
 * 语义分级：
 *   普通确认      —— 一句话说清楚后果，取消是默认焦点（稳妥的退出方向）
 *   requireText   —— 永久级操作，必须输入名称原文才可盖章，朱红勾注常驻
 *
 * 可访问性：role="alertdialog" + 焦点圈定在面板内、Esc 与点击帐面（面板外的暗幕）
 * 都视为取消、关闭后焦点归还触发处、打开时锁定页面滚动。 */

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode | undefined;
  /** 永久级操作：要求输入给定原文才可确认 */
  requireText?: string | undefined;
  requireTextHint?: string;
  confirmLabel?: string;
  pendingLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  requireText,
  requireTextHint,
  confirmLabel = '确认',
  pendingLabel,
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState('');
  /* 用 ref 持最新回调，避免焦点/滚动 effect 因回调重建而反复触发 */
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  const confirmed = typed === requireText;

  /* 每次打开重置已输入的名称 */
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    setTyped('');
  }

  useEffect(() => {
    if (!open) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const autofocus = dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]');
    autofocus?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      /* 焦点圈定：Tab 在面板里循环，不走漏到背后页面 */
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4"
      onClick={(event) => {
        /* 只有落在暗幕本人才算取消，点纸面不算 */
        if (event.target === event.currentTarget) cancelRef.current();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        data-slot="card"
        className="w-full max-w-md text-card-foreground"
      >
        <div className="border-b border-dashed border-border px-5 py-2.5">
          <p data-slot="ledger-label">{requireText ? '凭据核销' : '请确认'}</p>
        </div>
        <div className="space-y-3 px-5 py-4">
          <h2 id="confirm-dialog-title" className="text-base font-semibold text-heading">
            {title}
          </h2>
          <div id="confirm-dialog-desc" className="text-sm text-muted-foreground">
            {description}
          </div>
          {requireText !== undefined ? (
            <div className="space-y-1.5">
              <p data-slot="annotation" className="text-xs">
                {requireTextHint ?? '此操作不可恢复。'}
              </p>
              <input
                data-slot="field"
                data-autofocus
                className="h-10 w-full px-2.5 text-sm text-foreground focus-visible:outline-none"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder="输入名称确认"
                autoComplete="off"
              />
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-dashed border-border px-5 py-3.5">
          <Button
            variant="secondary"
            type="button"
            onClick={onCancel}
            {...(requireText === undefined ? { 'data-autofocus': true } : {})}
          >
            取消
          </Button>
          <Button
            variant="destructive"
            type="button"
            disabled={(requireText !== undefined && !confirmed) || pending}
            onClick={onConfirm}
          >
            {pending ? (pendingLabel ?? `正在${confirmLabel}…`) : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
