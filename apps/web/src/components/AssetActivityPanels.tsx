import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowDownToLine, HeartPulse, PackageCheck, Send, Sparkles } from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';

import type { AssetDetail, CreateRepairInput, DefectType } from '@thingcost/contracts';
import { cn } from '@thingcost/ui';

import { api } from '../lib/api.js';
import { supportedCurrencies, useBaseCurrency } from '../lib/application-settings.js';
import {
  conditionGradeLabel,
  defectTypeLabel,
  formatMinorCurrency,
  localToday,
  majorToMinor,
} from '../lib/format.js';
import { markFresh } from '../lib/fresh-marks.js';
import { queryKeys } from '../lib/query-keys.js';
import { Button } from './ui/button.js';
import { FormError, FormField, SelectInput, TextArea, TextInput } from './ui/form.js';

interface ActivityProps {
  asset: AssetDetail;
  onUpdated: () => Promise<void>;
}

const heldReturnStatusCodes = ['in_use', 'idle', 'retired'] as const;

/* 可折叠的工作流表单：默认收起，一次只展开要记的那一件事。
 * 用原生 details/summary，键盘和读屏免费拿到展开语义。 */
function WorkflowForm({
  icon,
  title,
  children,
  onSubmit,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <details className="border border-border bg-card [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </summary>
      <form
        className="flex flex-col gap-3 border-t border-border px-4 py-4"
        onSubmit={onSubmit}
      >
        {children}
      </form>
    </details>
  );
}

/* 进行中的借出/维修：不折叠，直接摊开等着被结掉。 */
function OpenWorkflow({
  icon,
  title,
  detail,
  children,
  onSubmit,
}: {
  icon: ReactNode;
  title: string;
  detail: ReactNode;
  children: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form data-slot="card" className="flex flex-col gap-3 p-4" onSubmit={onSubmit}>
      <div className="flex items-center gap-3 border-b border-dashed border-border pb-3">
        <span className="shrink-0 text-warning">{icon}</span>
        <span className="min-w-0">
          <strong className="block truncate text-sm font-medium text-heading">
            {title}
          </strong>
          <span className="block truncate text-xs text-muted-foreground">{detail}</span>
        </span>
      </div>
      {children}
    </form>
  );
}

