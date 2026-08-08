import type { z } from 'zod';

import {
  apiErrorSchema,
  applicationSettingsSchema,
  assetAttachmentSchema,
  assetDetailSchema,
  assetListSchema,
  assetStatusSchema,
  authenticationStatusSchema,
  categorySchema,
  dashboardSchema,
  exchangeRateQuoteSchema,
  portableImportPreviewSchema,
  portableImportResultSchema,
  recycleBinSchema,
  personalAccessTokenSchema,
  personalApiSettingsSchema,
  createdPersonalAccessTokenSchema,
  valuationPreviewSchema,
  valuationReportListSchema,
  valuationReportSchema,
  valuationSnapshotListSchema,
  valuationScheduleSchema,
  valuationAnalyticsSchema,
  confirmValuationResultSchema,
  subscriptionListSchema,
  subscriptionDetailSchema,
  subscriptionChargeSchema,
  subscriptionAttachmentSchema,
  purchaseOrderDetailSchema,
  purchaseOrderListSchema,
  notificationChannelListSchema,
  notificationChannelSchema,
  testNotificationChannelResultSchema,
  reminderDetailSchema,
  reminderListSchema,
  reminderOccurrenceListSchema,
  reminderOccurrenceSchema,
  sessionResponseSchema,
  setupStatusSchema,
  tagSchema,
  wishlistConversionResultSchema,
  wishlistImageSchema,
  wishlistItemDetailSchema,
  wishlistItemListSchema,
  wishlistLinkSchema,
  wishlistPriceSnapshotSchema,
  type AssetListQuery,
  type CompleteRepairInput,
  type CorrectFinancialEventInput,
  type CorrectLifecycleEventInput,
  type CreateAssetStatusInput,
  type CreateCategoryInput,
  type CreatePurchaseOrderInput,
  type UpdateAssetAttachmentInput,
  type CreateAssetInput,
  type CreateConditionEventInput,
  type CreateFinancialEventInput,
  type CreateLoanInput,
  type CreateNotificationChannelInput,
  type CreateReminderInput,
  type CreateRepairInput,
  type CreateWishlistItemInput,
  type CreateWishlistLinkInput,
  type CreateWishlistPriceSnapshotInput,
  type ConvertWishlistItemInput,
  type CreatePersonalAccessTokenInput,
  type ConfirmValuationInput,
  type UpdateValuationScheduleInput,
  type CreateSubscriptionInput,
  type CreateSubscriptionChargeInput,
  type CreateSubscriptionPriceChangeInput,
  type SubscriptionActionInput,
  type UpdateSubscriptionInput,
  type InitializeApplicationInput,
  type LoginInput,
  type ReturnLoanInput,
  type TransitionAssetInput,
  type UpdateNotificationChannelInput,
  type UpdateReminderInput,
  type UpdateAssetInput,
  type UpdateAssetStatusInput,
  type UpdateCategoryInput,
  type UpdateWishlistItemInput,
  type WishlistListQuery,
} from '@thingcost/contracts';

export function getApiErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败，请稍后重试';
}

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);

  if (init?.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'same-origin',
  });

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const parsedError = apiErrorSchema.safeParse(payload);
    throw new ApiClientError(
      response.status,
      parsedError.success ? parsedError.data.code : 'UNEXPECTED_API_ERROR',
      parsedError.success ? parsedError.data.message : `请求失败（${response.status}）`,
    );
  }

  const payload: unknown = await response.json();
  return schema.parse(payload);
}

async function requestEmpty(path: string, init?: RequestInit): Promise<void> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
  });

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const parsedError = apiErrorSchema.safeParse(payload);
    throw new ApiClientError(
      response.status,
      parsedError.success ? parsedError.data.code : 'UNEXPECTED_API_ERROR',
      parsedError.success ? parsedError.data.message : `请求失败（${response.status}）`,
    );
  }
}

