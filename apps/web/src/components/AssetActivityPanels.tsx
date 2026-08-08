import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowDownToLine, HeartPulse, PackageCheck, Send, Sparkles } from 'lucide-react';
import { type FormEvent, useState } from 'react';

import type { AssetDetail, CreateRepairInput, DefectType } from '@thingcost/contracts';

import { api } from '../lib/api.js';
import {
  conditionGradeLabel,
  defectTypeLabel,
  formatMinorCurrency,
  localToday,
  majorToMinor,
} from '../lib/format.js';
import { queryKeys } from '../lib/query-keys.js';

interface ActivityProps {
  asset: AssetDetail;
  onUpdated: () => Promise<void>;
}

const heldReturnStatusCodes = ['in_use', 'idle', 'retired'] as const;

export function AssetActivityForms({ asset, onUpdated }: ActivityProps) {
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
  const [repairCurrency, setRepairCurrency] = useState('CNY');
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
  const baseCurrency = asset.financialEvents[0]?.baseCurrency ?? 'CNY';
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
    <div className="activity-form-stack">
      <details className="form-card compact-form workflow-form">
        <summary>
          <span>
            <Sparkles size={17} /> 更新成色
          </span>
        </summary>
        <form onSubmit={submitCondition}>
          <label>
            成色等级
            <select
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
            </select>
          </label>
          <label>
            观察日期
            <input
              type="date"
              min={asset.acquisitionDate}
              max={localToday()}
              value={conditionDate}
              onChange={(event) => setConditionDate(event.target.value)}
            />
          </label>
          <label>
            缺陷类型（可选）
            <select
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
            </select>
          </label>
          <label>
            缺陷描述
            <input
              value={defectDescription}
              onChange={(event) => setDefectDescription(event.target.value)}
              placeholder="未发现缺陷时留空"
            />
          </label>
          <label>
            备注
            <textarea
              rows={2}
              value={conditionNote}
              onChange={(event) => setConditionNote(event.target.value)}
            />
          </label>
          <button
            className="primary-action primary-action-wide"
            disabled={conditionMutation.isPending}
          >
            保存成色记录
          </button>
        </form>
      </details>

      {!currentDisposed && !openLoan && !openRepair && (
        <details className="form-card compact-form workflow-form">
          <summary>
            <span>
              <Send size={17} /> 记录借出
            </span>
          </summary>
          <form
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
            <label>
              借用人
              <input
                value={borrower}
                onChange={(event) => setBorrower(event.target.value)}
                required
              />
            </label>
            <label>
              借出日期
              <input
                type="date"
                min={asset.acquisitionDate}
                max={localToday()}
                value={lentOn}
                onChange={(event) => setLentOn(event.target.value)}
              />
            </label>
            <label>
              预计归还
              <input
                type="date"
                min={lentOn}
                value={dueOn}
                onChange={(event) => setDueOn(event.target.value)}
              />
            </label>
            <label>
              备注
              <textarea
                rows={2}
                value={loanNote}
                onChange={(event) => setLoanNote(event.target.value)}
              />
            </label>
            <button
              className="primary-action primary-action-wide"
              disabled={loanMutation.isPending}
            >
              确认借出
            </button>
          </form>
        </details>
      )}

      {openLoan && (
        <form
          className="form-card compact-form workflow-form"
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
          <div className="workflow-banner">
            <ArrowDownToLine size={17} />
            <div>
              <strong>借给 {openLoan.borrower}</strong>
              <small>
                {openLoan.dueOn ? `预计 ${openLoan.dueOn} 归还` : '未设置预计归还日'}
              </small>
            </div>
          </div>
          <label>
            归还日期
            <input
              type="date"
              min={openLoan.lentOn}
              max={localToday()}
              value={loanReturnDate}
              onChange={(event) => setLoanReturnDate(event.target.value)}
            />
          </label>
          <label>
            归还后状态
            <select
              value={loanReturnStatus || defaultReturnStatus}
              onChange={(event) => setLoanReturnStatus(event.target.value)}
            >
              {returnStatuses.map((status) => (
                <option value={status.id} key={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="primary-action primary-action-wide"
            disabled={returnLoanMutation.isPending}
          >
            确认归还
          </button>
        </form>
      )}

      {!currentDisposed && !openLoan && !openRepair && (
        <details className="form-card compact-form workflow-form">
          <summary>
            <span>
              <HeartPulse size={17} /> 记录维修
            </span>
          </summary>
          <form onSubmit={submitRepair}>
            <label>
              故障 / 维修内容
              <input
                value={repairIssue}
                onChange={(event) => setRepairIssue(event.target.value)}
                required
              />
            </label>
            <label>
              维修方
              <input
                value={repairProvider}
                onChange={(event) => setRepairProvider(event.target.value)}
              />
            </label>
            <label>
              送修日期
              <input
                type="date"
                min={asset.acquisitionDate}
                max={localToday()}
                value={repairDate}
                onChange={(event) => setRepairDate(event.target.value)}
              />
            </label>
            <label>
              费用币种
              <select
                value={repairCurrency}
                onChange={(event) => {
                  setRepairCurrency(event.target.value);
                  setRepairExchangeRate(event.target.value === baseCurrency ? '1' : '');
                  setRepairExchangeRateSource('manual');
                  setRepairExchangeRateFallback(false);
                }}
              >
                {[baseCurrency, 'CNY', 'USD', 'EUR', 'JPY', 'HKD']
                  .filter((currency, index, all) => all.indexOf(currency) === index)
                  .map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              维修费用（可选）
              <input
                inputMode="decimal"
                value={repairCost}
                onChange={(event) => setRepairCost(event.target.value)}
                placeholder="0.00"
              />
            </label>
            {repairCurrency !== baseCurrency && (
              <>
                <label>
                  锁定汇率（1 {repairCurrency} = ? {baseCurrency}）
                  <input
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
                </label>
                <button
                  className="secondary-action"
                  disabled={quoteRepairExchangeRate.isPending}
                  type="button"
                  onClick={() => quoteRepairExchangeRate.mutate()}
                >
                  {quoteRepairExchangeRate.isPending ? '查询中…' : '参考历史汇率'}
                </button>
              </>
            )}
            <label>
              备注
              <textarea
                rows={2}
                value={repairNote}
                onChange={(event) => setRepairNote(event.target.value)}
              />
            </label>
            <button
              className="primary-action primary-action-wide"
              disabled={repairMutation.isPending}
            >
              开始维修
            </button>
          </form>
        </details>
      )}

      {openRepair && (
        <form
          className="form-card compact-form workflow-form"
          onSubmit={(event) => {
            event.preventDefault();
            const statusId = repairReturnStatus || defaultReturnStatus;
            if (!statusId) {
              setLocalError('完成状态尚未加载');
              return;
            }
            completeRepairMutation.mutate({ completedOn: repairReturnDate, statusId });
          }}
        >
          <div className="workflow-banner">
            <PackageCheck size={17} />
            <div>
              <strong>{openRepair.issue}</strong>
              <small>{openRepair.provider ?? '未记录维修方'}</small>
            </div>
          </div>
          <label>
            取回日期
            <input
              type="date"
              min={openRepair.sentOn}
              max={localToday()}
              value={repairReturnDate}
              onChange={(event) => setRepairReturnDate(event.target.value)}
            />
          </label>
          <label>
            完成后状态
            <select
              value={repairReturnStatus || defaultReturnStatus}
              onChange={(event) => setRepairReturnStatus(event.target.value)}
            >
              {returnStatuses.map((status) => (
                <option value={status.id} key={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="primary-action primary-action-wide"
            disabled={completeRepairMutation.isPending}
          >
            完成维修
          </button>
        </form>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function AssetActivityHistory({ asset }: { asset: AssetDetail }) {
  return (
    <div className="asset-activity-history">
      <section>
        <h3>成色历史</h3>
        {asset.conditionEvents.length === 0 ? (
          <p className="muted-copy">尚未记录成色。</p>
        ) : (
          asset.conditionEvents.map((event) => (
            <article key={event.id}>
              <span className="history-grade">{conditionGradeLabel(event.grade)}</span>
              <div>
                <strong>{event.observedOn}</strong>
                {event.defects.map((defect) => (
                  <p key={defect.id}>
                    {defectTypeLabel(defect.type)} · {defect.description}
                  </p>
                ))}
                {event.note && <small>{event.note}</small>}
              </div>
            </article>
          ))
        )}
      </section>
      <section>
        <h3>借出历史</h3>
        {asset.loans.length === 0 ? (
          <p className="muted-copy">尚无借出记录。</p>
        ) : (
          asset.loans.map((loan) => (
            <article key={loan.id}>
              <span className={loan.returnedOn ? 'history-done' : 'history-open'}>
                {loan.returnedOn ? '已还' : '借出'}
              </span>
              <div>
                <strong>{loan.borrower}</strong>
                <p>
                  {loan.lentOn} → {loan.returnedOn ?? loan.dueOn ?? '待归还'}
                </p>
                {loan.note && <small>{loan.note}</small>}
              </div>
            </article>
          ))
        )}
      </section>
      <section>
        <h3>维修历史</h3>
        {asset.repairs.length === 0 ? (
          <p className="muted-copy">尚无维修记录。</p>
        ) : (
          asset.repairs.map((repair) => (
            <article key={repair.id}>
              <span className={repair.completedOn ? 'history-done' : 'history-open'}>
                {repair.completedOn ? '完成' : '维修'}
              </span>
              <div>
                <strong>{repair.issue}</strong>
                <p>
                  {repair.sentOn} → {repair.completedOn ?? '进行中'}
                  {repair.provider ? ` · ${repair.provider}` : ''}
                </p>
                {repair.costAmountMinor && (
                  <small>
                    费用{' '}
                    {formatMinorCurrency(
                      repair.costAmountMinor,
                      repair.currency ?? 'CNY',
                    )}
                  </small>
                )}
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
