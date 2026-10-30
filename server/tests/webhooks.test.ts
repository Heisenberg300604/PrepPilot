import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { Webhook } from 'svix';
import { createApp } from '../src/app.js';
import { cleanupUsers, config, db } from './helpers.js';

const secret = 'whsec_' + Buffer.from('test-secret-test-secret-test-1234').toString('base64');
const app = createApp({ config: { ...config, CLERK_WEBHOOK_SECRET: secret }, db, rateLimits: false, resolveUser: () => null });
cleanupUsers();

const send = (payload: object, opts: { sign?: boolean; id?: string } = {}) => {
  const body = JSON.stringify(payload);
  const id = opts.id ?? 'msg_' + Math.random().toString(36).slice(2);
  const ts = new Date();
  const sig = opts.sign === false ? 'v1,AAAA' : new Webhook(secret).sign(id, ts, body);
  return request(app).post('/api/webhooks/clerk').set('content-type', 'application/json').set('svix-id', id).set('svix-timestamp', String(Math.floor(ts.getTime() / 1000))).set('svix-signature', sig).send(body);
};

describe('Clerk webhooks', () => {
  const clerkId = 'user_wh_' + Math.random().toString(36).slice(2);
  const created = { type: 'user.created', data: { id: clerkId, first_name: 'Asha', last_name: 'Rao', image_url: 'https://img/a.png' } };

  it('rejects unsigned or tampered payloads', async () => {
    expect((await send(created, { sign: false })).status).toBe(400);
    expect((await request(app).post('/api/webhooks/clerk').set('content-type', 'application/json').send(JSON.stringify(created))).status).toBe(400);
    expect(await db.userProfile.findUnique({ where: { clerkUserId: clerkId } })).toBeNull();
  });

  it('creates the profile idempotently and never overwrites locally edited preferences', async () => {
    expect((await send(created)).status).toBe(200);
    expect((await send(created)).status).toBe(200); // duplicate delivery
    expect(await db.userProfile.count({ where: { clerkUserId: clerkId } })).toBe(1);
    await db.userProfile.update({ where: { clerkUserId: clerkId }, data: { displayName: 'Custom Name', dailyStudyTargetMinutes: 45 } });
    await send({ type: 'user.updated', data: { ...created.data, first_name: 'Stale', image_url: 'https://img/b.png' } });
    const p = await db.userProfile.findUniqueOrThrow({ where: { clerkUserId: clerkId } });
    expect(p).toMatchObject({ displayName: 'Custom Name', dailyStudyTargetMinutes: 45, avatarUrl: 'https://img/b.png' });
    await send({ type: 'user.deleted', data: { id: clerkId } });
    expect(await db.userProfile.count({ where: { clerkUserId: clerkId } })).toBe(0);
  });

  it('reports when the secret is not configured', async () => {
    const off = createApp({ config, db, rateLimits: false, resolveUser: () => null });
    expect((await request(off).post('/api/webhooks/clerk').set('content-type', 'application/json').send('{}')).status).toBe(503);
  });
});
