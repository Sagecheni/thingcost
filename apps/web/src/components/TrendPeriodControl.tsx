import { useState } from 'react';

import { trendPeriodLimits } from '@thingcost/contracts';

import { Button } from './ui/button.js';
import { FormActions, FormField, TextInput } from './ui/form.js';
import { LedgerDialog } from './ui/ledger-dialog.js';
import { SegmentedControl } from './ui/segmented-control.js';

const presets = [30, 90, 180];

export function TrendPeriodControl({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (days: number) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const custom = !presets.includes(value);

  return (
    <>
      <SegmentedControl<number | 'more'>
        label={label}
        value={custom ? 'more' : value}
        options={[
          ...presets.map((days) => ({ value: days, label: `${days} 天` })),
          { value: 'more', label: custom ? `更多 · ${value} 天` : '更多' },
        ]}
        onChange={(next) => {
          if (next === 'more') {
            setDraft(String(value));
            setOpen(true);
          } else {
            onChange(next);
          }
        }}
      />
      <LedgerDialog open={open} eyebrow="自定义时间跨度" onCancel={() => setOpen(false)}>
        <form
          className="space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            const days = Number(draft);
            if (
              !Number.isInteger(days) ||
              days < trendPeriodLimits.min ||
              days > trendPeriodLimits.max
            )
              return;
            onChange(days);
            setOpen(false);
          }}
        >
          <FormField
            label="最近多少天"
            hint={`包含今天，可选择 ${trendPeriodLimits.min}–${trendPeriodLimits.max} 天（最长约 10 年）。`}
          >
            <TextInput
              data-autofocus
              type="number"
              inputMode="numeric"
              min={trendPeriodLimits.min}
              max={trendPeriodLimits.max}
              step={1}
              required
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </FormField>
          <FormActions>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="submit">应用</Button>
          </FormActions>
        </form>
      </LedgerDialog>
    </>
  );
}
