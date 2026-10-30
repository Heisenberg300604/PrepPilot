import express, { Router } from 'express';
import { Webhook } from 'svix';
import type { Db } from '../db.js';
import { AppError } from '../errors.js';

/**
 * Clerk -> PrepPilot user sync. Signature verified with Svix; handlers are idempotent so Clerk's
 * retries and duplicate deliveries are safe. The app does NOT depend on this firing: profiles are
 * also provisioned lazily on first authenticated request.
 */
export function webhooksRouter(db: Db, secret: string | undefined) {
  const r = Router();
  r.post('/clerk', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res) => {
    if (!secret) throw new AppError(503, 'WEBHOOK_NOT_CONFIGURED', 'CLERK_WEBHOOK_SECRET is not set.');
    const headers = {
      'svix-id': String(req.headers['svix-id'] ?? ''),
      'svix-timestamp': String(req.headers['svix-timestamp'] ?? ''),
      'svix-signature': String(req.headers['svix-signature'] ?? ''),
    };
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    let event: { type: string; data: any };
    try {
      new Webhook(secret).verify(raw, headers); // throws on bad signature / stale timestamp
      event = JSON.parse(raw);
    } catch {
      throw new AppError(400, 'INVALID_SIGNATURE', 'Invalid webhook signature.');
    }
    const d = event.data;
    if (event.type === 'user.created' || event.type === 'user.updated') {
      const name = [d.first_name, d.last_name].filter(Boolean).join(' ') || d.username || null;
      // create-or-touch only: never overwrite display name / preferences the user set inside PrepPilot
      await db.userProfile.upsert({
        where: { clerkUserId: d.id },
        create: { clerkUserId: d.id, displayName: name, avatarUrl: d.image_url ?? null },
        update: { avatarUrl: d.image_url ?? null },
      });
    } else if (event.type === 'user.deleted' && d.id) {
      await db.userProfile.deleteMany({ where: { clerkUserId: d.id } });
    }
    res.json({ received: true });
  });
  return r;
}
