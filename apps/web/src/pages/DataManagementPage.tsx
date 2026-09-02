import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, ShieldCheck, Upload } from 'lucide-react';
import { useId, useMemo, useState } from 'react';

import {
  apiTokenScopes,
  type ApiTokenScope,
  type PortableImportPreview,
  type PortableImportResult,
} from '@thingcost/contracts';
import { cn } from '@thingcost/ui';

import { api } from '../lib/api.js';
import { queryKeys } from '../lib/query-keys.js';
import { Badge } from '../components/ui/badge.js';
import { Button, buttonVariants } from '../components/ui/button.js';
import {
  CheckboxField,
  FormError,
  FormField,
  Panel,
  TextInput,
} from '../components/ui/form.js';
import { PageHeader } from '../components/ui/page-header.js';

function CountChip({ label, count }: { label: string; count: number }) {
  return (
    <span
      data-slot="amount"
      className="border border-border px-2 py-0.5 text-xs text-muted-foreground"
    >
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
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <PageHeader
        eyebrow="Data vault"
        title="数据与备份"
        description="管理可移植归档、导入预览与数据完整性。"
      />

      <dl className="grid gap-4 sm:grid-cols-3">
        <div data-slot="card" className="space-y-1 p-4">
          <dt data-slot="ledger-label">归档格式</dt>
          <dd className="text-sm font-medium text-heading">Chronicle Export v1</dd>
          <p className="text-xs text-muted-foreground">JSON · CSV · 附件 · SHA-256</p>
        </div>
        <div data-slot="card" className="space-y-1 p-4">
          <dt data-slot="ledger-label">恢复方式</dt>
          <dd className="text-sm font-medium text-heading">先预览，再覆盖</dd>
          <p className="text-xs text-muted-foreground">当前管理员和会话保持不变</p>
        </div>
        <div data-slot="card" className="space-y-1 p-4">
          <dt data-slot="ledger-label">密钥策略</dt>
          <dd className="text-sm font-medium text-heading">默认不导出</dd>
          <p className="text-xs text-muted-foreground">密码、会话和通知密钥不进入归档</p>
        </div>
      </dl>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel eyebrow="Chronicle Export v1" title="完整数据归档">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">JSON 记录</Badge>
            <Badge variant="outline">CSV 表格</Badge>
            <Badge variant="outline">原始附件</Badge>
            <Badge variant="outline">SHA-256 清单</Badge>
          </div>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            不包含管理员密码、登录会话和通知渠道密钥
          </p>
          {lastExportedAt ? (
            <p data-slot="amount" className="text-xs text-muted-foreground">
              本次归档生成于 {lastExportedAt.toLocaleString('zh-CN')}
            </p>
          ) : null}
          <FormError>{exportMutation.error?.message}</FormError>
          <Button
            className="w-fit"
            type="button"
            disabled={exportMutation.isPending}
            onClick={() => exportMutation.mutate()}
          >
            <Download aria-hidden="true" />
            {exportMutation.isPending ? '正在生成归档…' : '下载完整归档'}
          </Button>
        </Panel>

        <Panel eyebrow="Restore" title="从归档恢复">
          {/* 三步是真实的处理序列（校验 → 预览 → 覆盖），编号在这里有信息 */}
          <ol className="flex flex-wrap gap-x-4 gap-y-1">
            {['校验', '冲突预览', '确认覆盖'].map((step, index) => (
              <li className="flex items-center gap-1.5 text-xs" key={step}>
                <span data-slot="amount" className="text-muted-foreground">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="text-foreground">{step}</span>
              </li>
            ))}
          </ol>

          <p className="text-sm text-muted-foreground">
            仅接受本应用导出的 Chronicle Export v1 ZIP。导入会保留当前管理员，但以 replace
            模式清空并覆盖业务数据。
          </p>

          <label
            className={cn(
              buttonVariants({ variant: 'secondary' }),
              'w-fit cursor-pointer',
            )}
            htmlFor={fileInputId}
          >
            <Upload aria-hidden="true" />
            选择归档文件
          </label>
          <input
            id={fileInputId}
            className="sr-only"
            type="file"
            accept=".zip,application/zip"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) previewMutation.mutate(file);
            }}
          />

          {previewMutation.isPending ? (
            <p className="text-xs text-muted-foreground">正在校验归档并生成冲突预览…</p>
          ) : null}
          <FormError>{previewMutation.error?.message}</FormError>
          <FormError>{applyMutation.error?.message}</FormError>

          {preview ? (
            <div className="flex flex-col gap-3 border-t border-dashed border-border pt-3">
              <div className="space-y-1.5">
                <p data-slot="ledger-label">归档规模</p>
                <div className="flex flex-wrap gap-1.5">
                  <CountChip label="物品" count={preview.archive.assets} />
                  <CountChip label="订单" count={preview.archive.purchaseOrders} />
                  <CountChip label="种草" count={preview.archive.wishlistItems} />
                  <CountChip label="提醒" count={preview.archive.reminders} />
                  <CountChip label="附件" count={preview.archive.attachmentFiles} />
                </div>
              </div>
              <div className="space-y-1.5">
                <p data-slot="ledger-label">当前实例</p>
                <div className="flex flex-wrap gap-1.5">
                  <CountChip label="物品" count={preview.current.assets} />
                  <CountChip label="订单" count={preview.current.purchaseOrders} />
                  <CountChip label="种草" count={preview.current.wishlistItems} />
                </div>
              </div>

              {preview.conflicts.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {preview.conflicts.map((conflict) => (
                    <li
                      data-slot="annotation"
                      className="flex gap-2 text-xs"
                      key={`${conflict.code}-${conflict.message}`}
                    >
                      <AlertTriangle
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0"
                      />
                      <span>
                        <strong className="block font-medium">{conflict.message}</strong>
                        {conflict.detail ? <span>{conflict.detail}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {/* 覆盖是不可撤销的：必须显式勾选才能提交 */}
              <CheckboxField
                checked={confirmReplace}
                onChange={(event) => setConfirmReplace(event.target.checked)}
                label="我确认以 replace 模式覆盖当前业务数据"
              />

              <Button
                variant="destructive"
                className="w-fit"
                type="button"
                disabled={!preview.canApply || !confirmReplace || applyMutation.isPending}
                onClick={() =>
                  applyMutation.mutate({
                    importId: preview.importId,
                    mode: 'replace',
                    confirmReplace: true,
                  })
                }
              >
                {applyMutation.isPending ? '正在导入…' : '确认导入并覆盖'}
              </Button>
              <p data-slot="amount" className="text-xs text-muted-foreground">
                预览有效至 {new Date(preview.expiresAt).toLocaleString('zh-CN')}
              </p>
            </div>
          ) : null}

          {result ? (
            <div className="border border-success/30 bg-success-subtle px-4 py-3 text-sm">
              <p data-slot="amount" className="text-success">
                已恢复物品 {result.restored.assets} 件、订单{' '}
                {result.restored.purchaseOrders} 笔、附件{' '}
                {result.restored.attachmentFiles} 个。
              </p>
              {result.skipped.notificationChannels > 0 ? (
                <p data-slot="amount" className="text-xs text-muted-foreground">
                  已跳过 {result.skipped.notificationChannels}{' '}
                  个通知渠道（归档不含密钥）。
                </p>
              ) : null}
            </div>
          ) : null}
        </Panel>
      </div>

      <Panel
        eyebrow="默认关闭 · 最小权限"
        title="个人 API 令牌"
        description="令牌仅在创建时显示一次，数据库只保存哈希；每个令牌只拥有勾选的最小权限。"
        action={
          <Button
            variant={tokensEnabled ? 'secondary' : 'default'}
            type="button"
            disabled={togglePersonalApi.isPending || personalApiQuery.isPending}
            onClick={() => togglePersonalApi.mutate({ enabled: !tokensEnabled })}
          >
            {tokensEnabled ? '关闭个人 API' : '启用个人 API'}
          </Button>
        }
      >
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
          当前状态：{tokensEnabled ? '已启用' : '已关闭'}
        </p>
        <FormError>
          {(togglePersonalApi.error ?? personalApiQuery.error)?.message}
        </FormError>

        {tokensEnabled ? (
          <div className="flex flex-col gap-3 border-t border-dashed border-border pt-3">
            <FormField label="令牌名称" className="max-w-sm">
              <TextInput
                value={tokenName}
                onChange={(event) => setTokenName(event.target.value)}
                maxLength={120}
              />
            </FormField>

            <fieldset className="space-y-2 border-0 p-0">
              <legend data-slot="ledger-label">权限范围</legend>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {apiTokenScopes.map((scope) => {
                  const checked = selectedScopes.includes(scope);
                  return (
                    <CheckboxField
                      key={scope}
                      checked={checked}
                      onChange={() =>
                        setSelectedScopes((current) =>
                          checked
                            ? current.filter((item) => item !== scope)
                            : [...current, scope],
                        )
                      }
                      label={
                        <span className="flex flex-wrap items-baseline gap-1.5">
                          {scopeLabels[scope]}
                          <code
                            data-slot="amount"
                            className="text-[11px] text-muted-foreground"
                          >
                            {scope}
                          </code>
                        </span>
                      }
                    />
                  );
                })}
              </div>
            </fieldset>

            <Button
              className="w-fit"
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
            </Button>
            <FormError>{createTokenMutation.error?.message}</FormError>

            {createdToken ? (
              <div className="space-y-1 border border-warning/30 bg-warning-subtle px-4 py-3">
                <p className="text-sm text-warning">请立即复制，关闭后无法再次查看：</p>
                <code
                  data-slot="amount"
                  className="block break-all text-sm text-foreground"
                >
                  {createdToken}
                </code>
              </div>
            ) : null}

            <ul className="flex flex-col">
              {(tokensQuery.data ?? []).map((token) => (
                <li
                  className="flex flex-wrap items-center gap-3 border-b border-dashed border-border py-2.5 last:border-0"
                  key={token.id}
                >
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm font-medium text-heading">
                      {token.name}
                    </strong>
                    <p
                      data-slot="amount"
                      className="truncate text-xs text-muted-foreground"
                    >
                      {token.tokenPrefix}… · {token.scopes.join(', ')}
                      {token.revokedAt ? ' · 已撤销' : ''}
                    </p>
                  </div>
                  {!token.revokedAt ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      disabled={revokeTokenMutation.isPending}
                      onClick={() => revokeTokenMutation.mutate(token.id)}
                    >
                      撤销
                    </Button>
                  ) : null}
                </li>
              ))}
              {tokensQuery.data?.length === 0 ? (
                <li className="text-sm text-muted-foreground">还没有个人访问令牌。</li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
