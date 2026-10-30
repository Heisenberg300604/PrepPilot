import { useClerk, useUser } from '@clerk/clerk-react';
import { LogOut, Monitor, Moon, ShieldCheck, Sun, UserCog, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, ErrorState, PageHeader, PageLoading, TextField } from '@/components/ui';
import { clerkAppearance } from '@/features/auth/appearance';
import { useDocumentTitle, useProfile, useUpdateProfile } from '@/lib/hooks';
import { toast } from '@/lib/toast';
import { toApiTheme, useTheme } from '@/lib/theme';
import { initials } from '@/lib/format';
import { validateDisplayName, validateSuggestPercent, validateTarget } from './validation';
import './settings.css';

const THEMES: { value: 'light' | 'dark' | 'system'; label: string; icon: LucideIcon; hint: string }[] = [
  { value: 'light', label: 'Light', icon: Sun, hint: 'Bright and crisp' },
  { value: 'dark', label: 'Dark', icon: Moon, hint: 'Easy on the eyes' },
  { value: 'system', label: 'Match system', icon: Monitor, hint: 'Follows your device' },
];

export default function SettingsPage() {
  useDocumentTitle('Settings');
  const profile = useProfile();
  const update = useUpdateProfile();
  const { user } = useUser();
  const clerk = useClerk();
  const theme = useTheme();

  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [percent, setPercent] = useState('');
  const [errors, setErrors] = useState<{ name?: string; target?: string; percent?: string }>({});

  // Seed the inputs once the saved profile arrives (and again after each successful save).
  const p = profile.data;
  useEffect(() => {
    if (!p) return;
    setName(p.displayName ?? '');
    setTarget(String(p.dailyStudyTargetMinutes));
    setPercent(String(p.completionSuggestPercent));
  }, [p?.displayName, p?.dailyStudyTargetMinutes, p?.completionSuggestPercent]); // eslint-disable-line react-hooks/exhaustive-deps

  if (profile.isError) return <ErrorState error={profile.error} onRetry={() => profile.refetch()} title="Couldn't load your settings" />;
  if (profile.isLoading || !p) return <PageLoading label="Loading settings…" />;

  const nameDirty = name.trim() !== (p.displayName ?? '');
  const studyDirty = target.trim() !== String(p.dailyStudyTargetMinutes) || percent.trim() !== String(p.completionSuggestPercent);

  const saveName = (e: FormEvent) => {
    e.preventDefault();
    const r = validateDisplayName(name);
    setErrors((x) => ({ ...x, name: r.error }));
    if (r.error) return;
    update.mutate({ displayName: r.value }, { onSuccess: () => toast.success('Profile saved') });
  };
  const saveStudy = (e: FormEvent) => {
    e.preventDefault();
    const t = validateTarget(target);
    const c = validateSuggestPercent(percent);
    setErrors((x) => ({ ...x, target: t.error, percent: c.error }));
    if (t.error || c.error) return;
    update.mutate({ dailyStudyTargetMinutes: t.value, completionSuggestPercent: c.value }, { onSuccess: () => toast.success('Study preferences saved') });
  };
  const chooseTheme = (v: 'light' | 'dark' | 'system') => {
    const previous = theme.pref;
    theme.setPref(v); // applies instantly everywhere
    update.mutate({ preferredTheme: toApiTheme(v) }, { onError: () => theme.setPref(previous) });
  };

  return (
    <>
      <PageHeader eyebrow="Account" title="Settings" description="Tune PrepPilot to the way you study." />
      <div className="settings">
        <section className="card settings-card" aria-labelledby="s-profile">
          <h2 id="s-profile">Profile</h2>
          <div className="profile-row">
            {user?.imageUrl || p.avatarUrl ? <img className="avatar" src={user?.imageUrl ?? p.avatarUrl ?? ''} alt="" width={56} height={56} /> : <span className="avatar avatar-fallback" aria-hidden>{initials(p.displayName)}</span>}
            <div className="truncate">
              <strong>{p.displayName ?? 'Unnamed student'}</strong>
              <div className="muted truncate">{user?.primaryEmailAddress?.emailAddress ?? ' '}</div>
            </div>
          </div>
          <form onSubmit={saveName} noValidate className="form-grid">
            <TextField label="Display name" value={name} maxLength={80} error={errors.name} hint="Shown in your greeting. Doesn't change your sign-in details." onChange={(e) => (setName(e.target.value), setErrors((x) => ({ ...x, name: undefined })))} />
            <div className="save-row">
              <Button type="submit" variant="primary" loading={update.isPending && nameDirty} disabled={!nameDirty}>
                Save profile
              </Button>
              {nameDirty && <span className="dirty">Unsaved changes</span>}
            </div>
          </form>
        </section>

        <section className="card settings-card" aria-labelledby="s-study">
          <h2 id="s-study">Study</h2>
          <form onSubmit={saveStudy} noValidate className="form-grid">
            <TextField
              label="Daily study target (minutes)"
              inputMode="numeric"
              value={target}
              error={errors.target}
              hint="Compared with your planned task estimates on the dashboard — not measured study time. 0 to 1440."
              onChange={(e) => (setTarget(e.target.value), setErrors((x) => ({ ...x, target: undefined })))}
            />
            <TextField
              label="Suggest marking complete at (% watched)"
              inputMode="numeric"
              value={percent}
              error={errors.percent}
              hint="The player offers to mark a lecture complete once you pass this point. Use 0 to turn suggestions off."
              onChange={(e) => (setPercent(e.target.value), setErrors((x) => ({ ...x, percent: undefined })))}
            />
            <div className="save-row">
              <Button type="submit" variant="primary" loading={update.isPending && studyDirty} disabled={!studyDirty}>
                Save study preferences
              </Button>
              {studyDirty && <span className="dirty">Unsaved changes</span>}
            </div>
          </form>
        </section>

        <section className="card settings-card" aria-labelledby="s-theme">
          <h2 id="s-theme">Appearance</h2>
          <div role="radiogroup" aria-labelledby="s-theme" className="theme-grid">
            {THEMES.map(({ value, label, icon: Icon, hint }) => (
              <label key={value} className={`theme-card ${theme.pref === value ? 'selected' : ''}`}>
                <input type="radio" name="theme" value={value} checked={theme.pref === value} onChange={() => chooseTheme(value)} />
                <Icon size={20} aria-hidden />
                <b>{label}</b>
                <span>{hint}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="card settings-card" aria-labelledby="s-account">
          <h2 id="s-account">Account & security</h2>
          <p className="muted">Email, password, connected accounts and active sessions are managed securely by Clerk.</p>
          <div className="row row-wrap">
            <Button icon={<UserCog size={16} />} onClick={() => clerk.openUserProfile({ appearance: clerkAppearance })}>
              Manage account
            </Button>
            <Button variant="ghost" icon={<LogOut size={16} />} onClick={() => clerk.signOut({ redirectUrl: '/' })}>
              Sign out
            </Button>
          </div>
        </section>

        <section className="card settings-card" aria-labelledby="s-privacy">
          <h2 id="s-privacy">
            <ShieldCheck size={18} aria-hidden className="inline-icon" /> Data & privacy
          </h2>
          <ul className="privacy-list">
            <li>PrepPilot stores your exams, folders, notes, progress and plans in your private account. Other users can't see them.</li>
            <li>Videos stay on YouTube. PrepPilot only saves official links and metadata, and plays them with YouTube's embedded player — it never downloads or rehosts content.</li>
            <li>Progress is tracked only for lectures you watch inside PrepPilot. It has no access to your YouTube watch history.</li>
          </ul>
        </section>
      </div>
    </>
  );
}

