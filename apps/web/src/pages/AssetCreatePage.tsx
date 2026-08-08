import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ChevronDown, Save } from 'lucide-react';
import { type FormEvent, useState } from 'react';

import type { CreateAssetInput } from '@thingcost/contracts';

import { TagPicker } from '../components/TagPicker.js';
import { api } from '../lib/api.js';
import { localToday, majorToMinor } from '../lib/format.js';
import { queryKeys } from '../lib/query-keys.js';

export function AssetCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
  const [priceCurrency, setPriceCurrency] = useState('CNY');
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

  const heldStatuses = (statusesQuery.data ?? []).filter(
    (status) =>
      status.ownershipState === 'held' && !['lent', 'in_repair'].includes(status.code),
  );
  const defaultStatusId =
    initialStatusId || heldStatuses.find((status) => status.code === 'in_use')?.id || '';
  const defaultCategoryId = categoryId || categoriesQuery.data?.[0]?.id || '';

  const createAsset = useMutation({
    mutationFn: api.createAsset,
    onSuccess: async (asset) => {
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
            ...(priceCurrency !== 'CNY'
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

  return (
    <>
      <header className="detail-header">
        <Link className="back-link" to="/assets">
          <ArrowLeft size={17} /> 返回全部物品
        </Link>
        <p className="eyebrow">新增档案</p>
        <h1>记录一件物品</h1>
        <p className="muted-copy">先填必要信息，品牌、型号和故事可以以后慢慢补充。</p>
      </header>

      <form className="editor-layout" onSubmit={submit}>
        <section className="form-card">
          <div className="form-section-heading">
            <span>01</span>
            <div>
              <h2>基本信息</h2>
              <p>它是什么，以及从哪一天开始属于你。</p>
            </div>
          </div>
          <div className="form-grid">
            <label className="form-span-2">
              物品名称
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：富士 X-T5"
                maxLength={160}
                required
                autoFocus
              />
            </label>
            <label>
              主分类
              <select
                value={defaultCategoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                required
              >
                {(categoriesQuery.data ?? []).map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              取得方式
              <select
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
              </select>
            </label>
            <label>
              取得日期
              <input
                type="date"
                value={acquisitionDate}
                max={localToday()}
                onChange={(event) => setAcquisitionDate(event.target.value)}
                required
              />
            </label>
            <label>
              初始状态
              <select
                value={defaultStatusId}
                onChange={(event) => setInitialStatusId(event.target.value)}
                required
              >
                {heldStatuses.map((status) => (
                  <option value={status.id} key={status.id}>
                    {status.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="form-card">
          <div className="form-section-heading">
            <span>02</span>
            <div>
              <h2>取得成本</h2>
              <p>零成本与记不清价格是两种不同的事实。</p>
            </div>
          </div>
          <div className="segmented-control">
            <label>
              <input
                type="radio"
                name="costKnowledge"
                checked={costKnowledge === 'known_amount'}
                onChange={() => setCostKnowledge('known_amount')}
              />
              金额已知
            </label>
            <label>
              <input
                type="radio"
                name="costKnowledge"
                checked={costKnowledge === 'known_zero'}
                onChange={() => setCostKnowledge('known_zero')}
              />
              确实为零
            </label>
            <label>
              <input
                type="radio"
                name="costKnowledge"
                checked={costKnowledge === 'unknown'}
                onChange={() => setCostKnowledge('unknown')}
              />
              成本未知
            </label>
          </div>

          {costKnowledge === 'known_amount' && (
            <div className="form-grid money-grid">
              <label>
                币种
                <select
                  value={priceCurrency}
                  onChange={(event) => {
                    setPriceCurrency(event.target.value);
                    setExchangeRate(event.target.value === 'CNY' ? '1' : '');
                  }}
                >
                  <option value="CNY">CNY</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="JPY">JPY</option>
                  <option value="HKD">HKD</option>
                </select>
              </label>
              <label>
                实付金额（{priceCurrency}）
                <div className="money-input">
                  <span>{priceCurrency === 'CNY' ? '¥' : priceCurrency}</span>
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder={priceCurrency === 'JPY' ? '0' : '0.00'}
                    required
                  />
                </div>
              </label>
              {priceCurrency !== 'CNY' && (
                <label>
                  锁定汇率（1 {priceCurrency} = ? CNY）
                  <input
                    inputMode="decimal"
                    value={exchangeRate}
                    onChange={(event) => setExchangeRate(event.target.value)}
                    placeholder="例如 7.20"
                    required
                  />
                </label>
              )}
              <label>
                原价（可选）
                <div className="money-input">
                  <span>{priceCurrency === 'CNY' ? '¥' : priceCurrency}</span>
                  <input
                    inputMode="decimal"
                    value={originalPrice}
                    onChange={(event) => setOriginalPrice(event.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </label>
              <label>
                优惠金额（可选）
                <div className="money-input">
                  <span>{priceCurrency === 'CNY' ? '¥' : priceCurrency}</span>
                  <input
                    inputMode="decimal"
                    value={discount}
                    onChange={(event) => setDiscount(event.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </label>
            </div>
          )}
        </section>

        <details className="form-card progressive-details">
          <summary>
            <span>
              <ChevronDown size={18} /> 补充资料
            </span>
            <small>可选</small>
          </summary>
          <div className="form-grid details-content">
            <label>
              品牌
              <input value={brand} onChange={(event) => setBrand(event.target.value)} />
            </label>
            <label>
              型号
              <input value={model} onChange={(event) => setModel(event.target.value)} />
            </label>
            <label>
              序列号
              <input
                autoComplete="off"
                value={serialNumber}
                onChange={(event) => setSerialNumber(event.target.value)}
              />
            </label>
            <label>
              购买渠道
              <input
                value={purchaseChannel}
                onChange={(event) => setPurchaseChannel(event.target.value)}
                placeholder="例如：品牌官网"
              />
            </label>
            <label>
              订单号
              <input
                autoComplete="off"
                value={orderNumber}
                onChange={(event) => setOrderNumber(event.target.value)}
              />
            </label>
            <label>
              保修开始
              <input
                type="date"
                value={warrantyStartDate}
                onChange={(event) => setWarrantyStartDate(event.target.value)}
              />
            </label>
            <label>
              保修结束
              <input
                type="date"
                min={warrantyStartDate || undefined}
                value={warrantyEndDate}
                onChange={(event) => setWarrantyEndDate(event.target.value)}
              />
            </label>
            <label>
              延保结束
              <input
                type="date"
                min={warrantyEndDate || undefined}
                value={extendedWarrantyEndDate}
                onChange={(event) => setExtendedWarrantyEndDate(event.target.value)}
              />
            </label>
            <label>
              延保服务方
              <input
                value={extendedWarrantyProvider}
                onChange={(event) => setExtendedWarrantyProvider(event.target.value)}
              />
            </label>
            <div className="form-span-2 form-field-group">
              <span>标签</span>
              <TagPicker selected={tagIds} onChange={setTagIds} />
            </div>
            <label className="form-span-2">
              简介
              <textarea
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <label className="form-span-2">
              初始时间线备注
              <textarea
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          </div>
        </details>

        {(localError || createAsset.error) && (
          <p className="form-error" role="alert">
            {localError ?? createAsset.error?.message}
          </p>
        )}

        <div className="editor-actions">
          <Link className="secondary-action" to="/assets">
            取消
          </Link>
          <button className="primary-action" disabled={createAsset.isPending}>
            <Save size={17} /> {createAsset.isPending ? '正在保存…' : '保存物品'}
          </button>
        </div>
      </form>
    </>
  );
}