async function requestDownload(
  path: string,
  init?: RequestInit,
): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
  });

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const parsedError = apiErrorSchema.safeParse(payload);
    throw new ApiClientError(
      response.status,
      parsedError.success ? parsedError.data.code : 'UNEXPECTED_API_ERROR',
      parsedError.success ? parsedError.data.message : `请求失败（${response.status}）`,
    );
  }

  const disposition = response.headers.get('content-disposition') ?? '';
  const filename =
    /filename="([^"\\/]+)"/u.exec(disposition)?.[1] ?? 'chronicle-export.zip';
  return { blob: await response.blob(), filename };
}

const initializedSessionSchema = sessionResponseSchema.extend({
  settings: applicationSettingsSchema,
});

export const api = {
  setupStatus: () => requestJson('/api/v1/setup/status', setupStatusSchema),
  initialize: (input: InitializeApplicationInput) =>
    requestJson('/api/v1/setup', initializedSessionSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  session: () => requestJson('/api/v1/auth/session', authenticationStatusSchema),
  login: (input: LoginInput) =>
    requestJson('/api/v1/auth/login', sessionResponseSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  logout: () => requestEmpty('/api/v1/auth/logout', { method: 'POST' }),
  categories: () => requestJson('/api/v1/categories', categorySchema.array()),
  createCategory: (input: CreateCategoryInput) =>
    requestJson('/api/v1/categories', categorySchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateCategory: (id: string, input: UpdateCategoryInput) =>
    requestJson(`/api/v1/categories/${id}`, categorySchema, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteCategory: (id: string) =>
    requestEmpty(`/api/v1/categories/${id}`, { method: 'DELETE' }),
  statuses: () => requestJson('/api/v1/asset-statuses', assetStatusSchema.array()),
  createStatus: (input: CreateAssetStatusInput) =>
    requestJson('/api/v1/asset-statuses', assetStatusSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateStatus: (id: string, input: UpdateAssetStatusInput) =>
    requestJson(`/api/v1/asset-statuses/${id}`, assetStatusSchema, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteStatus: (id: string) =>
    requestEmpty(`/api/v1/asset-statuses/${id}`, { method: 'DELETE' }),
  tags: () => requestJson('/api/v1/tags', tagSchema.array()),
  createTag: (input: { name: string; color?: string }) =>
    requestJson('/api/v1/tags', tagSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  dashboard: (periodDays: number) =>
    requestJson(`/api/v1/dashboard?periodDays=${String(periodDays)}`, dashboardSchema),
  exchangeRateQuote: (base: string, quote: string, date: string) =>
    requestJson(
      `/api/v1/exchange-rates/quote?base=${encodeURIComponent(base)}&quote=${encodeURIComponent(quote)}&date=${encodeURIComponent(date)}`,
      exchangeRateQuoteSchema,
    ),
  portableExport: () =>
    requestDownload('/api/v1/exports/portable', {
      method: 'POST',
    }),
  portableImportPreview: (file: File) => {
    const body = new FormData();
    body.set('file', file);
    return requestJson('/api/v1/imports/portable/preview', portableImportPreviewSchema, {
      method: 'POST',
      body,
    });
  },
  portableImportApply: (input: {
    importId: string;
    mode: 'replace';
    confirmReplace: true;
  }) =>
    requestJson('/api/v1/imports/portable/apply', portableImportResultSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  personalApiSettings: () =>
    requestJson('/api/v1/settings/personal-api', personalApiSettingsSchema),
  updatePersonalApiSettings: (input: { enabled: boolean }) =>
    requestJson('/api/v1/settings/personal-api', personalApiSettingsSchema, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  personalAccessTokens: () =>
    requestJson('/api/v1/personal-access-tokens', personalAccessTokenSchema.array()),
  createPersonalAccessToken: (input: CreatePersonalAccessTokenInput) =>
    requestJson('/api/v1/personal-access-tokens', createdPersonalAccessTokenSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  revokePersonalAccessToken: (tokenId: string) =>
    requestJson(`/api/v1/personal-access-tokens/${tokenId}`, personalAccessTokenSchema, {
      method: 'DELETE',
    }),
  valuationPreview: (assetId: string) =>
    requestJson(`/api/v1/assets/${assetId}/valuations/preview`, valuationPreviewSchema),
  valuationReports: (assetId: string) =>
    requestJson(
      `/api/v1/assets/${assetId}/valuations/reports`,
      valuationReportListSchema,
    ),
  valuationSnapshots: (assetId: string) =>
    requestJson(
      `/api/v1/assets/${assetId}/valuations/snapshots`,
      valuationSnapshotListSchema,
    ),
  runValuation: (assetId: string) =>
    requestJson(`/api/v1/assets/${assetId}/valuations/runs`, valuationReportSchema, {
      method: 'POST',
      body: JSON.stringify({ confirmOutboundSummary: true }),
    }),
  confirmValuation: (
    assetId: string,
    reportId: string,
    input: ConfirmValuationInput = {},
  ) =>
    requestJson(
      `/api/v1/assets/${assetId}/valuations/reports/${reportId}/confirm`,
      confirmValuationResultSchema,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),
  valuationSchedule: (assetId: string) =>
    requestJson(`/api/v1/assets/${assetId}/valuations/schedule`, valuationScheduleSchema),
  updateValuationSchedule: (assetId: string, input: UpdateValuationScheduleInput) =>
    requestJson(
      `/api/v1/assets/${assetId}/valuations/schedule`,
      valuationScheduleSchema,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      },
    ),
  subscriptions: () => requestJson('/api/v1/subscriptions', subscriptionListSchema),
  subscription: (id: string) =>
    requestJson(`/api/v1/subscriptions/${id}`, subscriptionDetailSchema),
  createSubscription: (input: CreateSubscriptionInput) =>
    requestJson('/api/v1/subscriptions', subscriptionDetailSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateSubscription: (id: string, input: UpdateSubscriptionInput) =>
    requestJson(`/api/v1/subscriptions/${id}`, subscriptionDetailSchema, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  changeSubscriptionPrice: (id: string, input: CreateSubscriptionPriceChangeInput) =>
    requestJson(`/api/v1/subscriptions/${id}/price-changes`, subscriptionDetailSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  applySubscriptionAction: (id: string, input: SubscriptionActionInput) =>
    requestJson(`/api/v1/subscriptions/${id}/actions`, subscriptionDetailSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  deleteSubscription: async (id: string) => {
    const response = await fetch(`/api/v1/subscriptions/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      const message =
        payload &&
        typeof payload === 'object' &&
        'message' in payload &&
        typeof (payload as { message?: unknown }).message === 'string'
          ? (payload as { message: string }).message
          : '删除失败';
      throw new Error(message);
    }
  },
  addSubscriptionCharge: (id: string, input: CreateSubscriptionChargeInput) =>
    requestJson(`/api/v1/subscriptions/${id}/charges`, subscriptionChargeSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  uploadSubscriptionAttachment: (subscriptionId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return requestJson(
      `/api/v1/subscriptions/${subscriptionId}/attachments`,
      subscriptionAttachmentSchema,
      { method: 'POST', body: formData },
    );
  },
  deleteSubscriptionAttachment: async (subscriptionId: string, attachmentId: string) => {
    const response = await fetch(
      `/api/v1/subscriptions/${subscriptionId}/attachments/${attachmentId}`,
      { method: 'DELETE', credentials: 'include' },
    );
    if (!response.ok) throw new Error('删除附件失败');
  },
  valuationAnalytics: (assetId: string) =>
    requestJson(
      `/api/v1/assets/${assetId}/valuations/analytics`,
      valuationAnalyticsSchema,
    ),
  assets: (filters: Partial<AssetListQuery> = {}) => {
    const search = new URLSearchParams();

    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '') {
        search.set(key, String(value));
      }
    }

    const suffix = search.size > 0 ? `?${search.toString()}` : '';
    return requestJson(`/api/v1/assets${suffix}`, assetListSchema);
  },
  asset: (assetId: string) => requestJson(`/api/v1/assets/${assetId}`, assetDetailSchema),
  recycleBin: () => requestJson('/api/v1/assets/recycle-bin', recycleBinSchema),
  restoreAsset: (assetId: string) =>
    requestJson(`/api/v1/assets/${assetId}/restore`, assetDetailSchema, {
      method: 'POST',
      body: '{}',
    }),
  permanentlyDeleteAsset: (assetId: string, assetName: string) =>
    requestEmpty(`/api/v1/assets/${assetId}/permanent`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmPermanentDelete: true, assetName }),
    }),
  wishlists: (filters: Partial<WishlistListQuery> = {}) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '') search.set(key, String(value));
    }
    const suffix = search.size > 0 ? `?${search.toString()}` : '';
    return requestJson(`/api/v1/wishlist${suffix}`, wishlistItemListSchema);
  },
  wishlist: (itemId: string) =>
    requestJson(`/api/v1/wishlist/${itemId}`, wishlistItemDetailSchema),
  createWishlist: (input: CreateWishlistItemInput) =>
    requestJson('/api/v1/wishlist', wishlistItemDetailSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateWishlist: (itemId: string, input: UpdateWishlistItemInput) =>
    requestJson(`/api/v1/wishlist/${itemId}`, wishlistItemDetailSchema, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  archiveWishlist: (itemId: string) =>
    requestJson(`/api/v1/wishlist/${itemId}`, wishlistItemDetailSchema, {
      method: 'DELETE',
    }),
  addWishlistLink: (itemId: string, input: CreateWishlistLinkInput) =>
    requestJson(`/api/v1/wishlist/${itemId}/links`, wishlistLinkSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  deleteWishlistLink: (itemId: string, linkId: string) =>
    requestJson(`/api/v1/wishlist/${itemId}/links/${linkId}`, wishlistItemDetailSchema, {
      method: 'DELETE',
    }),
  addWishlistPrice: (itemId: string, input: CreateWishlistPriceSnapshotInput) =>
    requestJson(`/api/v1/wishlist/${itemId}/prices`, wishlistPriceSnapshotSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  uploadWishlistImage: (itemId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return requestJson(`/api/v1/wishlist/${itemId}/image`, wishlistImageSchema, {
      method: 'POST',
      body: formData,
    });
  },
  deleteWishlistImage: (itemId: string) =>
    requestEmpty(`/api/v1/wishlist/${itemId}/image`, { method: 'DELETE' }),
  convertWishlist: (itemId: string, input: ConvertWishlistItemInput) =>
    requestJson(`/api/v1/wishlist/${itemId}/convert`, wishlistConversionResultSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  orders: () => requestJson('/api/v1/orders', purchaseOrderListSchema),
  order: (orderId: string) =>
    requestJson(`/api/v1/orders/${orderId}`, purchaseOrderDetailSchema),
  createOrder: (input: CreatePurchaseOrderInput) =>
    requestJson('/api/v1/orders', purchaseOrderDetailSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  reminders: () => requestJson('/api/v1/reminders', reminderListSchema),
  reminder: (reminderId: string) =>
    requestJson(`/api/v1/reminders/${reminderId}`, reminderDetailSchema),
  upcomingReminders: () =>
    requestJson('/api/v1/reminders/upcoming', reminderOccurrenceListSchema),
  createReminder: (input: CreateReminderInput) =>
    requestJson('/api/v1/reminders', reminderDetailSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateReminder: (reminderId: string, input: UpdateReminderInput) =>
    requestJson(`/api/v1/reminders/${reminderId}`, reminderDetailSchema, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  acknowledgeReminder: (occurrenceId: string) =>
    requestJson(
      `/api/v1/reminder-occurrences/${occurrenceId}/acknowledge`,
      reminderOccurrenceSchema,
      { method: 'POST', body: '{}' },
    ),
  dismissReminder: (occurrenceId: string) =>
    requestJson(
      `/api/v1/reminder-occurrences/${occurrenceId}/dismiss`,
      reminderOccurrenceSchema,
      {
        method: 'POST',
        body: '{}',
      },
    ),
  snoozeReminder: (occurrenceId: string, durationMinutes: number) =>
    requestJson(
      `/api/v1/reminder-occurrences/${occurrenceId}/snooze`,
      reminderOccurrenceSchema,
      {
        method: 'POST',
        body: JSON.stringify({ durationMinutes }),
      },
    ),
  notificationChannels: () =>
    requestJson('/api/v1/notification-channels', notificationChannelListSchema),
  testNotificationChannel: (key: string) =>
    requestJson(
      '/api/v1/notification-channels/test',
      testNotificationChannelResultSchema,
      { method: 'POST', body: JSON.stringify({ key }) },
    ),
  createNotificationChannel: (input: CreateNotificationChannelInput) =>
    requestJson('/api/v1/notification-channels', notificationChannelSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateNotificationChannel: (channelId: string, input: UpdateNotificationChannelInput) =>
    requestJson(`/api/v1/notification-channels/${channelId}`, notificationChannelSchema, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteNotificationChannel: (channelId: string) =>
    requestEmpty(`/api/v1/notification-channels/${channelId}`, { method: 'DELETE' }),
  createAsset: (input: CreateAssetInput) =>
    requestJson('/api/v1/assets', assetDetailSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateAsset: (assetId: string, input: UpdateAssetInput) =>
    requestJson(`/api/v1/assets/${assetId}`, assetDetailSchema, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  transitionAsset: (assetId: string, input: TransitionAssetInput) =>
    requestJson(`/api/v1/assets/${assetId}/lifecycle-events`, assetDetailSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  addFinancialEvent: (assetId: string, input: CreateFinancialEventInput) =>
    requestJson(`/api/v1/assets/${assetId}/financial-events`, assetDetailSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  correctFinancialEvent: (
    assetId: string,
    eventId: string,
    input: CorrectFinancialEventInput,
  ) =>
    requestJson(
      `/api/v1/assets/${assetId}/financial-events/${eventId}/correct`,
      assetDetailSchema,
      { method: 'POST', body: JSON.stringify(input) },
    ),
  correctLifecycleEvent: (
    assetId: string,
    eventId: string,
    input: CorrectLifecycleEventInput,
  ) =>
    requestJson(
      `/api/v1/assets/${assetId}/lifecycle-events/${eventId}/correct`,
      assetDetailSchema,
      { method: 'POST', body: JSON.stringify(input) },
    ),
  uploadAttachment: (assetId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return requestJson(`/api/v1/assets/${assetId}/attachments`, assetAttachmentSchema, {
      method: 'POST',
      body: formData,
    });
  },
  updateAttachment: (
    assetId: string,
    attachmentId: string,
    input: UpdateAssetAttachmentInput,
  ) =>
    requestJson(
      `/api/v1/assets/${assetId}/attachments/${attachmentId}`,
      assetAttachmentSchema,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      },
    ),
  deleteAttachment: (assetId: string, attachmentId: string) =>
    requestEmpty(`/api/v1/assets/${assetId}/attachments/${attachmentId}`, {
      method: 'DELETE',
    }),
  addCondition: (assetId: string, input: CreateConditionEventInput) =>
    requestJson(`/api/v1/assets/${assetId}/condition-events`, assetDetailSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  startLoan: (assetId: string, input: CreateLoanInput) =>
    requestJson(`/api/v1/assets/${assetId}/loans`, assetDetailSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  returnLoan: (assetId: string, loanId: string, input: ReturnLoanInput) =>
    requestJson(`/api/v1/assets/${assetId}/loans/${loanId}/return`, assetDetailSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  startRepair: (assetId: string, input: CreateRepairInput) =>
    requestJson(`/api/v1/assets/${assetId}/repairs`, assetDetailSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  completeRepair: (assetId: string, repairId: string, input: CompleteRepairInput) =>
    requestJson(
      `/api/v1/assets/${assetId}/repairs/${repairId}/complete`,
      assetDetailSchema,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),
  deleteAsset: (assetId: string) =>
    requestEmpty(`/api/v1/assets/${assetId}`, { method: 'DELETE' }),
};