export function AssetActivityForms({ asset, onUpdated }: ActivityProps) {
  const baseCurrency = useBaseCurrency();
  const statusesQuery = useQuery({ queryKey: queryKeys.statuses, queryFn: api.statuses });
  const defaultReturnStatus =
    statusesQuery.data?.find((status) => status.code === 'in_use')?.id ?? '';
  const [conditionGrade, setConditionGrade] = useState<
    'new' | 'like_new' | 'good' | 'fair' | 'poor'
  >(asset.currentCondition?.grade ?? 'good');
  const [conditionDate, setConditionDate] = useState(localToday());
  const [defectType, setDefectType] = useState<DefectType>('scratch');
  const [defectDescription, setDefectDescription] = useState('');
  const [conditionNote, setConditionNote] = useState('');
  const [borrower, setBorrower] = useState('');
  const [lentOn, setLentOn] = useState(localToday());
  const [dueOn, setDueOn] = useState('');
  const [loanNote, setLoanNote] = useState('');
  const [loanReturnStatus, setLoanReturnStatus] = useState('');
  const [loanReturnDate, setLoanReturnDate] = useState(localToday());
  const [repairIssue, setRepairIssue] = useState('');
  const [repairProvider, setRepairProvider] = useState('');
  const [repairDate, setRepairDate] = useState(localToday());
  const [repairCost, setRepairCost] = useState('');
  const [repairCurrency, setRepairCurrency] = useState(baseCurrency);
  const [repairExchangeRate, setRepairExchangeRate] = useState('1');
  const [repairExchangeRateSource, setRepairExchangeRateSource] = useState<
    'manual' | 'frankfurter'
  >('manual');
  const [repairExchangeRateDate, setRepairExchangeRateDate] = useState(localToday());
  const [repairExchangeRateFallback, setRepairExchangeRateFallback] = useState(false);
  const [repairNote, setRepairNote] = useState('');
  const [repairReturnStatus, setRepairReturnStatus] = useState('');
  const [repairReturnDate, setRepairReturnDate] = useState(localToday());
  const [localError, setLocalError] = useState<string | null>(null);

  const afterMutation = async () => {
    setLocalError(null);
    markFresh(asset.id);
    await onUpdated();
  };
  const conditionMutation = useMutation({
    mutationFn: api.addCondition.bind(null, asset.id),
    onSuccess: afterMutation,
  });
  const loanMutation = useMutation({
    mutationFn: api.startLoan.bind(null, asset.id),
    onSuccess: async () => {
      setBorrower('');
      setLoanNote('');
      await afterMutation();
    },
  });
  const openLoan = asset.loans.find((loan) => loan.returnedOn === null);
  const returnLoanMutation = useMutation({
    mutationFn: (input: { returnedOn: string; statusId: string; note?: string }) => {
      if (!openLoan) {
        throw new Error('没有未归还的借出记录');
      }
      return api.returnLoan(asset.id, openLoan.id, input);
    },
    onSuccess: afterMutation,
  });
  const quoteRepairExchangeRate = useMutation({
    mutationFn: () => api.exchangeRateQuote(repairCurrency, baseCurrency, repairDate),
    onSuccess: (quote) => {
      setRepairExchangeRate(quote.rate);
      setRepairExchangeRateSource('frankfurter');
      setRepairExchangeRateDate(quote.effectiveDate);
      setRepairExchangeRateFallback(quote.fallback);
    },
  });
  const repairMutation = useMutation({
    mutationFn: api.startRepair.bind(null, asset.id),
    onSuccess: async () => {
      setRepairIssue('');
      setRepairCost('');
      setRepairNote('');
      await afterMutation();
    },
  });
  const openRepair = asset.repairs.find((repair) => repair.completedOn === null);
  const completeRepairMutation = useMutation({
    mutationFn: (input: { completedOn: string; statusId: string; note?: string }) => {
      if (!openRepair) {
        throw new Error('没有未完成的维修记录');
      }
      return api.completeRepair(asset.id, openRepair.id, input);
    },
    onSuccess: afterMutation,
  });
  const returnStatuses = (statusesQuery.data ?? []).filter((status) =>
    heldReturnStatusCodes.includes(status.code as (typeof heldReturnStatusCodes)[number]),
  );
  const currentDisposed = asset.currentStatus.ownershipState === 'disposed';
  const error =
    localError ??
    conditionMutation.error?.message ??
    loanMutation.error?.message ??
    returnLoanMutation.error?.message ??
    repairMutation.error?.message ??
    quoteRepairExchangeRate.error?.message ??
    completeRepairMutation.error?.message;

  const submitCondition = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    conditionMutation.mutate({
      grade: conditionGrade,
      observedOn: conditionDate,
      defects: defectDescription.trim()
        ? [{ type: defectType, description: defectDescription.trim() }]
        : [],
      ...(conditionNote.trim() ? { note: conditionNote.trim() } : {}),
    });
  };

  const submitRepair = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);
    const costAmountMinor = repairCost ? majorToMinor(repairCost, repairCurrency) : null;

    if (repairCost && (!costAmountMinor || costAmountMinor === '0')) {
      setLocalError('维修金额必须大于零，且最多保留两位小数');
      return;
    }

    const input: CreateRepairInput = {
      issue: repairIssue,
      sentOn: repairDate,
      includeInNetCost: true,
      ...(repairProvider.trim() ? { provider: repairProvider.trim() } : {}),
      ...(costAmountMinor
        ? {
            costAmountMinor,
            currency: repairCurrency,
            ...(repairCurrency !== baseCurrency
              ? {
                  exchangeRate: repairExchangeRate,
                  exchangeRateSource: repairExchangeRateSource,
                  exchangeRateDate: repairExchangeRateDate,
                  exchangeRateFallback: repairExchangeRateFallback,
                }
              : {}),
          }
        : {}),
      ...(repairNote.trim() ? { note: repairNote.trim() } : {}),
    };
    repairMutation.mutate(input);
  };

  return (
    <div className="flex flex-col gap-3">
      <WorkflowForm
        icon={<Sparkles aria-hidden="true" className="size-[17px]" />}
        title="更新成色"
        onSubmit={submitCondition}
      >
        <FormField label="成色等级">
          <SelectInput
            value={conditionGrade}
            onChange={(event) =>
              setConditionGrade(event.target.value as typeof conditionGrade)
            }
          >
            <option value="new">全新</option>
            <option value="like_new">近新</option>
            <option value="good">良好</option>
            <option value="fair">一般</option>
            <option value="poor">较差</option>
          </SelectInput>
        </FormField>
        <FormField label="观察日期">
          <TextInput
            type="date"
            min={asset.acquisitionDate}
            max={localToday()}
            value={conditionDate}
            onChange={(event) => setConditionDate(event.target.value)}
          />
        </FormField>
        <FormField label="缺陷类型（可选）">
          <SelectInput
            value={defectType}
            onChange={(event) => setDefectType(event.target.value as DefectType)}
          >
            <option value="scratch">划痕</option>
            <option value="dent">凹陷</option>
            <option value="crack">裂纹</option>
            <option value="missing_part">缺件</option>
            <option value="functional_issue">功能异常</option>
            <option value="stain">污渍</option>
            <option value="wear">磨损</option>
            <option value="repair_history">维修痕迹</option>
            <option value="other">其他</option>
          </SelectInput>
        </FormField>
        <FormField label="缺陷描述">
          <TextInput
            value={defectDescription}
            onChange={(event) => setDefectDescription(event.target.value)}
            placeholder="未发现缺陷时留空"
          />
        </FormField>
        <FormField label="备注">
          <TextArea
            rows={2}
            value={conditionNote}
            onChange={(event) => setConditionNote(event.target.value)}
          />
        </FormField>
        <Button className="w-full" disabled={conditionMutation.isPending}>
          保存成色记录
        </Button>
      </WorkflowForm>

      {!currentDisposed && !openLoan && !openRepair ? (
        <WorkflowForm
          icon={<Send aria-hidden="true" className="size-[17px]" />}
          title="记录借出"
          onSubmit={(event) => {
            event.preventDefault();
            loanMutation.mutate({
              borrower,
              lentOn,
              ...(dueOn ? { dueOn } : {}),
              ...(loanNote.trim() ? { note: loanNote.trim() } : {}),
            });
          }}
        >
          <FormField label="借用人">
            <TextInput
              value={borrower}
              onChange={(event) => setBorrower(event.target.value)}
              required
            />
          </FormField>
          <FormField label="借出日期">
            <TextInput
              type="date"
              min={asset.acquisitionDate}
              max={localToday()}
              value={lentOn}
              onChange={(event) => setLentOn(event.target.value)}
            />
          </FormField>
          <FormField label="预计归还">
            <TextInput
              type="date"
              min={lentOn}
              value={dueOn}
              onChange={(event) => setDueOn(event.target.value)}
            />
          </FormField>
          <FormField label="备注">
            <TextArea
              rows={2}
              value={loanNote}
              onChange={(event) => setLoanNote(event.target.value)}
            />
          </FormField>
          <Button className="w-full" disabled={loanMutation.isPending}>
            确认借出
          </Button>
        </WorkflowForm>
      ) : null}

      {openLoan ? (
        <OpenWorkflow
          icon={<ArrowDownToLine aria-hidden="true" className="size-[17px]" />}
          title={`借给 ${openLoan.borrower}`}
          detail={openLoan.dueOn ? `预计 ${openLoan.dueOn} 归还` : '未设置预计归还日'}
          onSubmit={(event) => {
            event.preventDefault();
            const statusId = loanReturnStatus || defaultReturnStatus;
            if (!statusId) {
              setLocalError('归还状态尚未加载');
              return;
            }
            returnLoanMutation.mutate({ returnedOn: loanReturnDate, statusId });
          }}
        >
          <FormField label="归还日期">
            <TextInput
              type="date"
              min={openLoan.lentOn}
              max={localToday()}
              value={loanReturnDate}
              onChange={(event) => setLoanReturnDate(event.target.value)}
            />
          </FormField>
          <FormField label="归还后状态">
            <SelectInput
              value={loanReturnStatus || defaultReturnStatus}
              onChange={(event) => setLoanReturnStatus(event.target.value)}
            >
              {returnStatuses.map((status) => (
                <option value={status.id} key={status.id}>
                  {status.name}
                </option>
              ))}
            </SelectInput>
          </FormField>
          <Button className="w-full" disabled={returnLoanMutation.isPending}>
            确认归还
          </Button>
        </OpenWorkflow>
      ) : null}

      {!currentDisposed && !openLoan && !openRepair ? (
        <WorkflowForm
          icon={<HeartPulse aria-hidden="true" className="size-[17px]" />}
          title="记录维修"
          onSubmit={submitRepair}
        >
          <FormField label="故障 / 维修内容">
            <TextInput
              value={repairIssue}
              onChange={(event) => setRepairIssue(event.target.value)}
              required
            />
          </FormField>
          <FormField label="维修方">
            <TextInput
              value={repairProvider}
              onChange={(event) => setRepairProvider(event.target.value)}
            />
          </FormField>
          <FormField label="送修日期">
            <TextInput
              type="date"
              min={asset.acquisitionDate}
              max={localToday()}
              value={repairDate}
              onChange={(event) => setRepairDate(event.target.value)}
            />
          </FormField>
          <FormField label="费用币种">
            <SelectInput
              value={repairCurrency}
              onChange={(event) => {
                setRepairCurrency(event.target.value);
                setRepairExchangeRate(event.target.value === baseCurrency ? '1' : '');
                setRepairExchangeRateSource('manual');
                setRepairExchangeRateFallback(false);
              }}
            >
              {[baseCurrency, ...supportedCurrencies]
                .filter((currency, index, all) => all.indexOf(currency) === index)
                .map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
            </SelectInput>
          </FormField>
          <FormField label="维修费用（可选）">
            <TextInput
              inputMode="decimal"
              value={repairCost}
              onChange={(event) => setRepairCost(event.target.value)}
              placeholder="0.00"
            />
          </FormField>
          {repairCurrency !== baseCurrency ? (
            <>
              <FormField label={`锁定汇率（1 ${repairCurrency} = ? ${baseCurrency}）`}>
                <TextInput
                  required={Boolean(repairCost)}
                  inputMode="decimal"
                  value={repairExchangeRate}
                  onChange={(event) => {
                    setRepairExchangeRate(event.target.value);
                    setRepairExchangeRateSource('manual');
                    setRepairExchangeRateDate(repairDate);
                    setRepairExchangeRateFallback(false);
                  }}
                />
              </FormField>
              <Button
                variant="secondary"
                size="sm"
                disabled={quoteRepairExchangeRate.isPending}
                type="button"
                onClick={() => quoteRepairExchangeRate.mutate()}
              >
                {quoteRepairExchangeRate.isPending ? '查询中…' : '参考历史汇率'}
              </Button>
            </>
          ) : null}
          <FormField label="备注">
            <TextArea
              rows={2}
              value={repairNote}
              onChange={(event) => setRepairNote(event.target.value)}
            />
          </FormField>
          <Button className="w-full" disabled={repairMutation.isPending}>
            开始维修
          </Button>
        </WorkflowForm>
      ) : null}

      {openRepair ? (
        <OpenWorkflow
          icon={<PackageCheck aria-hidden="true" className="size-[17px]" />}
          title={openRepair.issue}
          detail={openRepair.provider ?? '未记录维修方'}
          onSubmit={(event) => {
            event.preventDefault();
            const statusId = repairReturnStatus || defaultReturnStatus;
            if (!statusId) {
              setLocalError('完成状态尚未加载');
              return;
            }
            completeRepairMutation.mutate({
              completedOn: repairReturnDate,
              statusId,
            });
          }}
        >
          <FormField label="取回日期">
            <TextInput
              type="date"
              min={openRepair.sentOn}
              max={localToday()}
              value={repairReturnDate}
              onChange={(event) => setRepairReturnDate(event.target.value)}
            />
          </FormField>
          <FormField label="完成后状态">
            <SelectInput
              value={repairReturnStatus || defaultReturnStatus}
              onChange={(event) => setRepairReturnStatus(event.target.value)}
            >
              {returnStatuses.map((status) => (
                <option value={status.id} key={status.id}>
                  {status.name}
                </option>
              ))}
            </SelectInput>
          </FormField>
          <Button className="w-full" disabled={completeRepairMutation.isPending}>
            完成维修
          </Button>
        </OpenWorkflow>
      ) : null}

      <FormError>{error}</FormError>
    </div>
  );
}

