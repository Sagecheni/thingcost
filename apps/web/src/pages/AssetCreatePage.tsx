import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Save } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

import type { CreateAssetInput } from '@thingcost/contracts';
import { cn } from '@thingcost/ui';

import { TagPicker } from '../components/TagPicker.js';
import { api } from '../lib/api.js';
import {
  currencySymbol,
  supportedCurrencies,
  useBaseCurrency,
} from '../lib/application-settings.js';
import { localToday, majorToMinor } from '../lib/format.js';
import { markFresh } from '../lib/fresh-marks.js';
import { queryKeys } from '../lib/query-keys.js';
import { Button } from '../components/ui/button.js';
import {
  FieldGroup,
  FormActions,
  FormBlock,
  FormError,
  FormField,
  FormGrid,
  Panel,
  SelectInput,
  TextArea,
  TextInput,
} from '../components/ui/form.js';

const costOptions = [
  { value: 'known_amount', label: '金额已知' },
  { value: 'known_zero', label: '确实为零' },
  { value: 'unknown', label: '成本未知' },
] as const satisfies readonly {
  value: CreateAssetInput['costKnowledge'];
  label: string;
}[];

/* 成本口径用 radio，不是 tab —— 它是一次三选一的事实声明，
 * 而且"确实为零"和"成本未知"是两件不同的事，必须都能被明确选中。 */
const costChoice = cn(
  'flex flex-1 cursor-pointer items-center justify-center gap-2 border border-border',
  'px-3 py-2 text-sm text-muted-foreground transition duration-150',
  'hover:border-border-strong hover:text-foreground',
  'has-[:checked]:border-primary has-[:checked]:bg-primary',
  'has-[:checked]:text-primary-foreground',
  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
  'has-[:focus-visible]:outline-offset-2',
);

