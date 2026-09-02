import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import type {
  CreatePurchaseOrderInput,
  OrderAllocationMethod,
} from '@thingcost/contracts';
import { allocateOrder } from '@thingcost/domain';

import { ApiClientError, api } from '../lib/api.js';
import {
  currencyLabel,
  supportedCurrencies,
  useBaseCurrency,
} from '../lib/application-settings.js';
import { formatMinorCurrency, localToday, majorToMinor } from '../lib/format.js';
import { markFresh } from '../lib/fresh-marks.js';
import { queryKeys } from '../lib/query-keys.js';
import { Button } from '../components/ui/button.js';
import {
  FormError,
  FormField,
  FormGrid,
  Panel,
  SelectInput,
  TextArea,
  TextInput,
} from '../components/ui/form.js';

interface DraftOrderItem {
  key: number;
  name: string;
  categoryId: string;
  initialStatusId: string;
  brand: string;
  model: string;
  listedPrice: string;
  allocatedAmount: string;
}

let nextItemKey = 3;

function emptyItem(key: number): DraftOrderItem {
  return {
    key,
    name: '',
    categoryId: '',
    initialStatusId: '',
    brand: '',
    model: '',
    listedPrice: '',
    allocatedAmount: '',
  };
}

function moneyMinor(value: string, currency: string, blankAsZero = false): bigint | null {
  if (blankAsZero && value.trim() === '') return 0n;
  const parsed = majorToMinor(value, currency);
  return parsed === null ? null : BigInt(parsed);
}

