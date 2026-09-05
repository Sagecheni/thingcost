import {
  isValidElement,
  type DOMAttributes,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import type * as ReactModule from 'react';
import { createPortal } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LedgerDialog } from './ledger-dialog.js';

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactModule>()),
  useRef: (current: unknown) => ({ current }),
  useId: () => 'dialog-title',
  useEffect: () => undefined,
}));
vi.mock('react-dom', () => ({ createPortal: vi.fn(() => null) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('document', { body: {} });
});
afterEach(() => vi.unstubAllGlobals());

describe('dialog backdrop gestures', () => {
  it.each([
    { startOutside: false, endOutside: true, cancelled: false, closes: false },
    { startOutside: false, endOutside: false, cancelled: false, closes: false },
    { startOutside: true, endOutside: false, cancelled: false, closes: false },
    { startOutside: true, endOutside: true, cancelled: false, closes: true },
    { startOutside: true, endOutside: true, cancelled: true, closes: false },
  ])(
    'handles $startOutside → $endOutside, cancelled=$cancelled',
    ({ startOutside, endOutside, cancelled, closes }) => {
      const onCancel = vi.fn();
      LedgerDialog({ open: true, eyebrow: '时间跨度', onCancel, children: null });
      const backdrop = vi.mocked(createPortal).mock.calls[0]?.[0];
      if (!isValidElement<DOMAttributes<HTMLDivElement>>(backdrop)) {
        throw new Error('Expected a dialog backdrop');
      }
      const outside = {};
      const inside = {};
      const pointer = (isOutside: boolean) =>
        ({
          button: 0,
          target: isOutside ? outside : inside,
          currentTarget: outside,
        }) as PointerEvent<HTMLDivElement>;
      backdrop.props.onPointerDown?.(pointer(startOutside));
      if (cancelled) backdrop.props.onPointerCancel?.(pointer(endOutside));
      backdrop.props.onPointerUp?.(pointer(endOutside));
      // A drag crossing the dialog boundary can dispatch click to the common ancestor.
      const click = {
        target: outside,
        currentTarget: outside,
      } as MouseEvent<HTMLDivElement>;
      backdrop.props.onClick?.(click);
      expect(onCancel).toHaveBeenCalledTimes(closes ? 1 : 0);
      backdrop.props.onClick?.(click);
      expect(onCancel).toHaveBeenCalledTimes(closes ? 1 : 0);
    },
  );
});