export function AssetCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const baseCurrency = useBaseCurrency();
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories,
    queryFn: api.categories,
  });
  const statusesQuery = useQuery({ queryKey: queryKeys.statuses, queryFn: api.statuses });
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [acquisitionType, setAcquisitionType] =
    useState<CreateAssetInput['acquisitionType']>('purchase');
  const [acquisitionDate, setAcquisitionDate] = useState(localToday());
  const [costKnowledge, setCostKnowledge] =
    useState<CreateAssetInput['costKnowledge']>('known_amount');
  const [amount, setAmount] = useState('');
  const [priceCurrency, setPriceCurrency] = useState(baseCurrency);
  const [exchangeRate, setExchangeRate] = useState('1');
  const [originalPrice, setOriginalPrice] = useState('');
  const [discount, setDiscount] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [purchaseChannel, setPurchaseChannel] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [warrantyStartDate, setWarrantyStartDate] = useState('');
  const [warrantyEndDate, setWarrantyEndDate] = useState('');
  const [extendedWarrantyEndDate, setExtendedWarrantyEndDate] = useState('');
  const [extendedWarrantyProvider, setExtendedWarrantyProvider] = useState('');
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');
  const [initialStatusId, setInitialStatusId] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setPriceCurrency((current) => (current === 'CNY' ? baseCurrency : current));
  }, [baseCurrency]);

  const heldStatuses = (statusesQuery.data ?? []).filter(
    (status) =>
      status.ownershipState === 'held' && !['lent', 'in_repair'].includes(status.code),
  );
  const defaultStatusId =
    initialStatusId || heldStatuses.find((status) => status.code === 'in_use')?.id || '';
  const defaultCategoryId = categoryId || categoriesQuery.data?.[0]?.id || '';
  const priceCurrencySymbol = currencySymbol(priceCurrency);

  const createAsset = useMutation({
    mutationFn: api.createAsset,
    onSuccess: async (asset) => {
      markFresh(asset.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.assetLists });
      await navigate({ to: '/assets/$assetId', params: { assetId: asset.id } });
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);

    if (!defaultCategoryId || !defaultStatusId) {
      setLocalError('分类与状态尚未加载完成');
      return;
    }

    const amountMinor = amount ? majorToMinor(amount, priceCurrency) : null;
    const originalPriceMinor = originalPrice
      ? majorToMinor(originalPrice, priceCurrency)
      : null;
    const discountMinor = discount ? majorToMinor(discount, priceCurrency) : null;

    if (costKnowledge === 'known_amount' && (!amountMinor || amountMinor === '0')) {
      setLocalError('请输入大于零的实付金额');
      return;
    }

    if ((originalPrice && !originalPriceMinor) || (discount && !discountMinor)) {
      setLocalError('金额最多保留两位小数');
      return;
    }

    const input: CreateAssetInput = {
      name,
      categoryId: defaultCategoryId,
      acquisitionType,
      acquisitionDate,
      costKnowledge,
      initialStatusId: defaultStatusId,
      tagIds,
      ...(costKnowledge === 'known_amount' && amountMinor
        ? {
            acquisitionAmountMinor: amountMinor,
            priceCurrency,
            ...(priceCurrency !== baseCurrency
              ? {
                  exchangeRate,
                  exchangeRateSource: 'manual' as const,
                  exchangeRateDate: acquisitionDate,
                }
              : {}),
          }
        : {}),
      ...(originalPriceMinor ? { originalPriceMinor } : {}),
      ...(discountMinor ? { discountMinor } : {}),
      ...(brand.trim() ? { brand: brand.trim() } : {}),
      ...(model.trim() ? { model: model.trim() } : {}),
      ...(serialNumber.trim() ? { serialNumber: serialNumber.trim() } : {}),
      ...(purchaseChannel.trim() ? { purchaseChannel: purchaseChannel.trim() } : {}),
      ...(orderNumber.trim() ? { orderNumber: orderNumber.trim() } : {}),
      ...(warrantyStartDate ? { warrantyStartDate } : {}),
      ...(warrantyEndDate ? { warrantyEndDate } : {}),
      ...(extendedWarrantyEndDate ? { extendedWarrantyEndDate } : {}),
      ...(extendedWarrantyProvider.trim()
        ? { extendedWarrantyProvider: extendedWarrantyProvider.trim() }
        : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };

    createAsset.mutate(input);
  };

  const moneyField = (
    value: string,
    onChange: (next: string) => void,
    placeholder: string,
    required = false,
  ) => (
    <FieldGroup>
      <span data-slot="amount" className="shrink-0 text-sm text-muted-foreground">
        {priceCurrencySymbol}
      </span>
      <input
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground focus-visible:outline-none"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </FieldGroup>
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="flex flex-col gap-2 border-b border-border pb-5">
        <Link
          className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          to="/assets"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> 返回全部物品
        </Link>
        <p data-slot="ledger-label">新增档案</p>
        <h1 className="text-2xl font-semibold text-heading">记录一件物品</h1>
        <p className="text-sm text-muted-foreground">
          先填必要信息，品牌、型号和故事可以以后慢慢补充。
        </p>
      </header>

      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Panel
          eyebrow="Basics"
          title="基本信息"
          description="它是什么，以及从哪一天开始属于你。"
        >
          <FormGrid>
            <FormField label="物品名称" className="sm:col-span-2">
              <TextInput
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：富士 X-T5"
                maxLength={160}
                required
                autoFocus
              />
            </FormField>
            <FormField label="主分类">
              <SelectInput
                value={defaultCategoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                required
              >
                {(categoriesQuery.data ?? []).map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.name}
                  </option>
                ))}
              </SelectInput>
            </FormField>
            <FormField label="取得方式">
              <SelectInput
                value={acquisitionType}
                onChange={(event) =>
                  setAcquisitionType(
                    event.target.value as CreateAssetInput['acquisitionType'],
                  )
                }
              >
                <option value="purchase">购买</option>
                <option value="gift">受赠</option>
                <option value="inheritance">继承</option>
                <option value="self_made">自制</option>
                <option value="exchange">交换</option>
                <option value="unknown">未知</option>
              </SelectInput>
            </FormField>
            <FormField label="取得日期">
              <TextInput
                type="date"
                value={acquisitionDate}
                max={localToday()}
                onChange={(event) => setAcquisitionDate(event.target.value)}
                required
              />
            </FormField>
            <FormField label="初始状态">
              <SelectInput
                value={defaultStatusId}
                onChange={(event) => setInitialStatusId(event.target.value)}
                required
              >
                {heldStatuses.map((status) => (
                  <option value={status.id} key={status.id}>
                    {status.name}
                  </option>
                ))}
              </SelectInput>
            </FormField>
          </FormGrid>
        </Panel>

        <Panel
          eyebrow="Cost"
          title="取得成本"
          description="零成本与记不清价格是两种不同的事实。"
        >
          <fieldset className="flex flex-wrap gap-2 border-0 p-0">
            <legend className="sr-only">取得成本口径</legend>
            {costOptions.map((option) => (
              <label className={costChoice} key={option.value}>
                <input
                  className="sr-only"
                  type="radio"
                  name="costKnowledge"
                  checked={costKnowledge === option.value}
                  onChange={() => setCostKnowledge(option.value)}
                />
                {option.label}
              </label>
            ))}
          </fieldset>

          {costKnowledge === 'known_amount' ? (
            <FormGrid>
              <FormField label="币种">
                <SelectInput
                  value={priceCurrency}
                  onChange={(event) => {
                    setPriceCurrency(event.target.value);
                    setExchangeRate(event.target.value === baseCurrency ? '1' : '');
                  }}
                >
                  {[baseCurrency, ...supportedCurrencies]
                    .filter((currency, index, all) => all.indexOf(currency) === index)
                    .map((currency) => (
                      <option value={currency} key={currency}>
                        {currency}
                      </option>
                    ))}
                </SelectInput>
              </FormField>
              <FormField label={`实付金额（${priceCurrency}）`}>
                {moneyField(
                  amount,
                  setAmount,
                  priceCurrency === 'JPY' ? '0' : '0.00',
                  true,
                )}
              </FormField>
              {priceCurrency !== baseCurrency ? (
                <FormField label={`锁定汇率（1 ${priceCurrency} = ? ${baseCurrency}）`}>
                  <TextInput
                    inputMode="decimal"
                    value={exchangeRate}
                    onChange={(event) => setExchangeRate(event.target.value)}
                    placeholder="例如 7.20"
                    required
                  />
                </FormField>
              ) : null}
              <FormField label="原价（可选）">
                {moneyField(originalPrice, setOriginalPrice, '0.00')}
              </FormField>
              <FormField label="优惠金额（可选）">
                {moneyField(discount, setDiscount, '0.00')}
              </FormField>
            </FormGrid>
          ) : null}
        </Panel>

        {/* 补充资料默认收起：录入负担渐进，先让最少信息产生价值。
         * 是夹纸抽屉不是存根：没有撕口顶线。 */}
        <details className="border border-border bg-card [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
            <span className="text-base font-semibold text-heading">补充资料</span>
            <span data-slot="ledger-label">可选</span>
          </summary>
          <div className="border-t border-border px-5 py-4">
            <FormGrid>
              <FormField label="品牌">
                <TextInput
                  value={brand}
                  onChange={(event) => setBrand(event.target.value)}
                />
              </FormField>
              <FormField label="型号">
                <TextInput
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                />
              </FormField>
              <FormField label="序列号">
                <TextInput
                  autoComplete="off"
                  value={serialNumber}
                  onChange={(event) => setSerialNumber(event.target.value)}
                />
              </FormField>
              <FormField label="购买渠道">
                <TextInput
                  value={purchaseChannel}
                  onChange={(event) => setPurchaseChannel(event.target.value)}
                  placeholder="例如：品牌官网"
                />
              </FormField>
              <FormField label="订单号">
                <TextInput
                  autoComplete="off"
                  value={orderNumber}
                  onChange={(event) => setOrderNumber(event.target.value)}
                />
              </FormField>
              <FormField label="保修开始">
                <TextInput
                  type="date"
                  value={warrantyStartDate}
                  onChange={(event) => setWarrantyStartDate(event.target.value)}
                />
              </FormField>
              <FormField label="保修结束">
                <TextInput
                  type="date"
                  min={warrantyStartDate || undefined}
                  value={warrantyEndDate}
                  onChange={(event) => setWarrantyEndDate(event.target.value)}
                />
              </FormField>
              <FormField label="延保结束">
                <TextInput
                  type="date"
                  min={warrantyEndDate || undefined}
                  value={extendedWarrantyEndDate}
                  onChange={(event) => setExtendedWarrantyEndDate(event.target.value)}
                />
              </FormField>
              <FormField label="延保服务方">
                <TextInput
                  value={extendedWarrantyProvider}
                  onChange={(event) => setExtendedWarrantyProvider(event.target.value)}
                />
              </FormField>
              <FormBlock label="标签" className="sm:col-span-2">
                <TagPicker selected={tagIds} onChange={setTagIds} />
              </FormBlock>
              <FormField label="简介" className="sm:col-span-2">
                <TextArea
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </FormField>
              <FormField label="初始时间线备注" className="sm:col-span-2">
                <TextArea
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </FormField>
            </FormGrid>
          </div>
        </details>

        <FormError>{localError ?? createAsset.error?.message}</FormError>

        <FormActions>
          <Button asChild variant="secondary">
            <Link to="/assets">取消</Link>
          </Button>
          <Button disabled={createAsset.isPending}>
            <Save aria-hidden="true" />
            {createAsset.isPending ? '正在保存…' : '保存物品'}
          </Button>
        </FormActions>
      </form>
    </div>
  );
}
