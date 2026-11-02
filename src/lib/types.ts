// Mirrors the JSON returned by the Express API (see server/src/routes/*). Dates are ISO strings.

export type ProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
export type ExamStatus = 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
export type ThemePref = 'LIGHT' | 'DARK' | 'SYSTEM';
export type Availability = 'AVAILABLE' | 'UNAVAILABLE' | 'PRIVATE' | 'REMOVED' | 'UNKNOWN';

export interface Stats {
  total: number;
  completed: number;
  inProgress: number;
  remaining: number;
  percent: number;
}

export interface Profile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  preferredTheme: ThemePref;
  dailyStudyTargetMinutes: number;
  completionSuggestPercent: number;
  onboardingCompleted: boolean;
  createdAt: string;
}

export interface Exam {
  id: string;
  name: string;
  description: string | null;
  examDate: string | null; // YYYY-MM-DD
  status: ExamStatus;
  color: string | null;
  icon: string | null;
  displayOrder: number;
  subjectCount: number;
  stats: Stats;
  createdAt: string;
  updatedAt: string;
}

export interface Subject {
  id: string;
  examId: string;
  examName?: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  displayOrder: number;
  archived: boolean;
  folderCount: number;
  stats: Stats;
}

export interface ExamDetail extends Exam {
  subjects: Subject[];
  /** What deleting the exam would remove (videos/playlists themselves are kept). */
  impact: { subjects: number; folders: number; playlistPlacements: number; videoPlacements: number };
}

export interface Folder {
  id: string;
  subjectId: string;
  parentFolderId: string | null;
  name: string;
  description: string | null;
  displayOrder: number;
  childFolderCount: number;
  stats: Stats;
}

export interface LocationLabel {
  examId: string;
  examName: string;
  subjectId: string;
  subjectName: string;
  folderId: string | null;
  folderPath: string[];
}

export interface Playlist {
  id: string;
  youtubePlaylistId: string | null;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  channelTitle: string | null;
  lastSyncedAt: string | null;
  isCustomized: boolean;
  createdAt: string;
  stats: Stats;
  placementId?: string;
  location?: LocationLabel | null;
}

export interface Video {
  id: string;
  youtubeVideoId: string | null;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  channelTitle: string | null;
  durationSeconds: number | null;
  availabilityStatus: Availability;
  isCustomized: boolean;
  createdAt: string;
  status: ProgressStatus;
  lastPositionSeconds: number;
  lastStudiedAt: string | null;
  completedAt: string | null;
  favorite: boolean;
  placementId?: string;
  position?: number;
  removedFromSource?: boolean;
  location?: LocationLabel | null;
  playlist?: { id: string; title: string } | null;
  metadataSource?: 'youtube' | 'manual';
}

export interface Placement extends Partial<LocationLabel> {
  id: string;
}

export interface ExcludedVideo {
  youtubeVideoId: string;
  title: string;
  thumbnailUrl: string | null;
  removedAt: string;
}

export interface PlaylistDetail extends Playlist {
  isLocal: boolean;
  /** Videos removed from this playlist; sync will not re-add them until restored. */
  excludedVideos: ExcludedVideo[];
  placements: Placement[];
  videos: Video[];
}

export interface VideoDetail extends Video {
  note: string;
  noteUpdatedAt: string | null;
  placements: Placement[];
  playlists: { id: string; title: string; position: number; removedFromSource: boolean; location: LocationLabel | null }[];
  context: null | {
    playlist: { id: string; title: string };
    index: number;
    total: number;
    previous: { id: string; title: string; thumbnailUrl: string | null } | null;
    next: { id: string; title: string; thumbnailUrl: string | null } | null;
    location: LocationLabel | null;
  };
}

export interface SubjectContents {
  subject: Subject;
  exam: { id: string; name: string };
  folder: { id: string; name: string; description: string | null; parentFolderId: string | null } | null;
  breadcrumb: { id: string; name: string }[];
  folders: Folder[];
  playlists: Playlist[];
  videos: Video[];
}

export interface PlaylistPreview {
  playlist: { youtubePlaylistId: string; title: string; description: string | null; thumbnailUrl: string | null; channelTitle: string | null };
  truncated: boolean;
  videoCount: number;
  unavailableCount: number;
  alreadyImportedPlaylistId: string | null;
  alreadyKnownVideoCount: number;
  /** YouTube ids the user previously removed from this playlist (pre-unchecked in the picker). */
  excludedVideoIds: string[];
  /** YouTube ids already elsewhere in the library (pre-unchecked so lectures aren't duplicated). */
  duplicateVideoIds: string[];
  videos: { youtubeVideoId: string; title: string; thumbnailUrl: string | null; durationSeconds: number | null; availability: Availability; position: number }[];
}

