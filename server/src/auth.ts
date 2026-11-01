import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { clerkMiddleware, getAuth } from '@clerk/express';
import type { Db } from './db.js';
import { Prisma } from './generated/prisma/client.js';
import { unauthorized } from './errors.js';

export type AuthResolver = (req: Request) => string | null;

/** Production resolver: Clerk verifies the session JWT; we only read the verified userId. */
export const clerkResolver: AuthResolver = (req) => {
  const auth = getAuth(req);
  return auth.isAuthenticated ? auth.userId : null;
};

/**
 * Clerk's middleware (verifies the token / populates req.auth). Needs CLERK_SECRET_KEY + publishable key.
 * `authorizedParties` rejects session tokens minted for any other frontend origin (the token's `azp` claim).
 */
export const clerkAuthMiddleware = (authorizedParties: string[]): RequestHandler => clerkMiddleware({ authorizedParties });

export interface RequestUser {
  /** Internal UserProfile.id — the value stored in every `userId` column. */
  id: string;
  clerkUserId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user: RequestUser;
  }
}

/**
 * Requires a verified identity and lazily provisions the local profile, so the app never
 * depends on a webhook having arrived first.
 */
export const requireUser =
  (db: Db, resolve: AuthResolver) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    const clerkUserId = resolve(req);
    if (!clerkUserId) throw unauthorized();
    // Find first, create if missing. A brand-new user's first page load fires several requests at once,
    // so two of them may try to create the row; the loser re-reads instead of failing. Existing
    // preferences are never touched.
    const select = { id: true, clerkUserId: true } as const;
    let profile = await db.userProfile.findUnique({ where: { clerkUserId }, select });
    if (!profile) {
      try {
        profile = await db.userProfile.create({ data: { clerkUserId }, select });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') throw e;
        profile = await db.userProfile.findUniqueOrThrow({ where: { clerkUserId }, select });
      }
    }
    req.user = profile;
    next();
  };
