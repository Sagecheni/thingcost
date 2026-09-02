import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Coins, Trash2 } from 'lucide-react';

import type { AssetStatus, Category, Tag } from '@thingcost/contracts';
import { cn } from '@thingcost/ui';

import { api, getApiErrorMessage } from '../lib/api';
import {
  currencyLabel,
  supportedCurrencies,
  useApplicationSettings,
} from '../lib/application-settings.js';
import { queryKeys } from '../lib/query-keys';
import { StyleToggle } from '../components/StyleToggle.js';
import { ThemeToggle } from '../components/ThemeToggle.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { ConfirmDialog } from '../components/ui/confirm-dialog.js';
import {
  CheckboxField,
  FormError,
  FormField,
  Panel,
  SelectInput,
  TextInput,
} from '../components/ui/form.js';
import { RuledLines } from '../components/ui/ledger-skeleton.js';
import { PageHeader } from '../components/ui/page-header.js';

const catalogRow =
  'flex flex-wrap items-center gap-2 border-b border-dashed border-border py-2.5 last:border-0';
const deleteButton = cn(
  'flex size-9 shrink-0 items-center justify-center border border-border',
  'text-muted-foreground transition duration-150',
  'hover:border-destructive/50 hover:text-destructive',
  'disabled:pointer-events-none disabled:opacity-45',
);

/* 分类/标签的色点。用户自定义颜色是数据，不走 token。 */
function ColorDot({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden="true"
      className="size-3 shrink-0 border border-border"
      style={color ? { background: color } : undefined}
    />
  );
}

function CategoryEditor({ category }: { category: Category }) {
  const client = useQueryClient();
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color ?? '');
  const update = useMutation({
    mutationFn: () =>
      api.updateCategory(category.id, { name, color: color || undefined }),
    onSuccess: async () => client.invalidateQueries({ queryKey: queryKeys.categories }),
  });
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.deleteCategory(category.id),
    onSuccess: async () => client.invalidateQueries({ queryKey: queryKeys.categories }),
  });

  if (category.isSystem) {
    return (
      <div className={catalogRow}>
        <ColorDot color={category.color} />
        <strong className="flex-1 text-sm font-medium text-heading">
          {category.name}
        </strong>
        <Badge variant="outline">系统</Badge>
      </div>
    );
  }

  return (
    <form
      className={catalogRow}
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate();
      }}
    >
      <TextInput
        className="min-w-0 flex-1 basis-40"
        aria-label="分类名称"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <TextInput
        className="min-w-0 basis-32"
        aria-label="分类颜色"
        placeholder="#d97706"
        value={color}
        onChange={(event) => setColor(event.target.value)}
      />
      <Button variant="secondary" size="sm" className="h-9" disabled={update.isPending}>
        <Check aria-hidden="true" /> 保存
      </Button>
      <button
        aria-label={`删除分类 ${category.name}`}
        className={deleteButton}
        disabled={remove.isPending}
        type="button"
        onClick={() => setConfirmingRemove(true)}
      >
        <Trash2 aria-hidden="true" className="size-4" />
      </button>
      {update.error || remove.error ? (
        <p data-slot="annotation" className="w-full text-xs">
          {getApiErrorMessage(update.error ?? remove.error)}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirmingRemove}
        title={`删除分类“${category.name}”？`}
        description="删除操作会立即生效，无法撤销。"
        confirmLabel="删除"
        pendingLabel="正在删除…"
        pending={remove.isPending}
        onCancel={() => setConfirmingRemove(false)}
        onConfirm={() =>
          remove.mutate(undefined, { onSettled: () => setConfirmingRemove(false) })
        }
      />
    </form>
  );
}

