import { createHash, randomBytes } from 'node:crypto';

import { and, eq, gt } from 'drizzle-orm';
import { argon2id, hash, verify } from 'argon2';
import type { FastifyReply, FastifyRequest } from 'fastify';

import type { RuntimeConfig } from '@thingcost/config';
import { adminUsers, sessions, type Database } from '@thingcost/database';

const sessionCookieName = 'chronicle_session';
const sessionLifetimeMilliseconds = 30 * 24 * 60 * 60 * 1_000;

export interface SessionIdentity {
  sessionId: string;
  admin: {
    id: string;
    username: string;
  };
  expiresAt: Date;
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    type: argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
  });
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  return verify(passwordHash, password);
}

export async function createSession(db: Database, adminId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + sessionLifetimeMilliseconds);

  const [session] = await db
    .insert(sessions)
    .values({
      adminId,
      tokenHash: hashSessionToken(token),
      expiresAt,
    })
    .returning({ id: sessions.id });

  if (!session) {
    throw new Error('Unable to create an administrator session.');
  }

  return { token, expiresAt, sessionId: session.id };
}

export async function findSession(
  db: Database,
  request: FastifyRequest,
): Promise<SessionIdentity | null> {
  const token = request.cookies[sessionCookieName];

  if (!token) {
    return null;
  }

  const [row] = await db
    .select({
      sessionId: sessions.id,
      adminId: adminUsers.id,
      username: adminUsers.username,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(adminUsers, eq(sessions.adminId, adminUsers.id))
    .where(
      and(
        eq(sessions.tokenHash, hashSessionToken(token)),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    sessionId: row.sessionId,
    admin: {
      id: row.adminId,
      username: row.username,
    },
    expiresAt: row.expiresAt,
  };
}

export function setSessionCookie(
  reply: FastifyReply,
  config: RuntimeConfig,
  token: string,
  expiresAt: Date,
): void {
  reply.setCookie(sessionCookieName, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE ?? config.NODE_ENV === 'production',
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply, config: RuntimeConfig): void {
  reply.clearCookie(sessionCookieName, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE ?? config.NODE_ENV === 'production',
  });
}

export async function destroySession(db: Database, sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}
