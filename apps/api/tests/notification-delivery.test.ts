import { afterEach, describe, expect, it, vi } from 'vitest';

import { sendNotificationChannelTest } from '../src/services/notification-delivery.js';
import type { ResolvedChannel } from '../src/services/notification-channels.js';

const channelBase = {
  key: 'test:channel',
  name: '测试渠道',
  enabled: true,
  isDefault: false,
};

function channel(
  provider: ResolvedChannel['provider'],
  configuration: ResolvedChannel['configuration'],
): ResolvedChannel {
  return { ...channelBase, provider, configuration };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('notification channel test delivery', () => {
  it('sends a signed webhook test payload', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('accepted', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendNotificationChannelTest(
      channel('webhook', {
        url: 'https://example.test/chronicle',
        secret: 'test-secret',
      }),
    );

    expect(result).toMatchObject({ success: true, provider: 'webhook', status: 200 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.test/chronicle');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-chronicle-signature']).toMatch(
      /^sha256=/u,
    );
    expect(init.body).toContain('chronicle.notification_test');
  });

  it('sends Telegram, Enterprise WeChat, and Server酱 payloads', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"errcode":0}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"code":0}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      sendNotificationChannelTest(
        channel('telegram', { botToken: 'telegram-token', chatId: 'chat' }),
      ),
    ).resolves.toMatchObject({ provider: 'telegram' });
    await expect(
      sendNotificationChannelTest(
        channel('wecom', { webhookUrl: 'https://wecom.test/hook' }),
      ),
    ).resolves.toMatchObject({ provider: 'wecom' });
    await expect(
      sendNotificationChannelTest(
        channel('serverchan', { sendKey: 'SCT-test-send-key' }),
      ),
    ).resolves.toMatchObject({ provider: 'serverchan' });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).body).toContain('msgtype');
    expect((fetchMock.mock.calls[2]?.[1] as RequestInit).body).toContain('desp');
  });

  it('fails when a provider returns an application-level error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"errcode":93000}', { status: 200 })),
    );

    await expect(
      sendNotificationChannelTest(
        channel('wecom', { webhookUrl: 'https://wecom.test/hook' }),
      ),
    ).rejects.toThrow('企业微信拒绝了测试消息');
  });
});
