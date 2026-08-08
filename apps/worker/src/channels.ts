import type { RuntimeConfig } from '@thingcost/config';
import { decryptSecret } from '@thingcost/config';
import { notificationChannels, type Database } from '@thingcost/database';

export type TelegramChannelConfig = { botToken: string; chatId: string };
export type WebhookChannelConfig = { url: string; secret?: string };
export type WecomChannelConfig = { webhookUrl: string };
export type ServerchanChannelConfig = { sendKey: string };
export type PushplusChannelConfig = { token: string; topic?: string };
export type ProviderChannelConfig =
  | TelegramChannelConfig
  | WebhookChannelConfig
  | WecomChannelConfig
  | ServerchanChannelConfig
  | PushplusChannelConfig;

export interface WorkerChannel {
  key: string;
  provider: 'telegram' | 'webhook' | 'wecom' | 'serverchan' | 'pushplus';
  name: string;
  enabled: boolean;
  isDefault: boolean;
  configuration: ProviderChannelConfig;
}

function databaseContext(id: string): string {
  return `notification-channel:${id}`;
}

export async function resolveWorkerChannels(
  db: Database,
  config: RuntimeConfig,
): Promise<WorkerChannel[]> {
  const channels: WorkerChannel[] = [];
  if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
    channels.push({
      key: 'env:telegram',
      provider: 'telegram',
      name: '环境变量 Telegram',
      enabled: true,
      isDefault: true,
      configuration: {
        botToken: config.TELEGRAM_BOT_TOKEN,
        chatId: config.TELEGRAM_CHAT_ID,
      },
    });
  }
  if (config.REMINDER_WEBHOOK_URL) {
    channels.push({
      key: 'env:webhook',
      provider: 'webhook',
      name: '环境变量 Webhook',
      enabled: true,
      isDefault: true,
      configuration: {
        url: config.REMINDER_WEBHOOK_URL,
        ...(config.REMINDER_WEBHOOK_SECRET
          ? { secret: config.REMINDER_WEBHOOK_SECRET }
          : {}),
      },
    });
  }

  if (!config.APP_MASTER_KEY) return channels;
  const rows = await db.select().from(notificationChannels);
  for (const row of rows) {
    try {
      channels.push({
        key: `db:${row.id}`,
        provider: row.provider,
        name: row.name,
        enabled: row.enabled,
        isDefault: row.isDefault,
        configuration: decryptSecret<ProviderChannelConfig>(
          {
            ciphertext: row.configurationCiphertext,
            iv: row.configurationIv,
            tag: row.configurationTag,
          },
          config.APP_MASTER_KEY,
          databaseContext(row.id),
        ),
      });
    } catch {
      // A rotated or missing master key must not crash the Worker or leak credentials.
    }
  }
  return channels;
}

export function channelsForReminder(
  channels: WorkerChannel[],
  mode: 'default' | 'override' | 'none',
  keys: string[],
): WorkerChannel[] {
  if (mode === 'none') return [];
  if (mode === 'override') {
    const requested = new Set(keys);
    return channels.filter((channel) => requested.has(channel.key) && channel.enabled);
  }
  return channels.filter((channel) => channel.isDefault && channel.enabled);
}
