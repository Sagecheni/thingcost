import { type ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@thingcost/ui';

/* 对话面板的壳 —— 一张压在账页上的纸（1px 边框 + 顶边粗规则线），不发光不浮起。
 *
 * 这里只管壳与可访问性：portal、焦点圈定、Esc 与点暗幕取消、
 * 关闭后焦点归还触发处、打开时锁定页面滚动、打开时聚焦 [data-autofocus]。
 * 内容与页脚由调用方给。
 *
 * ConfirmDialog（确认）与 AuditSlipDialog（更正/作废单）共用这一份机制 ——
 * 无障碍逻辑只写一遍。写两遍必然会漂，而漂掉的那份不会有人发现。 */

export function LedgerDialog({
  open,
  eyebrow,
  role = 'dialog',
  width = 'md',
  onCancel,
  children,
}: {
  open: boolean;
  /** 头联眉批：请确认 / 凭据核销 / 更正单 / 作废单 */
  eyebrow: string;
  role?: 'dialog' | 'alertdialog';
  width?: 'md' | 'lg';
  onCancel: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const backdropPress = useRef(false);
  /* 用 ref 持最新回调，避免焦点/滚动 effect 因回调重建而反复触发 */
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useEffect(() => {
    backdropPress.current = false;
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
        [
          'button:not([disabled])',
          'input:not([disabled])',
          'select:not([disabled])',
          'textarea:not([disabled])',
          'a[href]',
          '[tabindex]:not([tabindex="-1"])',
        ].join(', '),
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
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/45 px-4 py-8"
      onPointerDown={(event) => {
        backdropPress.current =
          event.button === 0 && event.target === event.currentTarget;
      }}
      onPointerUp={(event) => {
        backdropPress.current =
          backdropPress.current && event.target === event.currentTarget;
      }}
      onPointerCancel={() => {
        backdropPress.current = false;
      }}
      onClick={(event) => {
        // 按下和松开都必须在遮罩上，避免从输入框拖选到外部时误关闭。
        const dismiss = backdropPress.current && event.target === event.currentTarget;
        backdropPress.current = false;
        if (dismiss) cancelRef.current();
      }}
    >
      <div
        ref={dialogRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        data-slot="card"
        className={cn(
          'my-auto w-full text-card-foreground',
          width === 'lg' ? 'max-w-lg' : 'max-w-md',
        )}
      >
        <div className="border-b border-dashed border-border px-5 py-2.5">
          <p data-slot="ledger-label" id={titleId}>
            {eyebrow}
          </p>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
