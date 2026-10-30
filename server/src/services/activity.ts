import type { Db, Tx } from '../db.js';
import type { ActivityType, Prisma } from '../generated/prisma/client.js';

export interface ActivityInput {
  videoId?: string;
  playlistId?: string;
  examId?: string;
  subjectId?: string;
  folderId?: string;
  taskId?: string;
  metadata?: Prisma.InputJsonValue;
}

/** Records only real, meaningful actions. */
export const recordActivity = (db: Db | Tx, userId: string, activityType: ActivityType, data: ActivityInput = {}) =>
  db.studyActivity.create({ data: { userId, activityType, ...data } });
