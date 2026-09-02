import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import {
  type CreateNotificationChannelInput,
  type NotificationChannel,
  type UpdateNotificationChannelInput,
} from '@thingcost/contracts';
import { decryptSecret, encryptSecret, type RuntimeConfig } from '@thingcost/config';
import { notificationChannels, type Database } from '@thingcost/database';

export type TelegramChannelConfig = { botToken: string; chatId: string };
export type WebhookChannelConfig = { url: string; secret?: string };
export type WecomChannelConfig = { webhookUrl: string };
export type ServerchanChannelConfig = { sendKey: string };
export type PushplusChannelConfig = { token: string; topic?: string };
export type BarkChannelConfig = {
  serverUrl: string;
  deviceKey: string;
  group?: string;
  sound?: string;
};
export type ProviderChannelConfig =
  | TelegramChannelConfig
  | WebhookChannelConfig
  | WecomChannelConfig
  | ServerchanChannelConfig
  | PushplusChannelConfig
  | BarkChannelConfig;

export interface ResolvedChannel {
  key: string;
  provider: 'telegram' | 'webhook' | 'wecom' | 'serverchan' | 'pushplus' | 'bark';
  name: string;
  enabled: boolean;
  isDefault: boolean;
  configuration: ProviderChannelConfig;
}

const contextForChannel = (id: string) => `notification-channel:${id}`;

function summaryForConfiguration(
  provider: ResolvedChannel['provider'],
  configuration: ProviderChannelConfig,
): string {
  if (provider === 'telegram') {
    const chatId = (configuration as TelegramChannelConfig).chatId;
    return `Telegram · ${chatId.length > 8 ? `…${chatId.slice(-8)}` : chatId}`;
  }
  if (provider === 'wecom') {
    const url = new URL((configuration as WecomChannelConfig).webhookUrl);
    return `企业微信 · ${url.host}`;
  }
  if (provider === 'serverchan') {
    const key = (configuration as ServerchanChannelConfig).sendKey;
    return `Server酱 · …${key.slice(-4)}`;
  }
  if (provider === 'pushplus') {
    const pushplus = configuration as PushplusChannelConfig;
    return `PushPlus · …${pushplus.token.slice(-4)}${pushplus.topic ? ` · ${pushplus.topic}` : ''}`;
  }
  if (provider === 'bark') {
    const bark = configuration as BarkChannelConfig;
    const url = new URL(bark.serverUrl);
    return `Bark · ${url.host} · …${bark.deviceKey.slice(-4)}${bark.group ? ` · ${bark.group}` : ''}`;
  }
  const url = new URL((configuration as WebhookChannelConfig).url);
  return `Webhook · ${url.origin}${url.pathname}`;
}

function mapEnvironmentChannels(config: RuntimeConfig): ResolvedChannel[] {
  const channels: ResolvedChannel[] = [];
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
  return channels;
}

async function mapDatabaseChannels(
  db: Database,
  config: RuntimeConfig,
): Promise<ResolvedChannel[]> {
  const rows = await db.select().from(notificationChannels);
  return rows.flatMap((row) => {
    if (!config.APP_MASTER_KEY) return [];
    try {
      const configuration = decryptSecret<ProviderChannelConfig>(
        {
          ciphertext: row.configurationCiphertext,
          iv: row.configurationIv,
          tag: row.configurationTag,
        },
        config.APP_MASTER_KEY,
        contextForChannel(row.id),
      );
      return [
        {
          key: `db:${row.id}`,
          provider: row.provider,
          name: row.name,
          enabled: row.enabled,
          isDefault: row.isDefault,
          configuration,
        },
      ];
    } catch {
      return [];
    }
  });
}

export async function resolveNotificationChannels(
  db: Database,
  config: RuntimeConfig,
): Promise<ResolvedChannel[]> {
  return [...mapEnvironmentChannels(config), ...(await mapDatabaseChannels(db, config))];
}

export async function resolveChannel(
  db: Database,
  config: RuntimeConfig,
  key: string,
): Promise<ResolvedChannel | null> {
  return (
    (await resolveNotificationChannels(db, config)).find(
      (channel) => channel.key === key,
    ) ?? null
  );
}

export async function listNotificationChannels(
  db: Database,
  config: RuntimeConfig,
): Promise<NotificationChannel[]> {
  const channels = await resolveNotificationChannels(db, config);
  const rows = await db.select().from(notificationChannels);
  const createdAtByKey = new Map(rows.map((row) => [`db:${row.id}`, row.createdAt]));
  return channels.map((channel) => ({
    key: channel.key,
    id: channel.key.startsWith('db:') ? channel.key.slice(3) : null,
    provider: channel.provider,
    source: channel.key.startsWith('db:') ? 'database' : 'environment',
    name: channel.name,
    enabled: channel.enabled,
    isDefault: channel.isDefault,
    configurationSummary: summaryForConfiguration(
      channel.provider,
      channel.configuration,
    ),
    editable: channel.key.startsWith('db:'),
    createdAt: createdAtByKey.get(channel.key)?.toISOString() ?? null,
  }));
}

