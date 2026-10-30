import { CalendarPlus, FolderPlus, GraduationCap, Layers, ListVideo, Video } from 'lucide-react';
import { useDialogs } from '@/lib/dialogs';
import { useMeta } from '@/lib/hooks';
import { toast } from '@/lib/toast';

/** Every button opens a real dialog. Import explains itself when the YouTube API key is missing. */
export function QuickActions({ today }: { today: string }) {
  const dialogs = useDialogs();
  const meta = useMeta();
  const importDisabled = meta.data?.features.youtubeImport === false;
  const actions = [
    { label: 'Create exam', icon: GraduationCap, run: () => dialogs.open({ kind: 'exam' }) },
    { label: 'Add subject', icon: Layers, run: () => dialogs.open({ kind: 'subject' }) },
    { label: 'Create folder', icon: FolderPlus, run: () => dialogs.open({ kind: 'folder' }) },
    {
      label: 'Import playlist',
      icon: ListVideo,
      hint: importDisabled ? 'Needs YouTube API key' : undefined,
      run: () =>
        importDisabled
          ? toast.info('Playlist import needs a YouTube API key on the server (YOUTUBE_API_KEY). You can still add videos one by one.', {
              label: 'Add a video',
              onClick: () => dialogs.open({ kind: 'video' }),
            })
          : dialogs.open({ kind: 'import' }),
    },
    { label: 'Add video', icon: Video, run: () => dialogs.open({ kind: 'video' }) },
    { label: 'Plan study session', icon: CalendarPlus, run: () => dialogs.open({ kind: 'task', defaultDate: today }) },
  ];
  return (
    <section aria-label="Quick actions" className="quick-actions">
      {actions.map(({ label, icon: Icon, run, hint }) => (
        <button key={label} type="button" className="quick-action" onClick={run}>
          <span className="quick-icon">
            <Icon size={18} aria-hidden />
          </span>
          <span className="quick-label">{label}</span>
          {hint && <span className="quick-hint">{hint}</span>}
        </button>
      ))}
    </section>
  );
}