export interface ImportResult {
  playlist: Playlist;
  createdVideos: number;
  reusedVideos: number;
  addedItems: number;
  alreadyPlaced: boolean;
  skippedVideos: number;
  removedFromPlaylist: number;
  truncated: boolean;
}

export interface SyncResult {
  playlist: Playlist;
  newVideos: number;
  addedItems: number;
  removedFromSource: number;
  /** New videos left out because they're already elsewhere in the library (stored as exclusions). */
  skippedDuplicates: number;
  truncated: boolean;
}

export interface StudyTask {
  id: string;
  title: string;
  description: string | null;
  scheduledDate: string; // YYYY-MM-DD
  estimatedDurationMinutes: number;
  status: 'TODO' | 'DONE';
  completedAt: string | null;
  exam: { id: string; name: string } | null;
  subject: { id: string; name: string } | null;
  folder: { id: string; name: string } | null;
  video: { id: string; title: string; thumbnailUrl: string | null } | null;
  playlist: { id: string; title: string } | null;
}

export interface TaskInput {
  title: string;
  description?: string | null;
  scheduledDate: string;
  estimatedDurationMinutes: number;
  examId?: string | null;
  subjectId?: string | null;
  folderId?: string | null;
  videoId?: string | null;
  playlistId?: string | null;
}

export interface Dashboard {
  displayName: string | null;
  dailyStudyTargetMinutes: number;
  overview: {
    activeExams: number;
    totalVideos: number;
    completedVideos: number;
    remainingVideos: number;
    percent: number;
    todayTasks: number;
    todayTasksDone: number;
  };
  exams: Exam[];
  continueStudying: Video[];
  today: {
    date: string;
    tasks: StudyTask[];
    plannedMinutes: number;
    completedPlannedMinutes: number;
    targetMinutes: number;
    targetPercent: number;
    overdueCount: number;
    upcomingCount: number;
  };
}

export interface Activity {
  id: string;
  type: 'VIDEO_OPENED' | 'VIDEO_COMPLETED' | 'PLAYLIST_IMPORTED' | 'PLAYLIST_SYNCED' | 'TASK_COMPLETED' | 'FOLDER_CREATED' | 'EXAM_CREATED' | 'MOCK_ATTEMPTED';
  createdAt: string;
  video: { id: string; title: string } | null;
  playlist: { id: string; title: string } | null;
  metadata?: Record<string, unknown> | null;
}

export interface SearchResults {
  exams: { id: string; name: string; status: ExamStatus }[];
  subjects: { id: string; name: string; exam: { id: string; name: string } }[];
  folders: { id: string; name: string; subjectId: string; subject: { name: string } }[];
  playlists: { id: string; title: string; thumbnailUrl: string | null }[];
  videos: { id: string; title: string; thumbnailUrl: string | null }[];
}

export interface VideoList {
  total: number;
  items: Video[];
}

/** A place in the hierarchy where content can be attached. folderId null = directly on the subject. */
export interface Destination {
  subjectId: string;
  folderId: string | null;
}

export type LinkCategory = 'OFFICIAL' | 'SYLLABUS' | 'PYQ' | 'NOTES' | 'OTHER';
export type MockTestType = 'FULL' | 'SECTIONAL' | 'PYQ';

export interface ExamLink {
  id: string;
  examId: string;
  title: string;
  url: string;
  category: LinkCategory;
  pinned: boolean;
  displayOrder: number;
  createdAt: string;
}

export interface MockAttempt {
  id: string;
  mockTestId: string;
  score: number;
  maxScore: number;
  correct: number | null;
  wrong: number | null;
  skipped: number | null;
  timeMinutes: number | null;
  reflection: string | null;
  /** Calendar date, YYYY-MM-DD. */
  attemptedOn: string;
  createdAt: string;
}

export interface MockTest {
  id: string;
  examId: string;
  title: string;
  url: string;
  testType: MockTestType;
  maxScore: number;
  durationMinutes: number | null;
  /** Marks per correct / wrong answer (wrong is ≤ 0). Both set → the score can be calculated from counts. */
  marksCorrect: number | null;
  marksWrong: number | null;
  displayOrder: number;
  createdAt: string;
  /** Oldest first. */
  attempts: MockAttempt[];
}

export interface ExamResources {
  links: ExamLink[];
  tests: MockTest[];
}
