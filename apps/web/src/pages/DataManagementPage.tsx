import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Download,
  FileArchive,
  KeyRound,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { useId, useMemo, useState } from 'react';

import {
  apiTokenScopes,
  type ApiTokenScope,
  type PortableImportPreview,
  type PortableImportResult,
} from '@thingcost/contracts';

import { api } from '../lib/api.js';
import { queryKeys } from '../lib/query-keys.js';

function countSummary(label: string, count: number) {
  return (
    <span>
      {label} {count}
    </span>
  );
}

export function DataManagementPage() {
  const fileInputId = useId();
  const queryClient = useQueryClient();
  const [lastExportedAt, setLastExportedAt] = useState<Date | null>(null);
  const [preview, setPreview] = useState<PortableImportPreview | null>(null);
  const [result, setResult] = useState<PortableImportResult | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [tokenName, setTokenName] = useState('自动化脚本');
  const [selectedScopes, setSelectedScopes] = useState<ApiTokenScope[]>([
    'wishlist:write',
  ]);
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const personalApiQuery = useQuery({
    queryKey: queryKeys.personalApiSettings,
    queryFn: api.personalApiSettings,
  });
  const tokensQuery = useQuery({
    queryKey: queryKeys.personalAccessTokens,
    queryFn: api.personalAccessTokens,
  });
  const tokensEnabled = personalApiQuery.data?.enabled ?? false;
  const scopeLabels = useMemo(
    () => ({
      'assets:read': '读取物品',
      'assets:write': '修改物品',
      'orders:read': '读取订单',
      'wishlist:read': '读取种草',
      'wishlist:write': '修改种草与手工价格',
      'reminders:read': '读取提醒',
      'reminders:manage': '管理提醒',
      'attachments:read': '读取附件',
    }),
    [],
  );

  const exportMutation = useMutation({
    mutationFn: api.portableExport,
    onSuccess: ({ blob, filename }) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setLastExportedAt(new Date());
    },
  });

  const previewMutation = useMutation({
    mutationFn: api.portableImportPreview,
    onSuccess: (data) => {
      setPreview(data);
      setResult(null);
      setConfirmReplace(false);
    },
  });

  const applyMutation = useMutation({
    mutationFn: api.portableImportApply,
    onSuccess: async (data) => {
      setResult(data);
      setPreview(null);
      setConfirmReplace(false);
      await queryClient.invalidateQueries();
    },
  });

  const togglePersonalApi = useMutation({
    mutationFn: api.updatePersonalApiSettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.personalApiSettings });
      await queryClient.invalidateQueries({ queryKey: queryKeys.personalAccessTokens });
    },
  });

  const createTokenMutation = useMutation({
    mutationFn: api.createPersonalAccessToken,
    onSuccess: async (data) => {
      setCreatedToken(data.token);
      setTokenName('自动化脚本');
      setSelectedScopes(['wishlist:write']);
      await queryClient.invalidateQueries({ queryKey: queryKeys.personalAccessTokens });
    },
  });

  const revokeTokenMutation = useMutation({
    mutationFn: api.revokePersonalAccessToken,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.personalAccessTokens });
    },
  });

  return (
    <>
      <header className="topbar page-topbar">
        <div>
          <p className="eyebrow">Data vault</p>
          <h1>数据与备份</h1>
          <p className="muted-copy">管理可移植归档、导入预览与数据完整性。</p>
        </div>
      </header>

      <section className="data-overview-strip" aria-label="数据安全概览">
        <div>
          <span>归档格式</span>
          <strong>Chronicle Export v1</strong>
          <small>JSON · CSV · 附件 · SHA-256</small>
        </div>
        <div>
          <span>恢复方式</span>
          <strong>先预览，再覆盖</strong>
          <small>当前管理员和会话保持不变</small>
        </div>
        <div>
          <span>密钥策略</span>
          <strong>默认不导出</strong>
          <small>密码、会话和通知密钥不进入归档</small>
        </div>
      </section>

      <div className="data-vault-grid">
        <section
          className="data-section data-section-export"
          aria-labelledby="portable-export-title"
        >
          <div className="data-section-heading">
            <span className="data-section-icon" aria-hidden="true">
              <FileArchive size={24} />
            </span>
            <div>
              <h2 id="portable-export-title">完整数据归档</h2>
              <p>Chronicle Export v1</p>
            </div>
          </div>

          <div className="data-export-layout">
            <div>
              <div className="data-format-list" aria-label="归档内容">
                <span>JSON 记录</span>
                <span>CSV 表格</span>
                <span>原始附件</span>
                <span>SHA-256 清单</span>
              </div>
              <p className="data-security-note">
                <ShieldCheck size={17} aria-hidden="true" />
                不包含管理员密码、登录会话和通知渠道密钥
              </p>
              {lastExportedAt && (
                <p className="muted-copy data-export-time">
                  本次归档生成于 {lastExportedAt.toLocaleString('zh-CN')}
                </p>
              )}
              {exportMutation.isError && (
                <p className="form-error">{exportMutation.error.message}</p>
              )}
            </div>

            <button
              className="primary-action data-export-button"
              type="button"
              disabled={exportMutation.isPending}
              onClick={() => exportMutation.mutate()}
            >
              <Download size={18} aria-hidden="true" />
              {exportMutation.isPending ? '正在生成归档…' : '下载完整归档'}
            </button>
          </div>
        </section>

        <section
          className="data-section data-section-import"
          aria-labelledby="portable-import-title"
        >
          <div className="data-section-heading">
            <span className="data-section-icon" aria-hidden="true">
              <Upload size={24} />
            </span>
            <div>
              <h2 id="portable-import-title">从归档恢复</h2>
              <div className="data-process-steps" aria-label="恢复步骤">
                <span>
                  <b>01</b> 校验
                </span>
                <span>
                  <b>02</b> 冲突预览
                </span>
                <span>
                  <b>03</b> 确认覆盖
                </span>
              </div>
            </div>
          </div>

          <div className="data-import-layout">
            <div>
              <p className="muted-copy">
                仅接受本应用导出的 Chronicle Export v1 ZIP。导入会保留当前管理员，但以
                replace 模式清空并覆盖业务数据。
              </p>
              <label className="secondary-action data-file-picker" htmlFor={fileInputId}>
                <Upload size={16} aria-hidden="true" />
                选择归档文件
              </label>
              <input
                id={fileInputId}
                className="visually-hidden"
                type="file"
                accept=".zip,application/zip"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) previewMutation.mutate(file);
                }}
              />
              {previewMutation.isPending && (
                <p className="muted-copy data-export-time">正在校验归档并生成冲突预览…</p>
              )}
              {previewMutation.isError && (
                <p className="form-error">{previewMutation.error.message}</p>
              )}
              {applyMutation.isError && (
                <p className="form-error">{applyMutation.error.message}</p>
              )}
            </div>

            {preview && (
              <div className="data-import-preview">
                <div className="data-format-list" aria-label="归档规模">
                  {countSummary('物品', preview.archive.assets)}
                  {countSummary('订单', preview.archive.purchaseOrders)}
                  {countSummary('种草', preview.archive.wishlistItems)}
                  {countSummary('提醒', preview.archive.reminders)}
                  {countSummary('附件', preview.archive.attachmentFiles)}
                </div>
                <div className="data-format-list" aria-label="当前实例">
                  {countSummary('当前物品', preview.current.assets)}
                  {countSummary('当前订单', preview.current.purchaseOrders)}
                  {countSummary('当前种草', preview.current.wishlistItems)}
                </div>

                {preview.conflicts.length > 0 && (
                  <ul className="data-conflict-list">
                    {preview.conflicts.map((conflict) => (
                      <li key={`${conflict.code}-${conflict.message}`}>
                        <AlertTriangle size={15} aria-hidden="true" />
                        <div>
                          <strong>{conflict.message}</strong>
                          {conflict.detail && <p>{conflict.detail}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <label className="data-confirm-row">
                  <input
                    type="checkbox"
                    checked={confirmReplace}
                    onChange={(event) => setConfirmReplace(event.target.checked)}
                  />
                  <span>我确认以 replace 模式覆盖当前业务数据</span>
                </label>

                <button
                  className="primary-action data-export-button"
                  type="button"
                  disabled={
                    !preview.canApply || !confirmReplace || applyMutation.isPending
                  }
                  onClick={() =>
                    applyMutation.mutate({
                      importId: preview.importId,
                      mode: 'replace',
                      confirmReplace: true,
                    })
                  }
                >
                  {applyMutation.isPending ? '正在导入…' : '确认导入并覆盖'}
                </button>
                <p className="muted-copy data-export-time">
                  预览有效至 {new Date(preview.expiresAt).toLocaleString('zh-CN')}
                </p>
              </div>
            )}

            {result && (
              <div className="data-import-result">
                <p>
                  已恢复物品 {result.restored.assets} 件、订单{' '}
                  {result.restored.purchaseOrders} 笔、附件{' '}
                  {result.restored.attachmentFiles} 个。
                </p>
                {result.skipped.notificationChannels > 0 && (
                  <p className="muted-copy">
                    已跳过 {result.skipped.notificationChannels}{' '}
                    个通知渠道（归档不含密钥）。
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      <section
        className="data-section data-section-api"
        aria-labelledby="personal-api-title"
      >
        <div className="data-section-heading">
          <span className="data-section-icon" aria-hidden="true">
            <KeyRound size={24} />
          </span>
          <div>
            <h2 id="personal-api-title">个人 API 令牌</h2>
            <p>默认关闭 · 最小权限</p>
          </div>
        </div>

        <div className="data-import-layout">
          <div className="data-export-layout">
            <div>
              <p className="muted-copy">
                令牌仅在创建时显示一次，数据库只保存哈希；每个令牌只拥有勾选的最小权限。
              </p>
              <p className="data-security-note">
                <ShieldCheck size={17} aria-hidden="true" />
                当前状态：{tokensEnabled ? '已启用' : '已关闭'}
              </p>
              {(togglePersonalApi.isError || personalApiQuery.isError) && (
                <p className="form-error">
                  {(togglePersonalApi.error ?? personalApiQuery.error)?.message}
                </p>
              )}
            </div>
            <button
              className="primary-action data-export-button"
              type="button"
              disabled={togglePersonalApi.isPending || personalApiQuery.isPending}
              onClick={() => togglePersonalApi.mutate({ enabled: !tokensEnabled })}
            >
              {tokensEnabled ? '关闭个人 API' : '启用个人 API'}
            </button>
          </div>

          {tokensEnabled && (
            <div className="data-import-preview">
              <label className="field">
                <span>令牌名称</span>
                <input
                  value={tokenName}
                  onChange={(event) => setTokenName(event.target.value)}
                  maxLength={120}
                />
              </label>

              <div className="data-format-list" aria-label="权限范围">
                {apiTokenScopes.map((scope) => {
                  const checked = selectedScopes.includes(scope);
                  return (
                    <label key={scope} className="data-confirm-row">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedScopes((current) =>
                            checked
                              ? current.filter((item) => item !== scope)
                              : [...current, scope],
                          )
                        }
                      />
                      <span>
                        {scopeLabels[scope]} <code>{scope}</code>
                      </span>
                    </label>
                  );
                })}
              </div>

              <button
                className="primary-action data-export-button"
                type="button"
                disabled={
                  createTokenMutation.isPending ||
                  tokenName.trim().length === 0 ||
                  selectedScopes.length === 0
                }
                onClick={() =>
                  createTokenMutation.mutate({
                    name: tokenName.trim(),
                    scopes: selectedScopes,
                  })
                }
              >
                {createTokenMutation.isPending ? '正在创建…' : '创建令牌'}
              </button>
              {createTokenMutation.isError && (
                <p className="form-error">{createTokenMutation.error.message}</p>
              )}

              {createdToken && (
                <div className="data-import-result">
                  <p>请立即复制，关闭后无法再次查看：</p>
                  <code className="token-secret">{createdToken}</code>
                </div>
              )}

              <div className="token-list">
                {(tokensQuery.data ?? []).map((token) => (
                  <article key={token.id} className="token-row">
                    <div>
                      <strong>{token.name}</strong>
                      <p>
                        {token.tokenPrefix}… · {token.scopes.join(', ')}
                        {token.revokedAt ? ' · 已撤销' : ''}
                      </p>
                    </div>
                    {!token.revokedAt && (
                      <button
                        className="secondary-action"
                        type="button"
                        disabled={revokeTokenMutation.isPending}
                        onClick={() => revokeTokenMutation.mutate(token.id)}
                      >
                        撤销
                      </button>
                    )}
                  </article>
                ))}
                {tokensQuery.data?.length === 0 && (
                  <p className="muted-copy">还没有个人访问令牌。</p>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
