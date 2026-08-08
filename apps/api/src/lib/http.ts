import type { FastifyReply, FastifyRequest } from 'fastify';

import type { RuntimeConfig } from '@thingcost/config';
import type { ApiTokenScope } from '@thingcost/contracts';
import type { Database } from '@thingcost/database';

import {
  findPersonalAccessToken,
  tokenHasScopes,
  type TokenIdentity,
} from '../services/api-tokens.js';
import { findSession, type SessionIdentity } from '../services/session.js';

export type AuthIdentity =
  (SessionIdentity & { kind: 'session'; scopes: null }) | TokenIdentity;

export function sendApiError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
): FastifyReply {
  return reply.code(statusCode).send({ code, message });
}

function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/iu.exec(header.trim());
  return match?.[1]?.trim() || null;
}

export async function requireSession(
  db: Database,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<SessionIdentity | null> {
  const session = await findSession(db, request);

  if (!session) {
    sendApiError(reply, 401, 'AUTHENTICATION_REQUIRED', '请先登录');
    return null;
  }

  return session;
}

export async function requireAuth(
  db: Database,
  request: FastifyRequest,
  reply: FastifyReply,
  options: {
    scopes?: ApiTokenScope[];
    anyOfScopes?: ApiTokenScope[];
    sessionOnly?: boolean;
  } = {},
): Promise<AuthIdentity | null> {
  const session = await findSession(db, request);
  if (session) {
    return { ...session, kind: 'session', scopes: null };
  }

  if (options.sessionOnly) {
    sendApiError(reply, 401, 'AUTHENTICATION_REQUIRED', '请先登录');
    return null;
  }

  const rawToken = bearerToken(request);
  if (!rawToken) {
    sendApiError(reply, 401, 'AUTHENTICATION_REQUIRED', '请先登录或提供访问令牌');
    return null;
  }

  const token = await findPersonalAccessToken(db, rawToken);
  if (!token) {
    sendApiError(reply, 401, 'INVALID_ACCESS_TOKEN', '访问令牌无效、已过期或功能未启用');
    return null;
  }

  const required = options.scopes ?? [];
  if (required.length > 0 && !tokenHasScopes(token, required)) {
    sendApiError(reply, 403, 'INSUFFICIENT_SCOPE', '访问令牌权限不足');
    return null;
  }

  const anyOf = options.anyOfScopes ?? [];
  if (anyOf.length > 0 && !anyOf.some((scope) => token.scopes.includes(scope))) {
    sendApiError(reply, 403, 'INSUFFICIENT_SCOPE', '访问令牌权限不足');
    return null;
  }

  return token;
}

export function isRequestOriginAllowed(
  request: FastifyRequest,
  config: RuntimeConfig,
): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    return true;
  }

  if (request.headers['sec-fetch-site'] === 'cross-site') {
    return false;
  }

  if (!config.APP_ORIGIN) {
    return true;
  }

  const origin = request.headers.origin;
  return !origin || origin === new URL(config.APP_ORIGIN).origin;
}