export async function createNotificationChannel(
  db: Database,
  config: RuntimeConfig,
  input: CreateNotificationChannelInput,
): Promise<NotificationChannel> {
  if (!config.APP_MASTER_KEY) {
    throw new Error('APP_MASTER_KEY_REQUIRED');
  }
  const id = randomUUID();
  const configuration =
    input.provider === 'telegram'
      ? { botToken: input.botToken, chatId: input.chatId }
      : input.provider === 'wecom'
        ? { webhookUrl: input.webhookUrl }
        : input.provider === 'serverchan'
          ? { sendKey: input.sendKey }
          : input.provider === 'pushplus'
            ? { token: input.token, ...(input.topic ? { topic: input.topic } : {}) }
            : input.provider === 'bark'
              ? {
                  serverUrl: input.serverUrl.replace(/\/+$/u, ''),
                  deviceKey: input.deviceKey,
                  ...(input.group ? { group: input.group } : {}),
                  ...(input.sound ? { sound: input.sound } : {}),
                }
              : { url: input.url, ...(input.secret ? { secret: input.secret } : {}) };
  const encrypted = encryptSecret(
    configuration,
    config.APP_MASTER_KEY,
    contextForChannel(id),
  );
  const createdAt = new Date();

  await db.transaction(async (transaction) => {
    if (input.isDefault) {
      await transaction
        .update(notificationChannels)
        .set({ isDefault: false, updatedAt: createdAt });
    }
    await transaction.insert(notificationChannels).values({
      id,
      provider: input.provider,
      name: input.name,
      enabled: input.enabled,
      isDefault: input.isDefault,
      configurationCiphertext: encrypted.ciphertext,
      configurationIv: encrypted.iv,
      configurationTag: encrypted.tag,
      createdAt,
      updatedAt: createdAt,
    });
  });

  const created = (await listNotificationChannels(db, config)).find(
    (channel) => channel.key === `db:${id}`,
  );
  if (!created) throw new Error('Created notification channel could not be loaded.');
  return created;
}

export async function updateNotificationChannel(
  db: Database,
  config: RuntimeConfig,
  id: string,
  input: UpdateNotificationChannelInput,
): Promise<NotificationChannel | null> {
  if (!config.APP_MASTER_KEY) throw new Error('APP_MASTER_KEY_REQUIRED');
  const [row] = await db
    .select()
    .from(notificationChannels)
    .where(eq(notificationChannels.id, id));
  if (!row) return null;
  const oldConfiguration = decryptSecret<ProviderChannelConfig>(
    {
      ciphertext: row.configurationCiphertext,
      iv: row.configurationIv,
      tag: row.configurationTag,
    },
    config.APP_MASTER_KEY,
    contextForChannel(id),
  );
  const configuration =
    row.provider === 'telegram'
      ? {
          botToken:
            input.botToken ?? (oldConfiguration as TelegramChannelConfig).botToken,
          chatId: input.chatId ?? (oldConfiguration as TelegramChannelConfig).chatId,
        }
      : row.provider === 'wecom'
        ? {
            webhookUrl:
              input.webhookUrl ?? (oldConfiguration as WecomChannelConfig).webhookUrl,
          }
        : row.provider === 'serverchan'
          ? {
              sendKey:
                input.sendKey ?? (oldConfiguration as ServerchanChannelConfig).sendKey,
            }
          : row.provider === 'pushplus'
            ? {
                token: input.token ?? (oldConfiguration as PushplusChannelConfig).token,
                ...((input.topic ?? (oldConfiguration as PushplusChannelConfig).topic)
                  ? {
                      topic:
                        input.topic ?? (oldConfiguration as PushplusChannelConfig).topic,
                    }
                  : {}),
              }
            : row.provider === 'bark'
              ? {
                  serverUrl: (
                    input.serverUrl ?? (oldConfiguration as BarkChannelConfig).serverUrl
                  ).replace(/\/+$/u, ''),
                  deviceKey:
                    input.deviceKey ?? (oldConfiguration as BarkChannelConfig).deviceKey,
                  ...((input.group ?? (oldConfiguration as BarkChannelConfig).group)
                    ? {
                        group:
                          input.group ?? (oldConfiguration as BarkChannelConfig).group,
                      }
                    : {}),
                  ...((input.sound ?? (oldConfiguration as BarkChannelConfig).sound)
                    ? {
                        sound:
                          input.sound ?? (oldConfiguration as BarkChannelConfig).sound,
                      }
                    : {}),
                }
              : {
                  url: input.url ?? (oldConfiguration as WebhookChannelConfig).url,
                  ...(input.secret !== undefined
                    ? input.secret
                      ? { secret: input.secret }
                      : {}
                    : (oldConfiguration as WebhookChannelConfig).secret
                      ? { secret: (oldConfiguration as WebhookChannelConfig).secret }
                      : {}),
                };
  const encrypted = encryptSecret(
    configuration,
    config.APP_MASTER_KEY,
    contextForChannel(id),
  );
  const updatedAt = new Date();

  await db.transaction(async (transaction) => {
    if (input.isDefault === true) {
      await transaction
        .update(notificationChannels)
        .set({ isDefault: false, updatedAt })
        .where(eq(notificationChannels.id, id));
    }
    await transaction
      .update(notificationChannels)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }),
        configurationCiphertext: encrypted.ciphertext,
        configurationIv: encrypted.iv,
        configurationTag: encrypted.tag,
        updatedAt,
      })
      .where(eq(notificationChannels.id, id));
  });

  return (
    (await listNotificationChannels(db, config)).find(
      (channel) => channel.key === `db:${id}`,
    ) ?? null
  );
}
