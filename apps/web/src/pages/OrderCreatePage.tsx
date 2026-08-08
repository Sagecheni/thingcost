import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Calculator, Plus, ReceiptText, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import type {
  CreatePurchaseOrderInput,
  OrderAllocationMethod,
} from '@thingcost/contracts';
import { allocateOrder } from '@thingcost/domain';

import { ApiClientError, api } from '../lib/api.js';
import { formatMinorCurrency, localToday, majorToMinor } from '../lib/format.js';
import { queryKeys } from '../lib/query-keys.js';

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
  const [currency, setCurrency] = useState('CNY');
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
    mutationFn: () => api.exchangeRateQuote(currency, 'CNY', orderedOn),
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

  function submit(event: React.FormEvent<HTMLFormElement>) {
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
      ...(currency !== 'CNY'
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
    <>
      <Link className="back-link" to="/orders">
        <ArrowLeft size={16} /> 返回订单
      </Link>
      <header className="topbar page-topbar order-create-heading">
        <div>
          <p className="eyebrow">Order mode</p>
          <h1>录入多商品订单</h1>
          <p className="muted-copy">
            提交后会一次创建物品、取得资金事件和可追溯的分摊明细。
          </p>
        </div>
      </header>

      <form className="order-create-layout" onSubmit={submit}>
        <div className="order-form-main">
          <section className="form-card order-form-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Receipt</p>
                <h2>订单信息</h2>
              </div>
              <ReceiptText size={20} />
            </div>
            <div className="form-grid">
              <label>
                商家
                <input
                  value={merchant}
                  onChange={(event) => setMerchant(event.target.value)}
                />
              </label>
              <label>
                订单号
                <input
                  value={orderNumber}
                  onChange={(event) => setOrderNumber(event.target.value)}
                />
              </label>
              <label>
                下单日期
                <input
                  type="date"
                  required
                  max={localToday()}
                  value={orderedOn}
                  onChange={(event) => setOrderedOn(event.target.value)}
                />
              </label>
              <label>
                币种
                <select
                  value={currency}
                  onChange={(event) => {
                    setCurrency(event.target.value);
                    setExchangeRate(event.target.value === 'CNY' ? '1' : '');
                    setExchangeRateSource('manual');
                    setExchangeRateFallback(false);
                  }}
                >
                  <option value="CNY">CNY · 人民币</option>
                  <option value="USD">USD · 美元</option>
                  <option value="EUR">EUR · 欧元</option>
                  <option value="JPY">JPY · 日元</option>
                  <option value="HKD">HKD · 港币</option>
                </select>
              </label>
              {currency !== 'CNY' && (
                <label>
                  锁定汇率（1 {currency} = ? CNY）
                  <input
                    inputMode="decimal"
                    value={exchangeRate}
                    onChange={(event) => {
                      setExchangeRate(event.target.value);
                      setExchangeRateSource('manual');
                      setExchangeRateFallback(false);
                    }}
                    required
                  />
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={quoteExchangeRate.isPending}
                    onClick={() => quoteExchangeRate.mutate()}
                  >
                    {quoteExchangeRate.isPending ? '获取中…' : '填入历史参考汇率'}
                  </button>
                </label>
              )}
              <label>
                分摊方式
                <select
                  value={allocationMethod}
                  onChange={(event) =>
                    setAllocationMethod(event.target.value as OrderAllocationMethod)
                  }
                >
                  <option value="proportional">按商品原价比例</option>
                  <option value="manual">手工指定每件实付</option>
                </select>
              </label>
            </div>
            <div className="form-grid order-adjustment-grid">
              <label>
                订单优惠（{currency}）
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={discount}
                  onChange={(event) => setDiscount(event.target.value)}
                />
              </label>
              <label>
                运费（{currency}）
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={shipping}
                  onChange={(event) => setShipping(event.target.value)}
                />
              </label>
              <label>
                税费（{currency}）
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={tax}
                  onChange={(event) => setTax(event.target.value)}
                />
              </label>
              <label>
                其他费用（{currency}）
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={fee}
                  onChange={(event) => setFee(event.target.value)}
                />
              </label>
            </div>
            <label>
              订单备注
              <textarea value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
          </section>

          <section className="form-card order-form-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Line items</p>
                <h2>订单商品</h2>
              </div>
              <button
                className="secondary-action"
                type="button"
                onClick={() =>
                  setItems((current) => [...current, emptyItem(nextItemKey++)])
                }
              >
                <Plus size={16} /> 添加一行
              </button>
            </div>

            <div className="order-line-editor">
              {items.map((item, index) => (
                <article key={item.key}>
                  <div className="order-line-heading">
                    <strong>物品 {index + 1}</strong>
                    {items.length > 1 && (
                      <button
                        className="icon-action danger-action"
                        type="button"
                        aria-label={`移除物品 ${index + 1}`}
                        onClick={() =>
                          setItems((current) =>
                            current.filter((candidate) => candidate.key !== item.key),
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <div className="form-grid">
                    <label>
                      物品名称 *
                      <input
                        required
                        value={item.name}
                        onChange={(event) =>
                          updateItem(item.key, { name: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      商品原价（{currency}）*
                      <input
                        required
                        inputMode="decimal"
                        placeholder="0.00"
                        value={item.listedPrice}
                        onChange={(event) =>
                          updateItem(item.key, { listedPrice: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      分类 *
                      <select
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
                      </select>
                    </label>
                    <label>
                      初始状态 *
                      <select
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
                      </select>
                    </label>
                    <label>
                      品牌
                      <input
                        value={item.brand}
                        onChange={(event) =>
                          updateItem(item.key, { brand: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      型号
                      <input
                        value={item.model}
                        onChange={(event) =>
                          updateItem(item.key, { model: event.target.value })
                        }
                      />
                    </label>
                    {allocationMethod === 'manual' && (
                      <label>
                        手工实付（{currency}）*
                        <input
                          required
                          inputMode="decimal"
                          placeholder="0.00"
                          value={item.allocatedAmount}
                          onChange={(event) =>
                            updateItem(item.key, { allocatedAmount: event.target.value })
                          }
                        />
                      </label>
                    )}
                  </div>
                  {allocationPreview?.lines[index] && (
                    <p className="order-line-preview">
                      预计取得成本{' '}
                      <strong>
                        {formatMinorCurrency(
                          allocationPreview.lines[index].allocatedAmountMinor.toString(),
                          currency,
                        )}
                      </strong>
                      {allocationPreview.lines[index].allocatedDiscountMinor > 0n && (
                        <span>
                          含优惠 −
                          {formatMinorCurrency(
                            allocationPreview.lines[
                              index
                            ].allocatedDiscountMinor.toString(),
                            currency,
                          )}
                        </span>
                      )}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="order-allocation-panel">
          <div className="allocation-panel-icon">
            <Calculator size={22} />
          </div>
          <p className="eyebrow">Live allocation</p>
          <h2>分摊预览</h2>
          {allocationPreview ? (
            <>
              <dl>
                <div>
                  <dt>商品原价</dt>
                  <dd>
                    {formatMinorCurrency(
                      allocationPreview.subtotalMinor.toString(),
                      currency,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>订单优惠</dt>
                  <dd>
                    −
                    {formatMinorCurrency(
                      (moneyMinor(discount, currency, true) ?? 0n).toString(),
                      currency,
                    )}
                  </dd>
                </div>
                <div className="allocation-total">
                  <dt>订单实付</dt>
                  <dd>
                    {formatMinorCurrency(
                      allocationPreview.totalPaidMinor.toString(),
                      currency,
                    )}
                  </dd>
                </div>
              </dl>
              <p>
                {allocationMethod === 'manual'
                  ? '每行实付合计已精确匹配订单总额。'
                  : '使用最大余数法分配到最小货币单位，舍入差额按稳定顺序回收。'}
              </p>
            </>
          ) : (
            <p className="allocation-invalid">填写有效金额后显示精确分摊。</p>
          )}
          {formError && <div className="form-error">{formError}</div>}
          <button
            className="primary-action"
            type="submit"
            disabled={createOrder.isPending}
          >
            {createOrder.isPending ? '正在创建订单…' : `创建 ${items.length} 件物品`}
          </button>
          <small>订单提交后作为资金历史保存，不提供直接覆盖编辑。</small>
        </aside>
      </form>
    </>
  );
}