export function OrderCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const baseCurrency = useBaseCurrency();
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories,
    queryFn: api.categories,
  });
  const statusesQuery = useQuery({ queryKey: queryKeys.statuses, queryFn: api.statuses });
  const availableStatuses =
    statusesQuery.data?.filter(
      (status) =>
        status.ownershipState === 'held' && !['lent', 'in_repair'].includes(status.code),
    ) ?? [];

  const [merchant, setMerchant] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [orderedOn, setOrderedOn] = useState(localToday());
  const [currency, setCurrency] = useState(baseCurrency);
  const [exchangeRate, setExchangeRate] = useState('1');
  const [exchangeRateSource, setExchangeRateSource] = useState<'manual' | 'frankfurter'>(
    'manual',
  );
  const [exchangeRateDate, setExchangeRateDate] = useState(localToday());
  const [exchangeRateFallback, setExchangeRateFallback] = useState(false);
  const [discount, setDiscount] = useState('');
  const [shipping, setShipping] = useState('');
  const [tax, setTax] = useState('');
  const [fee, setFee] = useState('');
  const [note, setNote] = useState('');
  const [allocationMethod, setAllocationMethod] =
    useState<OrderAllocationMethod>('proportional');
  const [items, setItems] = useState<DraftOrderItem[]>([emptyItem(1), emptyItem(2)]);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setCurrency((current) => (current === 'CNY' ? baseCurrency : current));
  }, [baseCurrency]);

  const allocationPreview = useMemo(() => {
    const listed = items.map((item) => moneyMinor(item.listedPrice, currency));
    const adjustments = [discount, shipping, tax, fee].map((value) =>
      moneyMinor(value, currency, true),
    );
    if (
      listed.some((value) => value === null) ||
      adjustments.some((value) => value === null)
    ) {
      return null;
    }

    try {
      return allocateOrder(
        items.map((item, index) => ({
          listedPriceMinor: listed[index] ?? 0n,
          ...(allocationMethod === 'manual'
            ? {
                manualAllocatedAmountMinor:
                  moneyMinor(item.allocatedAmount, currency) ?? -1n,
              }
            : {}),
        })),
        {
          discountMinor: adjustments[0] ?? 0n,
          shippingMinor: adjustments[1] ?? 0n,
          taxMinor: adjustments[2] ?? 0n,
          feeMinor: adjustments[3] ?? 0n,
        },
        allocationMethod,
      );
    } catch {
      return null;
    }
  }, [allocationMethod, currency, discount, fee, items, shipping, tax]);

  const quoteExchangeRate = useMutation({
    mutationFn: () => api.exchangeRateQuote(currency, baseCurrency, orderedOn),
    onSuccess: (quote) => {
      setExchangeRate(quote.rate);
      setExchangeRateSource('frankfurter');
      setExchangeRateDate(quote.effectiveDate);
      setExchangeRateFallback(quote.fallback);
    },
    onError: (error) =>
      setFormError(error instanceof ApiClientError ? error.message : '汇率获取失败'),
  });

  const createOrder = useMutation({
    mutationFn: api.createOrder,
    onSuccess: async (created) => {
      markFresh(created.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.orders }),
        queryClient.invalidateQueries({ queryKey: queryKeys.assetLists }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      await navigate({ to: '/orders/$orderId', params: { orderId: created.id } });
    },
    onError: (error) => {
      setFormError(
        error instanceof ApiClientError ? error.message : '订单保存失败，请重试。',
      );
    },
  });

  function updateItem(key: number, patch: Partial<DraftOrderItem>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!allocationPreview) {
      setFormError('请检查金额；商品原价合计需大于零，且分摊必须精确回到订单实付。');
      return;
    }
    if (
      items.some((item) => !item.name.trim() || !item.categoryId || !item.initialStatusId)
    ) {
      setFormError('请填写每件物品的名称、分类和初始状态。');
      return;
    }

    const input: CreatePurchaseOrderInput = {
      ...(merchant.trim() ? { merchant: merchant.trim() } : {}),
      ...(orderNumber.trim() ? { orderNumber: orderNumber.trim() } : {}),
      orderedOn,
      currency,
      discountMinor: moneyMinor(discount, currency, true)?.toString() ?? '0',
      shippingMinor: moneyMinor(shipping, currency, true)?.toString() ?? '0',
      taxMinor: moneyMinor(tax, currency, true)?.toString() ?? '0',
      feeMinor: moneyMinor(fee, currency, true)?.toString() ?? '0',
      ...(currency !== baseCurrency
        ? {
            exchangeRate,
            exchangeRateSource,
            exchangeRateDate,
            exchangeRateFallback,
          }
        : {}),
      allocationMethod,
      ...(note.trim() ? { note: note.trim() } : {}),
      items: items.map((item, index) => ({
        name: item.name.trim(),
        categoryId: item.categoryId,
        initialStatusId: item.initialStatusId,
        tagIds: [],
        listedPriceMinor:
          allocationPreview.lines[index]?.listedPriceMinor.toString() ?? '0',
        ...(item.brand.trim() ? { brand: item.brand.trim() } : {}),
        ...(item.model.trim() ? { model: item.model.trim() } : {}),
        ...(allocationMethod === 'manual'
          ? {
              allocatedAmountMinor:
                allocationPreview.lines[index]?.allocatedAmountMinor.toString() ?? '0',
            }
          : {}),
      })),
    };
    createOrder.mutate(input);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header className="flex flex-col gap-2 border-b border-border pb-5">
        <Link
          className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          to="/orders"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> 返回订单
        </Link>
        <p data-slot="ledger-label">Order mode</p>
        <h1 className="text-2xl font-semibold text-heading">录入多商品订单</h1>
        <p className="text-sm text-muted-foreground">
          提交后会一次创建物品、取得资金事件和可追溯的分摊明细。
        </p>
      </header>

      <form className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]" onSubmit={submit}>
        <div className="flex min-w-0 flex-col gap-4">
          <Panel eyebrow="Receipt" title="订单信息">
            <FormGrid>
              <FormField label="商家">
                <TextInput
                  value={merchant}
                  onChange={(event) => setMerchant(event.target.value)}
                />
              </FormField>
              <FormField label="订单号">
                <TextInput
                  value={orderNumber}
                  onChange={(event) => setOrderNumber(event.target.value)}
                />
              </FormField>
              <FormField label="下单日期">
                <TextInput
                  type="date"
                  required
                  max={localToday()}
                  value={orderedOn}
                  onChange={(event) => setOrderedOn(event.target.value)}
                />
              </FormField>
              <FormField label="币种">
                <SelectInput
                  value={currency}
                  onChange={(event) => {
                    setCurrency(event.target.value);
                    setExchangeRate(event.target.value === baseCurrency ? '1' : '');
                    setExchangeRateSource('manual');
                    setExchangeRateFallback(false);
                  }}
                >
                  {[baseCurrency, ...supportedCurrencies]
                    .filter((value, index, all) => all.indexOf(value) === index)
                    .map((value) => (
                      <option value={value} key={value}>
                        {currencyLabel(value)}
                      </option>
                    ))}
                </SelectInput>
              </FormField>
              {currency !== baseCurrency ? (
                <>
                  <FormField label={`锁定汇率（1 ${currency} = ? ${baseCurrency}）`}>
                    <TextInput
                      inputMode="decimal"
                      value={exchangeRate}
                      onChange={(event) => {
                        setExchangeRate(event.target.value);
                        setExchangeRateSource('manual');
                        setExchangeRateFallback(false);
                      }}
                      required
                    />
                  </FormField>
                  <div className="flex items-end">
                    <Button
                      variant="secondary"
                      type="button"
                      disabled={quoteExchangeRate.isPending}
                      onClick={() => quoteExchangeRate.mutate()}
                    >
                      {quoteExchangeRate.isPending ? '获取中…' : '填入历史参考汇率'}
                    </Button>
                  </div>
                </>
              ) : null}
              <FormField label="分摊方式">
                <SelectInput
                  value={allocationMethod}
                  onChange={(event) =>
                    setAllocationMethod(event.target.value as OrderAllocationMethod)
                  }
                >
                  <option value="proportional">按商品原价比例</option>
                  <option value="manual">手工指定每件实付</option>
                </SelectInput>
              </FormField>
            </FormGrid>

            <FormGrid className="lg:grid-cols-4">
              <FormField label={`订单优惠（${currency}）`}>
                <TextInput
                  inputMode="decimal"
                  placeholder="0.00"
                  value={discount}
                  onChange={(event) => setDiscount(event.target.value)}
                />
              </FormField>
              <FormField label={`运费（${currency}）`}>
                <TextInput
                  inputMode="decimal"
                  placeholder="0.00"
                  value={shipping}
                  onChange={(event) => setShipping(event.target.value)}
                />
              </FormField>
              <FormField label={`税费（${currency}）`}>
                <TextInput
                  inputMode="decimal"
                  placeholder="0.00"
                  value={tax}
                  onChange={(event) => setTax(event.target.value)}
                />
              </FormField>
              <FormField label={`其他费用（${currency}）`}>
                <TextInput
                  inputMode="decimal"
                  placeholder="0.00"
                  value={fee}
                  onChange={(event) => setFee(event.target.value)}
                />
              </FormField>
            </FormGrid>

            <FormField label="订单备注">
              <TextArea
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </FormField>
          </Panel>

          <Panel
            eyebrow="Line items"
            title="订单商品"
            action={
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() =>
                  setItems((current) => [...current, emptyItem(nextItemKey++)])
                }
              >
                <Plus aria-hidden="true" /> 添加一行
              </Button>
            }
          >
            <div className="flex flex-col gap-4">
              {items.map((item, index) => (
                <article
                  className="space-y-3 border-t border-dashed border-border pt-4 first:border-0 first:pt-0"
                  key={item.key}
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong data-slot="ledger-label">物品 {index + 1}</strong>
                    {items.length > 1 ? (
                      <button
                        className="flex size-7 items-center justify-center border border-border text-muted-foreground hover:border-destructive/50 hover:text-destructive"
                        type="button"
                        aria-label={`移除物品 ${index + 1}`}
                        onClick={() =>
                          setItems((current) =>
                            current.filter((candidate) => candidate.key !== item.key),
                          )
                        }
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </button>
                    ) : null}
                  </div>
                  <FormGrid>
                    <FormField label="物品名称 *">
                      <TextInput
                        required
                        value={item.name}
                        onChange={(event) =>
                          updateItem(item.key, { name: event.target.value })
                        }
                      />
                    </FormField>
                    <FormField label={`商品原价（${currency}）*`}>
                      <TextInput
                        required
                        inputMode="decimal"
                        placeholder="0.00"
                        value={item.listedPrice}
                        onChange={(event) =>
                          updateItem(item.key, { listedPrice: event.target.value })
                        }
                      />
                    </FormField>
                    <FormField label="分类 *">
                      <SelectInput
                        required
                        value={item.categoryId}
                        onChange={(event) =>
                          updateItem(item.key, { categoryId: event.target.value })
                        }
                      >
                        <option value="">选择分类</option>
                        {categoriesQuery.data?.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </SelectInput>
                    </FormField>
                    <FormField label="初始状态 *">
                      <SelectInput
                        required
                        value={item.initialStatusId}
                        onChange={(event) =>
                          updateItem(item.key, { initialStatusId: event.target.value })
                        }
                      >
                        <option value="">选择状态</option>
                        {availableStatuses.map((status) => (
                          <option key={status.id} value={status.id}>
                            {status.name}
                          </option>
                        ))}
                      </SelectInput>
                    </FormField>
                    <FormField label="品牌">
                      <TextInput
                        value={item.brand}
                        onChange={(event) =>
                          updateItem(item.key, { brand: event.target.value })
                        }
                      />
                    </FormField>
                    <FormField label="型号">
                      <TextInput
                        value={item.model}
                        onChange={(event) =>
                          updateItem(item.key, { model: event.target.value })
                        }
                      />
                    </FormField>
                    {allocationMethod === 'manual' ? (
                      <FormField label={`手工实付（${currency}）*`}>
                        <TextInput
                          required
                          inputMode="decimal"
                          placeholder="0.00"
                          value={item.allocatedAmount}
                          onChange={(event) =>
                            updateItem(item.key, { allocatedAmount: event.target.value })
                          }
                        />
                      </FormField>
                    ) : null}
                  </FormGrid>
                  {allocationPreview?.lines[index] ? (
                    <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                      预计取得成本{' '}
                      <strong data-slot="amount" className="font-medium text-foreground">
                        {formatMinorCurrency(
                          allocationPreview.lines[index].allocatedAmountMinor.toString(),
                          currency,
                        )}
                      </strong>
                      {allocationPreview.lines[index].allocatedDiscountMinor > 0n ? (
                        <span data-slot="amount">
                          含优惠 −
                          {formatMinorCurrency(
                            allocationPreview.lines[
                              index
                            ].allocatedDiscountMinor.toString(),
                            currency,
                          )}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </Panel>
        </div>

        {/* 分摊预览随输入实时重算 —— 分摊口径必须在提交前就能看见 */}
        <aside className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
          <Panel eyebrow="Live allocation" title="分摊预览">
            {allocationPreview ? (
              <>
                <dl className="flex flex-col">
                  <div className="flex justify-between gap-2 border-b border-dashed border-border py-2">
                    <dt className="text-xs text-muted-foreground">商品原价</dt>
                    <dd data-slot="amount" className="text-sm">
                      {formatMinorCurrency(
                        allocationPreview.subtotalMinor.toString(),
                        currency,
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 border-b border-dashed border-border py-2">
                    <dt className="text-xs text-muted-foreground">订单优惠</dt>
                    <dd data-slot="amount" className="text-sm">
                      −
                      {formatMinorCurrency(
                        (moneyMinor(discount, currency, true) ?? 0n).toString(),
                        currency,
                      )}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 py-2">
                    <dt data-slot="ledger-label">订单实付</dt>
                    <dd data-slot="amount" className="text-lg font-medium text-heading">
                      {formatMinorCurrency(
                        allocationPreview.totalPaidMinor.toString(),
                        currency,
                      )}
                    </dd>
                  </div>
                </dl>
                <p className="text-xs text-muted-foreground">
                  {allocationMethod === 'manual'
                    ? '每行实付合计已精确匹配订单总额。'
                    : '使用最大余数法分配到最小货币单位，舍入差额按稳定顺序回收。'}
                </p>
              </>
            ) : (
              <p data-slot="pending" className="text-sm">
                填写有效金额后显示精确分摊。
              </p>
            )}
          </Panel>

          <FormError>{formError}</FormError>

          <Button type="submit" disabled={createOrder.isPending}>
            {createOrder.isPending ? '正在创建订单…' : `创建 ${items.length} 件物品`}
          </Button>
          <small className="text-xs text-muted-foreground">
            订单提交后作为资金历史保存，不提供直接覆盖编辑。
          </small>
        </aside>
      </form>
    </div>
  );
}