function TagEditor({ tag }: { tag: Tag }) {
  const client = useQueryClient();
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color ?? '');
  const update = useMutation({
    mutationFn: () => api.updateTag(tag.id, { name, color: color || undefined }),
    onSuccess: async () => client.invalidateQueries({ queryKey: queryKeys.tags }),
  });
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.deleteTag(tag.id),
    onSuccess: async () => client.invalidateQueries({ queryKey: queryKeys.tags }),
  });

  return (
    <form
      className={catalogRow}
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate();
      }}
    >
      <ColorDot color={tag.color} />
      <TextInput
        className="min-w-0 flex-1 basis-40"
        aria-label={`标签名称 ${tag.name}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <TextInput
        className="min-w-0 basis-32"
        aria-label={`标签颜色 ${tag.name}`}
        placeholder="#70d6d0"
        value={color}
        onChange={(event) => setColor(event.target.value)}
      />
      <Button variant="secondary" size="sm" className="h-9" disabled={update.isPending}>
        <Check aria-hidden="true" /> 保存
      </Button>
      <button
        aria-label={`删除标签 ${tag.name}`}
        className={deleteButton}
        disabled={remove.isPending}
        type="button"
        onClick={() => setConfirmingRemove(true)}
      >
        <Trash2 aria-hidden="true" className="size-4" />
      </button>
      {update.error || remove.error ? (
        <p data-slot="annotation" className="w-full text-xs">
          {getApiErrorMessage(update.error ?? remove.error)}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirmingRemove}
        title={`删除标签“${tag.name}”？`}
        description="删除操作会立即生效，无法撤销。"
        confirmLabel="删除"
        pendingLabel="正在删除…"
        pending={remove.isPending}
        onCancel={() => setConfirmingRemove(false)}
        onConfirm={() =>
          remove.mutate(undefined, { onSettled: () => setConfirmingRemove(false) })
        }
      />
    </form>
  );
}

function StatusEditor({ status }: { status: AssetStatus }) {
  const client = useQueryClient();
  const [name, setName] = useState(status.name);
  const [countsTowardService, setCountsTowardService] = useState(
    status.countsTowardService,
  );
  const [ownershipState, setOwnershipState] = useState(status.ownershipState);
  const update = useMutation({
    mutationFn: () =>
      api.updateStatus(status.id, { name, countsTowardService, ownershipState }),
    onSuccess: async () => client.invalidateQueries({ queryKey: queryKeys.statuses }),
  });
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.deleteStatus(status.id),
    onSuccess: async () => client.invalidateQueries({ queryKey: queryKeys.statuses }),
  });

  if (status.isSystem) {
    return (
      <div className={catalogRow}>
        <strong className="flex-1 text-sm font-medium text-heading">{status.name}</strong>
        <span className="text-xs text-muted-foreground">
          {status.ownershipState === 'held' ? '仍持有' : '已处置'}
        </span>
        <span className="text-xs text-muted-foreground">
          {status.countsTowardService ? '计入服役' : '停止服役'}
        </span>
        <Badge variant="outline">系统</Badge>
      </div>
    );
  }

  return (
    <form
      className={catalogRow}
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate();
      }}
    >
      <TextInput
        className="min-w-0 flex-1 basis-40"
        aria-label="状态名称"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <SelectInput
        className="min-w-0 basis-28"
        aria-label="持有语义"
        value={ownershipState}
        onChange={(event) => setOwnershipState(event.target.value as 'held' | 'disposed')}
      >
        <option value="held">仍持有</option>
        <option value="disposed">已处置</option>
      </SelectInput>
      <CheckboxField
        className="shrink-0"
        checked={countsTowardService}
        onChange={(event) => setCountsTowardService(event.target.checked)}
        label="计入服役"
      />
      <Button variant="secondary" size="sm" className="h-9" disabled={update.isPending}>
        <Check aria-hidden="true" /> 保存
      </Button>
      <button
        aria-label={`删除状态 ${status.name}`}
        className={deleteButton}
        disabled={remove.isPending}
        type="button"
        onClick={() => setConfirmingRemove(true)}
      >
        <Trash2 aria-hidden="true" className="size-4" />
      </button>
      {update.error || remove.error ? (
        <p data-slot="annotation" className="w-full text-xs">
          {getApiErrorMessage(update.error ?? remove.error)}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirmingRemove}
        title={`删除状态“${status.name}”？`}
        description="删除操作会立即生效，无法撤销。"
        confirmLabel="删除"
        pendingLabel="正在删除…"
        pending={remove.isPending}
        onCancel={() => setConfirmingRemove(false)}
        onConfirm={() =>
          remove.mutate(undefined, { onSettled: () => setConfirmingRemove(false) })
        }
      />
    </form>
  );
}

const timezoneOptions = [
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Seoul',
  'UTC',
  'Europe/London',
  'Europe/Berlin',
  'America/Los_Angeles',
  'America/New_York',
];

/* 界面偏好行：左边说明，右边控件 */
function PreferenceRow({
  title,
  hint,
  control,
}: {
  title: string;
  hint: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-border py-2.5 last:border-0">
      <div className="min-w-0">
        <strong className="block text-sm font-medium text-heading">{title}</strong>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </div>
      {control}
    </div>
  );
}

export function SettingsPage() {
  const client = useQueryClient();
  const [timeZone, setTimeZone] = useState('Asia/Shanghai');
  const [baseCurrency, setBaseCurrency] = useState('CNY');
  const [categoryName, setCategoryName] = useState('');
  const [categoryColor, setCategoryColor] = useState('');
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState('');
  const [statusName, setStatusName] = useState('');
  const [countsTowardService, setCountsTowardService] = useState(true);
  const [ownershipState, setOwnershipState] = useState<'held' | 'disposed'>('held');

  const applicationSettings = useApplicationSettings();
  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: api.categories,
  });
  const tags = useQuery({ queryKey: queryKeys.tags, queryFn: api.tags });
  const statuses = useQuery({ queryKey: queryKeys.statuses, queryFn: api.statuses });

  useEffect(() => {
    if (!applicationSettings.data) return;
    setTimeZone(applicationSettings.data.timeZone);
    setBaseCurrency(applicationSettings.data.baseCurrency);
  }, [applicationSettings.data]);

  const saveApplicationSettings = useMutation({
    mutationFn: () => api.updateApplicationSettings({ timeZone, baseCurrency }),
    onSuccess: async () =>
      client.invalidateQueries({ queryKey: queryKeys.applicationSettings }),
  });
  const createCategory = useMutation({
    mutationFn: () =>
      api.createCategory({ name: categoryName, color: categoryColor || undefined }),
    onSuccess: async () => {
      setCategoryName('');
      setCategoryColor('');
      await client.invalidateQueries({ queryKey: queryKeys.categories });
    },
  });
  const createTag = useMutation({
    mutationFn: () =>
      api.createTag({
        name: tagName,
        ...(tagColor.trim() ? { color: tagColor.trim() } : {}),
      }),
    onSuccess: async () => {
      setTagName('');
      setTagColor('');
      await client.invalidateQueries({ queryKey: queryKeys.tags });
    },
  });
  const createStatus = useMutation({
    mutationFn: () =>
      api.createStatus({ name: statusName, countsTowardService, ownershipState }),
    onSuccess: async () => {
      setStatusName('');
      await client.invalidateQueries({ queryKey: queryKeys.statuses });
    },
  });

  function submitCategory(event: FormEvent) {
    event.preventDefault();
    if (categoryName.trim()) createCategory.mutate();
  }

  function submitTag(event: FormEvent) {
    event.preventDefault();
    if (tagName.trim()) createTag.mutate();
  }

  function submitStatus(event: FormEvent) {
    event.preventDefault();
    if (statusName.trim()) createStatus.mutate();
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader
        eyebrow="Settings"
        title="设置"
        description="管理物纪的计算口径、界面偏好，以及分类、标签和生命周期状态。"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          eyebrow="Workspace"
          title="工作区设置"
          description="影响日期显示、新提醒和金额的基础口径。"
        >
          {applicationSettings.isPending ? (
            <RuledLines count={3} />
          ) : applicationSettings.isError ? (
            <FormError>{applicationSettings.error.message}</FormError>
          ) : (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                saveApplicationSettings.mutate();
              }}
            >
              <FormField label="应用时区">
                <TextInput
                  list="chronicle-timezones"
                  value={timeZone}
                  onChange={(event) => setTimeZone(event.target.value)}
                  placeholder="例如 Asia/Shanghai"
                  required
                />
              </FormField>
              <datalist id="chronicle-timezones">
                {timezoneOptions.map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
              <FormField label="基础币种">
                <SelectInput
                  value={baseCurrency}
                  disabled={applicationSettings.data?.baseCurrencyLocked}
                  onChange={(event) => setBaseCurrency(event.target.value)}
                >
                  {supportedCurrencies.map((currency) => (
                    <option key={currency} value={currency}>
                      {currencyLabel(currency)}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={saveApplicationSettings.isPending}>
                  {saveApplicationSettings.isPending ? '保存中…' : '保存工作区设置'}
                </Button>
                {saveApplicationSettings.isSuccess ? (
                  <span className="flex items-center gap-1 text-xs text-success">
                    <Check aria-hidden="true" className="size-3.5" /> 已保存
                  </span>
                ) : null}
              </div>
              {/* 基础币种锁定后不可改：历史换算口径是既成事实 */}
              {applicationSettings.data?.baseCurrencyLocked ? (
                <p
                  data-slot="pending"
                  className="border border-warning/30 bg-warning-subtle px-3 py-2 text-xs"
                >
                  基础币种已因历史财务记录锁定。历史金额的换算口径不会被设置修改覆盖；如需更换，请从空库重新初始化。
                </p>
              ) : null}
              <FormError>{saveApplicationSettings.error?.message}</FormError>
            </form>
          )}
        </Panel>

        <Panel
          eyebrow="Interface"
          title="界面偏好"
          description="偏好保存在当前浏览器，不会改变账务数据。"
        >
          <div className="flex flex-col">
            <PreferenceRow
              title="主题"
              hint="跟随系统、浅色或深色"
              control={<ThemeToggle />}
            />
            <PreferenceRow
              title="档案载体"
              hint="当票（宣纸/碑拓）或蓝印底册（白底/蓝靛）"
              control={<StyleToggle />}
            />
          </div>
        </Panel>
      </div>

      <Panel
        eyebrow="Catalog"
        title="物品分类"
        description="用颜色快速区分你的收藏领域。系统分类不能删除。"
        action={
          <span data-slot="amount" className="text-xs text-muted-foreground">
            {categories.data?.length ?? 0} 个
          </span>
        }
      >
        {categories.isPending ? (
          <RuledLines count={3} />
        ) : categories.isError ? (
          <div className="flex flex-wrap items-center gap-3">
            <FormError>{getApiErrorMessage(categories.error)}</FormError>
            <Button
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => void categories.refetch()}
            >
              重试
            </Button>
          </div>
        ) : null}
        <form className="flex flex-wrap gap-2" onSubmit={submitCategory}>
          <TextInput
            className="min-w-0 flex-1 basis-48"
            required
            maxLength={80}
            placeholder="新分类名称"
            aria-label="新分类名称"
            value={categoryName}
            onChange={(event) => setCategoryName(event.target.value)}
          />
          <TextInput
            className="min-w-0 basis-40"
            maxLength={24}
            placeholder="颜色，例如 #d97706"
            aria-label="新分类颜色"
            value={categoryColor}
            onChange={(event) => setCategoryColor(event.target.value)}
          />
          <Button className="h-9 shrink-0" disabled={createCategory.isPending}>
            添加分类
          </Button>
        </form>
        <FormError>{getApiErrorMessage(createCategory.error)}</FormError>
        <div className="flex flex-col">
          {categories.data?.map((category) => (
            <CategoryEditor category={category} key={category.id} />
          ))}
        </div>
      </Panel>

      <Panel
        eyebrow="Catalog"
        title="标签库"
        description="标签可以跨分类复用；仍在物品或订阅中使用的标签不能删除。"
        action={
          <span data-slot="amount" className="text-xs text-muted-foreground">
            {tags.data?.length ?? 0} 个
          </span>
        }
      >
        <form className="flex flex-wrap gap-2" onSubmit={submitTag}>
          <TextInput
            className="min-w-0 flex-1 basis-48"
            required
            maxLength={80}
            placeholder="新标签名称，例如 旅行"
            aria-label="新标签名称"
            value={tagName}
            onChange={(event) => setTagName(event.target.value)}
          />
          <TextInput
            className="min-w-0 basis-40"
            maxLength={24}
            placeholder="颜色，例如 #70d6d0"
            aria-label="新标签颜色"
            value={tagColor}
            onChange={(event) => setTagColor(event.target.value)}
          />
          <Button className="h-9 shrink-0" disabled={createTag.isPending}>
            添加标签
          </Button>
        </form>
        <FormError>{getApiErrorMessage(createTag.error)}</FormError>
        <div className="flex flex-col">
          {tags.data?.map((tag) => (
            <TagEditor tag={tag} key={tag.id} />
          ))}
          {tags.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有自定义标签。</p>
          ) : null}
        </div>
      </Panel>

      <Panel
        eyebrow="Lifecycle"
        title="物品状态"
        description="「仍持有 / 已处置」控制持有期限；「计入服役」控制日均成本的服役天数。历史记录不会因改名而消失。"
        action={
          <span data-slot="amount" className="text-xs text-muted-foreground">
            {statuses.data?.length ?? 0} 个
          </span>
        }
      >
        <form className="flex flex-wrap items-center gap-2" onSubmit={submitStatus}>
          <TextInput
            className="min-w-0 flex-1 basis-40"
            required
            maxLength={80}
            placeholder="新状态名称"
            aria-label="新状态名称"
            value={statusName}
            onChange={(event) => setStatusName(event.target.value)}
          />
          <SelectInput
            className="min-w-0 basis-28"
            aria-label="持有语义"
            value={ownershipState}
            onChange={(event) =>
              setOwnershipState(event.target.value as 'held' | 'disposed')
            }
          >
            <option value="held">仍持有</option>
            <option value="disposed">已处置</option>
          </SelectInput>
          <CheckboxField
            className="shrink-0"
            checked={countsTowardService}
            onChange={(event) => setCountsTowardService(event.target.checked)}
            label="计入服役"
          />
          <Button className="h-9 shrink-0" disabled={createStatus.isPending}>
            添加状态
          </Button>
        </form>
        <FormError>{getApiErrorMessage(createStatus.error)}</FormError>
        <div className="flex flex-col">
          {statuses.data?.map((status) => (
            <StatusEditor key={status.id} status={status} />
          ))}
        </div>
      </Panel>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Coins aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        金额历史使用锁定的原币种和汇率记录；修改显示设置不会重写过去发生的事实。
      </p>
    </div>
  );
}