/* 历史记录的一条：左边一枚状态签，右边内容。 */
function HistoryRow({
  chip,
  chipTone,
  title,
  children,
}: {
  chip: string;
  chipTone: 'open' | 'done' | 'neutral';
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="flex gap-3 border-b border-dashed border-border py-2.5 last:border-0">
      <span
        className={cn(
          'shrink-0 border px-1.5 py-0.5 text-[11px] leading-tight',
          chipTone === 'open' && 'border-warning/40 bg-warning-subtle text-warning',
          chipTone === 'done' && 'border-success/40 bg-success-subtle text-success',
          chipTone === 'neutral' && 'border-border text-muted-foreground',
        )}
      >
        {chip}
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <strong className="block truncate text-sm font-medium text-heading">
          {title}
        </strong>
        {children}
      </div>
    </li>
  );
}

function HistorySection({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section data-slot="card" className="flex flex-col gap-2 p-4">
      <h4 data-slot="ledger-label">{title}</h4>
      {hasRows ? (
        <ol className="flex flex-col">{children}</ol>
      ) : (
        <p className="py-2 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

export function AssetActivityHistory({ asset }: { asset: AssetDetail }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <HistorySection title="成色历史" empty="尚未记录成色。">
        {asset.conditionEvents.map((event) => (
          <HistoryRow
            key={event.id}
            chip={conditionGradeLabel(event.grade)}
            chipTone="neutral"
            title={event.observedOn}
          >
            {event.defects.map((defect) => (
              <p className="text-xs text-muted-foreground" key={defect.id}>
                {defectTypeLabel(defect.type)} · {defect.description}
              </p>
            ))}
            {event.note ? (
              <p className="text-xs text-muted-foreground">{event.note}</p>
            ) : null}
          </HistoryRow>
        ))}
      </HistorySection>

      <HistorySection title="借出历史" empty="尚无借出记录。">
        {asset.loans.map((loan) => (
          <HistoryRow
            key={loan.id}
            chip={loan.returnedOn ? '已还' : '借出'}
            chipTone={loan.returnedOn ? 'done' : 'open'}
            title={loan.borrower}
          >
            <p data-slot="amount" className="text-xs text-muted-foreground">
              {loan.lentOn} → {loan.returnedOn ?? loan.dueOn ?? '待归还'}
            </p>
            {loan.note ? (
              <p className="text-xs text-muted-foreground">{loan.note}</p>
            ) : null}
          </HistoryRow>
        ))}
      </HistorySection>

      <HistorySection title="维修历史" empty="尚无维修记录。">
        {asset.repairs.map((repair) => (
          <HistoryRow
            key={repair.id}
            chip={repair.completedOn ? '完成' : '维修'}
            chipTone={repair.completedOn ? 'done' : 'open'}
            title={repair.issue}
          >
            <p data-slot="amount" className="text-xs text-muted-foreground">
              {repair.sentOn} → {repair.completedOn ?? '进行中'}
              {repair.provider ? ` · ${repair.provider}` : ''}
            </p>
            {repair.costAmountMinor ? (
              <p data-slot="amount" className="text-xs text-muted-foreground">
                费用{' '}
                {formatMinorCurrency(repair.costAmountMinor, repair.currency ?? 'CNY')}
              </p>
            ) : null}
          </HistoryRow>
        ))}
      </HistorySection>
    </div>
  );
}
