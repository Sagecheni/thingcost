import { createHash, randomBytes } from 'node:crypto';

import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import type {
  ApiTokenScope,
  CreatePersonalAccessTokenInput,
  CreatedPersonalAccessToken,
  PersonalAccessToken,
  PersonalApiSettings,
} from '@thingcost/contracts';
import {
  adminUsers,
  appSettings,
  personalAccessTokens,
  type Database,
} from '@thingcost/database';

export class ApiTokenError extends Error {
  constructor(
    readonly code:
      'TOKENS_DISABLED' | 'TOKEN_NOT_FOUND' | 'INVALID_EXPIRY' | 'SETTINGS_MISSING',
    message: string,
  ) {
    super(message);
    this.name = 'ApiTokenError';
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function mapToken(row: {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}): PersonalAccessToken {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    scopes: row.scopes as ApiTokenScope[],
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getPersonalApiSettings(db: Database): Promise<PersonalApiSettings> {
  const [settings] = await db
    .select({ enabled: appSettings.personalApiTokensEnabled })
    .from(appSettings)
    .limit(1);

  if (!settings) {
    throw new ApiTokenError('SETTINGS_MISSING', '应用尚未初始化');
  }

  return { enabled: settings.enabled };
}

export async function setPersonalApiSettings(
  db: Database,
  enabled: boolean,
): Promise<PersonalApiSettings> {
  const [settings] = await db
    .update(appSettings)
    .set({
      personalApiTokensEnabled: enabled,
      updatedAt: new Date(),
    })
    .where(eq(appSettings.id, 'default'))
    .returning({ enabled: appSettings.personalApiTokensEnabled });

  if (!settings) {
    throw new ApiTokenError('SETTINGS_MISSING', '应用尚未初始化');
  }

  return { enabled: settings.enabled };
}

export async function listPersonalAccessTokens(
  db: Database,
  adminId: string,
): Promise<PersonalAccessToken[]> {
  const rows = await db
    .select()
    .from(personalAccessTokens)
    .where(eq(personalAccessTokens.adminId, adminId))
    .orderBy(desc(personalAccessTokens.createdAt));

  return rows.map(mapToken);
}

export async function createPersonalAccessToken(
  db: Database,
  adminId: string,
  input: CreatePersonalAccessTokenInput,
): Promise<CreatedPersonalAccessToken> {
  const settings = await getPersonalApiSettings(db);
  if (!settings.enabled) {
    throw new ApiTokenError('TOKENS_DISABLED', '个人 API 令牌功能默认关闭，请先启用');
  }

  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    throw new ApiTokenError('INVALID_EXPIRY', '无效的过期时间');
  }
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    throw new ApiTokenError('INVALID_EXPIRY', '过期时间必须晚于当前时间');
  }

  const secret = randomBytes(32).toString('base64url');
  const token = `ct_${secret}`;
  const tokenPrefix = token.slice(0, 10);
  const [row] = await db
    .insert(personalAccessTokens)
    .values({
      adminId,
      name: input.name,
      tokenPrefix,
      tokenHash: hashToken(token),
      scopes: input.scopes,
      expiresAt,
    })
    .returning();

  if (!row) {
    throw new Error('Unable to create personal access token.');
  }

  return {
    ...mapToken(row),
    token,
  };
}

export async function revokePersonalAccessToken(
  db: Database,
  adminId: string,
  tokenId: string,
): Promise<PersonalAccessToken> {
  const [row] = await db
    .update(personalAccessTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(personalAccessTokens.id, tokenId),
        eq(personalAccessTokens.adminId, adminId),
        isNull(personalAccessTokens.revokedAt),
      ),
    )
    .returning();

  if (!row) {
    throw new ApiTokenError('TOKEN_NOT_FOUND', '找不到可撤销的令牌');
  }

  return mapToken(row);
}

export interface TokenIdentity {
  kind: 'token';
  tokenId: string;
  admin: {
    id: string;
    username: string;
  };
  scopes: ApiTokenScope[];
  expiresAt: Date | null;
}

export async function findPersonalAccessToken(
  db: Database,
  rawToken: string,
): Promise<TokenIdentity | null> {
  if (!rawToken.startsWith('ct_') || rawToken.length < 20) {
    return null;
  }

  const [settings] = await db
    .select({ enabled: appSettings.personalApiTokensEnabled })
    .from(appSettings)
    .limit(1);
  if (!settings?.enabled) {
    return null;
  }

  const [row] = await db
    .select({
      tokenId: personalAccessTokens.id,
      adminId: adminUsers.id,
      username: adminUsers.username,
      scopes: personalAccessTokens.scopes,
      expiresAt: personalAccessTokens.expiresAt,
      revokedAt: personalAccessTokens.revokedAt,
    })
    .from(personalAccessTokens)
    .innerJoin(adminUsers, eq(personalAccessTokens.adminId, adminUsers.id))
    .where(eq(personalAccessTokens.tokenHash, hashToken(rawToken)))
    .limit(1);

  if (!row || row.revokedAt) {
    return null;
  }
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  // Best-effort last-used stamp; auth must not fail if the update lags.
  void Promise.resolve(
    db
      .update(personalAccessTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(personalAccessTokens.id, row.tokenId)),
  ).catch(() => undefined);

  return {
    kind: 'token',
    tokenId: row.tokenId,
    admin: {
      id: row.adminId,
      username: row.username,
    },
    scopes: row.scopes as ApiTokenScope[],
    expiresAt: row.expiresAt,
  };
}

export function tokenHasScopes(
  identity: TokenIdentity,
  required: ApiTokenScope[],
): boolean {
  return required.every((scope) => identity.scopes.includes(scope));
}

export async function countActiveTokens(db: Database): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(personalAccessTokens)
    .where(isNull(personalAccessTokens.revokedAt));
  return row?.value ?? 0;
}
