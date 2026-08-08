import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';

import type { AssetDetail, ValuationScheduleCadence } from '@thingcost/contracts';

import { api } from '../lib/api.js';
import { formatMinorCurrency } from '../lib/format.js';

interface AssetValuationPanelProps {
  asset: AssetDetail;
}

export function AssetValuationPanel({ asset }: AssetValuationPanelProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [cadence, setCadence] = useState<ValuationScheduleCadence>('manual');

  const previewQuery = useQuery({
    queryKey: ['valuation-preview', asset.id],
    queryFn: () => api.valuationPreview(asset.id),
  });
  const reportsQuery = useQuery({
    queryKey: ['valuation-reports', asset.id],
    queryFn: () => api.valuationReports(asset.id),
  });
  const snapshotsQuery = useQuery({
    queryKey: ['valuation-snapshots', asset.id],
    queryFn: () => api.valuationSnapshots(asset.id),
  });
  const scheduleQuery = useQuery({
    queryKey: ['valuation-schedule', asset.id],
    queryFn: () => api.valuationSchedule(asset.id),
  });
  const analyticsQuery = useQuery({
    queryKey: ['valuation-analytics', asset.id],
    queryFn: () => api.valuationAnalytics(asset.id),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['valuation-preview', asset.id] }),
      queryClient.invalidateQueries({ queryKey: ['valuation-reports', asset.id] }),
      queryClient.invalidateQueries({ queryKey: ['valuation-snapshots', asset.id] }),
      queryClient.invalidateQueries({ queryKey: ['valuation-schedule', asset.id] }),
      queryClient.invalidateQueries({ queryKey: ['valuation-analytics', asset.id] }),
    ]);
  };

  const runMutation = useMutation({
    mutationFn: () => api.runValuation(asset.id),
    onSuccess: async () => {
      setError(null);
      await refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  const confirmMutation = useMutation({
    mutationFn: (reportId: string) => api.confirmValuation(asset.id, reportId),
    onSuccess: async () => {
      setError(null);
      await refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  const scheduleMutation = useMutation({
    mutationFn: () =>
      api.updateValuationSchedule(asset.id, {
        cadence,
        enabled: cadence !== 'manual',
      }),
    onSuccess: async () => {
      setError(null);
      await refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  const preview = previewQuery.data;
  const latestReady = reportsQuery.data?.items.find((item) => item.status === 'ready');
  const latestSnapshot = snapshotsQuery.data?.items[0];
  const schedule = scheduleQuery.data;
  const analytics = analyticsQuery.data;
  const activeCadence = schedule?.cadence ?? cadence;

  return (
    <section
      className="content-card asset-valuation-card"
      aria-labelledby="asset-valuation-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">AI valuation</p>
          <h2 id="asset-valuation-title">AI 估值建议</h2>
        </div>
        <span className="status-badge">与现金账本分离</span>
      </div>

      <p className="muted-copy">
        估值仅为市场参考。确认采用前不会写入估值快照，也绝不会修改购入成本或资金事件。
      </p>

      {previewQuery.isPending && <p className="muted-copy">正在准备外发摘要…</p>}
      {previewQuery.isError && <p className="form-error">{previewQuery.error.message}</p>}

      {preview && (
        <>
          <div className="data-format-list" aria-label="即将外发的字段">
            <span>{preview.outboundSummary.brand || '无品牌'}</span>
            <span>{preview.outboundSummary.model || '无型号'}</span>
            <span>{preview.outboundSummary.categoryName}</span>
            <span>{preview.outboundSummary.conditionGrade || '成色未记录'}</span>
            <span>{preview.outboundSummary.regionHint}</span>
          </div>
          <ul className="data-conflict-list">
            {preview.notes.map((note) => (
              <li key={note}>
                <Sparkles size={15} aria-hidden="true" />
                <div>
                  <strong>{note}</strong>
                </div>
              </li>
            ))}
          </ul>
          <p className="muted-copy">
            检索：
            {preview.providers.searchConfigured
              ? preview.providers.searchProvider
              : '未配置'}
            {' · '}
            模型：
            {preview.providers.aiConfigured
              ? `${preview.providers.aiProvider}/${preview.providers.aiModel}`
              : '未配置'}
          </p>
          <button
            className="primary-action"
            type="button"
            disabled={
              runMutation.isPending ||
              !preview.providers.searchConfigured ||
              !preview.providers.aiConfigured
            }
            onClick={() => runMutation.mutate()}
          >
            <Sparkles size={16} />
            {runMutation.isPending ? '正在估值…' : '确认摘要并手动估值'}
          </button>
        </>
      )}

      <div className="valuation-schedule-row">
        <label htmlFor="valuation-cadence">周期估值</label>
        <select
          id="valuation-cadence"
          value={cadence === 'manual' && schedule ? activeCadence : cadence}
          onChange={(event) => setCadence(event.target.value as ValuationScheduleCadence)}
        >
          <option value="manual">仅手动</option>
          <option value="monthly">每月</option>
          <option value="quarterly">每季</option>
          <option value="yearly">每年</option>
        </select>
        <button
          className="secondary-action"
          type="button"
          disabled={scheduleMutation.isPending}
          onClick={() => scheduleMutation.mutate()}
        >
          {scheduleMutation.isPending ? '保存中…' : '保存周期'}
        </button>
      </div>
      {schedule?.enabled && schedule.nextRunAt && (
        <p className="muted-copy">
          下次计划：{new Date(schedule.nextRunAt).toLocaleString('zh-CN')}
        </p>
      )}

      {error && <p className="form-error">{error}</p>}

      {latestReady && (
        <div className="data-import-result">
          <p>
            最新建议：{formatMinorCurrency(latestReady.midMinor, latestReady.currency)}
            {latestReady.lowMinor && latestReady.highMinor
              ? `（${formatMinorCurrency(latestReady.lowMinor, latestReady.currency)} – ${formatMinorCurrency(latestReady.highMinor, latestReady.currency)}）`
              : ''}
            {latestReady.confidence ? ` · 置信度 ${latestReady.confidence}` : ''}
          </p>
          {latestReady.summary && <p className="muted-copy">{latestReady.summary}</p>}
          {latestReady.evidence.length > 0 && (
            <ul className="data-conflict-list">
              {latestReady.evidence.slice(0, 3).map((item) => (
                <li key={`${item.title}-${item.url ?? ''}`}>
                  <div>
                    <strong>{item.title}</strong>
                    {item.snippet && <p className="muted-copy">{item.snippet}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <button
            className="secondary-action"
            type="button"
            disabled={confirmMutation.isPending}
            onClick={() => confirmMutation.mutate(latestReady.id)}
          >
            {confirmMutation.isPending ? '正在采用…' : '确认采用为估值快照'}
          </button>
        </div>
      )}

      {latestSnapshot && (
        <p className="muted-copy">
          已采用快照：
          {formatMinorCurrency(latestSnapshot.valueMinor, latestSnapshot.currency)} ·{' '}
          {latestSnapshot.valuedOn}
        </p>
      )}

      {analytics && (
        <div className="valuation-analytics">
          <h3>估值轨迹</h3>
          <p className="muted-copy">
            观察年化贬值率：
            {analytics.annualizedDepreciationRate === null
              ? '暂不可计算'
              : `${(analytics.annualizedDepreciationRate * 100).toFixed(1)}%`}
          </p>
          {analytics.snapshots.length > 0 && (
            <ul className="data-conflict-list">
              {analytics.snapshots.slice(0, 6).map((snapshot) => (
                <li key={snapshot.id}>
                  <div>
                    <strong>
                      {snapshot.valuedOn} ·{' '}
                      {formatMinorCurrency(snapshot.valueMinor, snapshot.currency)}
                    </strong>
                    <p className="muted-copy">已采用快照（观察值）</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {analytics.latestForecasts.length > 0 && (
            <>
              <p className="muted-copy">AI 分段预测（预测值，非账本）</p>
              <ul className="data-conflict-list">
                {analytics.latestForecasts.map((forecast) => (
                  <li key={`forecast-${String(forecast.horizonYears)}`}>
                    <div>
                      <strong>
                        {forecast.horizonYears} 年 · 中位{' '}
                        {formatMinorCurrency(forecast.midMinor, 'CNY')}
                      </strong>
                      <p className="muted-copy">
                        {formatMinorCurrency(forecast.lowMinor)} –{' '}
                        {formatMinorCurrency(forecast.highMinor)}
                        {forecast.note ? ` · ${forecast.note}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {analytics.notes.map((note) => (
            <p className="muted-copy" key={note}>
              {note}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
