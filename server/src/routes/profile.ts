import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import { ok } from '../http.js';

export interface ClerkIdentity {
  displayName: string | null;
  avatarUrl: string | null;
}
export type IdentityLookup = (clerkUserId: string) => Promise<ClerkIdentity | null>;

const serialize = (p: any) => ({
  id: p.id,
  displayName: p.displayName,
  avatarUrl: p.avatarUrl,
  preferredTheme: p.preferredTheme,
  dailyStudyTargetMinutes: p.dailyStudyTargetMinutes,
  completionSuggestPercent: p.completionSuggestPercent,
  onboardingCompleted: Boolean(p.onboardingCompletedAt),
  createdAt: p.createdAt,
});

export function profileRouter(db: Db, lookupIdentity?: IdentityLookup) {
  const r = Router();

  r.get('/', async (req, res) => {
    let profile = await db.userProfile.findUniqueOrThrow({ where: { id: req.user.id } });
    // First load only: seed name/avatar from Clerk. Afterwards locally edited values always win.
    if (!profile.displayName && !profile.avatarUrl && lookupIdentity) {
      const identity = await lookupIdentity(profile.clerkUserId).catch(() => null);
      if (identity) profile = await db.userProfile.update({ where: { id: profile.id }, data: identity });
    }
    ok(res, serialize(profile));
  });

  r.patch('/', async (req, res) => {
    const body = z
      .object({
        displayName: z.string().trim().min(1).max(80).optional(),
        preferredTheme: z.enum(['LIGHT', 'DARK', 'SYSTEM']).optional(),
        dailyStudyTargetMinutes: z.number().int().min(0).max(1440).optional(),
        completionSuggestPercent: z.number().int().min(0).max(100).optional(),
        onboardingCompleted: z.boolean().optional(),
      })
      .parse(req.body);
    const { onboardingCompleted, ...rest } = body;
    const profile = await db.userProfile.update({
      where: { id: req.user.id },
      data: { ...rest, ...(onboardingCompleted !== undefined && { onboardingCompletedAt: onboardingCompleted ? new Date() : null }) },
    });
    ok(res, serialize(profile));
  });

  return r;
}
