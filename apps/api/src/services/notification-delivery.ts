import { createHmac } from 'node:crypto';

import type { TestNotificationChannelResult } from '@thingcost/contracts';

import type {
  ProviderChannelConfig,
  ResolvedChannel,
  ServerchanChannelConfig,
  PushplusChannelConfig,
  BarkChannelConfig,
  TelegramChannelConfig,
  WebhookChannelConfig,
  WecomChannelConfig,
} from './notification-channels.js';

const TEST_TITLE = '物纪通知测试';
const TEST_TEXT = '这是一条来自物纪的测试通知，说明当前通知渠道可以正常投递。';

type ProviderResponse = {
  status: number;
  body: string;
};

async function requestProvider(
  url: string,
  init: RequestInit,
): Promise<ProviderResponse> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.text();
  if (!response.ok) {
    const excerpt = body.replace(/\s+/gu, ' ').slice(0, 240);
    if (response.status === 400 && body.includes('failed to get device token')) {
      throw new Error(
        'Bark 服务未找到该 Device Key。请确认服务地址与 Device Key 属于同一个 Bark 实例，并先在该实例中注册设备。',
      );
    }
    throw new Error(
      `通知渠道 HTTP ${String(response.status)}${excerpt ? `：${excerpt}` : ''}`,
    );
  }
  return { status: response.status, body };
}

function parseJson(body: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(body);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function sendTelegram(
  configuration: TelegramChannelConfig,
): Promise<ProviderResponse> {
  const result = await requestProvider(
    `https://api.telegram.org/bot${configuration.botToken}/sendMessage`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: configuration.chatId, text: TEST_TEXT }),
    },
  );
  if (parseJson(result.body)?.ok === false) {
    throw new Error('Telegram 拒绝了测试消息');
  }
  return result;
}

async function sendWebhook(
  configuration: WebhookChannelConfig,
): Promise<ProviderResponse> {
  const body = JSON.stringify({
    event: 'chronicle.notification_test',
    title: TEST_TITLE,
    message: TEST_TEXT,
    sentAt: new Date().toISOString(),
  });
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (configuration.secret) {
    headers['x-chronicle-signature'] = `sha256=${createHmac(
      'sha256',
      configuration.secret,
    )
      .update(body)
      .digest('hex')}`;
  }
  return requestProvider(configuration.url, {
    method: 'POST',
    headers,
    body,
  });
}

async function sendWecom(configuration: WecomChannelConfig): Promise<ProviderResponse> {
  const result = await requestProvider(configuration.webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      msgtype: 'text',
      text: { content: `${TEST_TITLE}\n${TEST_TEXT}`.slice(0, 2_048) },
    }),
  });
  const errcode = parseJson(result.body)?.errcode;
  if (typeof errcode === 'number' && errcode !== 0) {
    throw new Error(`企业微信拒绝了测试消息（错误码 ${String(errcode)}）`);
  }
  return result;
}

async function sendPushplus(
  configuration: PushplusChannelConfig,
): Promise<ProviderResponse> {
  const result = await requestProvider('https://www.pushplus.plus/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      token: configuration.token,
      ...(configuration.topic ? { topic: configuration.topic } : {}),
      title: TEST_TITLE,
      content: TEST_TEXT,
      template: 'txt',
    }),
  });
  const code = parseJson(result.body)?.code;
  if (typeof code === 'number' && code !== 200) {
    throw new Error(`PushPlus 拒绝了测试消息（错误码 ${String(code)}）`);
  }
  return result;
}

async function sendBark(configuration: BarkChannelConfig): Promise<ProviderResponse> {
  const result = await requestProvider(
    configuration.serverUrl.replace(/\/+$/u, '') + '/push',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        device_key: configuration.deviceKey,
        title: TEST_TITLE,
        body: TEST_TEXT,
        ...(configuration.group ? { group: configuration.group } : {}),
        ...(configuration.sound ? { sound: configuration.sound } : {}),
      }),
    },
  );
  const code = parseJson(result.body)?.code;
  if (
    (typeof code === 'number' && code !== 200) ||
    (typeof code === 'string' && code !== '200')
  ) {
    const providerMessage = parseJson(result.body)?.message;
    if (
      code === 400 &&
      typeof providerMessage === 'string' &&
      providerMessage.includes('failed to get device token')
    ) {
      throw new Error(
        'Bark 服务未找到该 Device Key。请确认服务地址与 Device Key 属于同一个 Bark 实例，并先在该实例中注册设备。',
      );
    }
    throw new Error(`Bark 拒绝了测试消息（错误码 ${String(code)}）`);
  }
  return result;
}

async function sendServerchan(
  configuration: ServerchanChannelConfig,
): Promise<ProviderResponse> {
  const result = await requestProvider(
    `https://sctapi.ftqq.com/${encodeURIComponent(configuration.sendKey)}.send`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: TEST_TITLE,
        desp: TEST_TEXT,
      }),
    },
  );
  const code = parseJson(result.body)?.code;
  if (typeof code === 'number' && code !== 0) {
    throw new Error(`Server酱拒绝了测试消息（错误码 ${String(code)}）`);
  }
  return result;
}

export async function sendNotificationChannelTest(
  channel: ResolvedChannel,
): Promise<TestNotificationChannelResult> {
  const result =
    channel.provider === 'telegram'
      ? await sendTelegram(channel.configuration as TelegramChannelConfig)
      : channel.provider === 'webhook'
        ? await sendWebhook(channel.configuration as WebhookChannelConfig)
        : channel.provider === 'wecom'
          ? await sendWecom(channel.configuration as WecomChannelConfig)
          : channel.provider === 'serverchan'
            ? await sendServerchan(channel.configuration as ServerchanChannelConfig)
            : channel.provider === 'pushplus'
              ? await sendPushplus(channel.configuration as PushplusChannelConfig)
              : await sendBark(channel.configuration as BarkChannelConfig);

  return {
    success: true,
    provider: channel.provider,
    status: result.status,
    message: '测试消息已发送',
  };
}

export type { ProviderChannelConfig };
