import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, ExternalLink, Loader2, PlayCircle, RotateCcw, Star, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Button, ErrorState, PageLoading, StatusBadge } from '@/components/ui';
import { usePlaylist } from '@/features/playlists/queries';
import { watchUrl } from '@/features/playlists/helpers';
import { useOpenVideo, useSetProgress, useToggleFavorite, useVideo } from '@/features/videos/queries';
import { keys } from '@/lib/api';
import { formatDuration, locationText } from '@/lib/format';
import { useDocumentTitle, useProfile } from '@/lib/hooks';
import type { VideoDetail } from '@/lib/types';
import { useAutosaveNote } from './useAutosaveNote';
import { usePositionSaving } from './usePositionSaving';
import { useYouTubePlayer } from './useYouTubePlayer';
import './study.css';

function Notes({ video }: { video: VideoDetail }) {
  const { content, change, state, retry } = useAutosaveNote(video.id, video.note);
  return (
    <section className="card notes-card" aria-labelledby="notes-h">
      <div className="notes-head">
        <h2 id="notes-h" style={{ fontSize: 16 }}>My notes</h2>
        <span className={`note-state ${state === 'error' ? 'error' : ''}`} role="status" aria-live="polite">
          {state === 'saving' && <><Loader2 size={13} className="spin" aria-hidden /> Saving…</>}
          {state === 'saved' && 'Saved'}
          {state === 'dirty' && 'Unsaved changes…'}
          {state === 'error' && (
            <>
              <AlertTriangle size={13} aria-hidden /> Couldn't save —{' '}
              <button className="btn btn-ghost btn-sm" onClick={() => void retry()}>Retry</button>
            </>
          )}
        </span>
      </div>
      <label className="sr-only" htmlFor="notes-area">Notes for {video.title}</label>
      <textarea id="notes-area" className="input textarea" value={content} onChange={(e) => change(e.target.value)} placeholder="Key ideas, formulas, questions to revisit…" maxLength={50000} />
    </section>
  );
}

function Queue({ playlistId, currentId }: { playlistId: string; currentId: string }) {
  const q = usePlaylist(playlistId);
  const items = (q.data?.videos ?? []).filter((v) => !v.removedFromSource);
  if (!q.data) return null;
  return (
    <section className="card" aria-labelledby="queue-h">
      <h2 id="queue-h" style={{ fontSize: 16, marginBottom: 8 }}>In this playlist</h2>
      <ol className="queue">
        {items.map((v) => (
          <li key={v.id}>
            <Link to={watchUrl(v.id, playlistId)} aria-current={v.id === currentId ? 'true' : undefined}>
              {v.status === 'COMPLETED' ? <CheckCircle2 size={16} className="done" aria-label="Completed" /> : v.status === 'IN_PROGRESS' ? <CircleDashed size={16} aria-label="In progress" /> : <PlayCircle size={16} aria-label="Not started" />}
              <span className="truncate">{v.title}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StudyView({ video, playlistParam }: { video: VideoDetail; playlistParam: string | null }) {
  const profile = useProfile();
  const progress = useSetProgress();
  const favorite = useToggleFavorite();
  const player = useYouTubePlayer(video.youtubeVideoId);
  const saving = usePositionSaving(video.id, player.state, player.timeRef, player.getTime);
  const [dismissedSuggest, setDismissedSuggest] = useState(false);
  const [resumed, setResumed] = useState(false);
  const ctx = video.context;
  const playlistId = ctx?.playlist.id ?? playlistParam;
  const done = video.status === 'COMPLETED';

  const threshold = profile.data?.completionSuggestPercent ?? 90;
  const pct = player.duration > 0 ? (player.time / player.duration) * 100 : 0;
  const suggestComplete = !done && !dismissedSuggest && threshold > 0 && player.duration > 0 && pct >= threshold;
  const canResume = !resumed && video.lastPositionSeconds > 10 && player.time < video.lastPositionSeconds && !player.problem && player.state !== 'loading';

  const first = video.placements[0];
  const backTo = ctx ? `/playlists/${ctx.playlist.id}` : first?.subjectId ? `/subjects/${first.subjectId}${first.folderId ? `?folder=${first.folderId}` : ''}` : '/library';
  const backLabel = ctx ? 'Back to playlist' : first ? 'Back to folder' : 'Back to library';
  const location = ctx?.location ?? (first && first.examName ? (first as any) : null);

  const playable = Boolean(video.youtubeVideoId) && !player.problem;
  const blocked = !video.youtubeVideoId ? { message: 'This resource has no YouTube video attached, so it cannot be played here.' } : player.problem;

  return (
    <div className="study">
      <div className="study-main">
        <Link to={backTo} className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }}>
          <ArrowLeft size={16} aria-hidden /> {backLabel}
        </Link>

        {playable ? (
          <div className="player-frame" aria-label="Video player">
            <div ref={player.hostRef} />
          </div>
        ) : (
          <div className="player-problem" role="alert">
            <AlertTriangle size={26} aria-hidden />
            <h2>This video can't be played here</h2>
            <p>{blocked?.message}</p>
            {video.sourceUrl && (
              <a className="btn btn-primary" href={video.sourceUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={16} aria-hidden /> Open on YouTube
              </a>
            )}
            <p className="muted" style={{ fontSize: 13 }}>You can still mark it complete and keep notes. Progress is only tracked for playback inside PrepPilot.</p>
          </div>
        )}

        {canResume && (
          <div className="study-prompt">
            <span>You stopped at {formatDuration(video.lastPositionSeconds)} last time.</span>
            <span className="spacer" />
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                player.seekTo(video.lastPositionSeconds);
                player.play();
                setResumed(true);
              }}
            >
              Resume from {formatDuration(video.lastPositionSeconds)}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setResumed(true)}>Start over</Button>
          </div>
        )}
        {suggestComplete && (
          <div className="study-prompt" role="status">
            <span>You've watched {Math.floor(pct)}% — mark this lecture complete?</span>
            <span className="spacer" />
            <Button variant="primary" size="sm" onClick={() => progress.mutate({ id: video.id, status: 'COMPLETED' })}>Mark complete</Button>
            <button className="icon-btn icon-btn-sm" aria-label="Dismiss suggestion" onClick={() => setDismissedSuggest(true)}><X size={14} /></button>
          </div>
        )}
        {saving.failing && (
          <div className="study-prompt warn" role="alert">
            <AlertTriangle size={16} aria-hidden />
            <span>Progress couldn't be saved.</span>
            <span className="spacer" />
            <Button size="sm" onClick={() => void saving.retry()}>Retry</Button>
          </div>
        )}

        <div className="stack" style={{ gap: 10 }}>
          <div className="study-ctx">
            {ctx && (
              <span>
                <Link to={`/playlists/${ctx.playlist.id}`}>{ctx.playlist.title}</Link> · {ctx.index + 1} of {ctx.total}
              </span>
            )}
            {location && <span>{locationText(location)}</span>}
          </div>
          <h1 className="study-title">{video.title}</h1>
          <div className="row row-wrap">
            <StatusBadge status={video.status} />
            {video.channelTitle && <span className="muted">{video.channelTitle}</span>}
            {video.durationSeconds != null && <span className="muted">{formatDuration(video.durationSeconds)}</span>}
          </div>
        </div>

        <div className="study-actions">
          {ctx?.previous ? (
            <Link className="btn btn-secondary" to={watchUrl(ctx.previous.id, ctx.playlist.id)} title={ctx.previous.title}>
              <ChevronLeft size={16} aria-hidden /> Previous
            </Link>
          ) : null}
          {done ? (
            <Button icon={<RotateCcw size={16} />} loading={progress.isPending} onClick={() => progress.mutate({ id: video.id, status: 'IN_PROGRESS' })}>Reopen</Button>
          ) : (
            <>
              <Button variant="primary" icon={<CheckCircle2 size={16} />} loading={progress.isPending} onClick={() => progress.mutate({ id: video.id, status: 'COMPLETED' })}>Mark complete</Button>
              {video.status !== 'IN_PROGRESS' && <Button icon={<CircleDashed size={16} />} onClick={() => progress.mutate({ id: video.id, status: 'IN_PROGRESS' })}>In progress</Button>}
            </>
          )}
          <Button aria-pressed={video.favorite} icon={<Star size={16} fill={video.favorite ? 'currentColor' : 'none'} />} onClick={() => favorite.mutate({ id: video.id, favorite: !video.favorite })}>
            {video.favorite ? 'Favorited' : 'Favorite'}
          </Button>
          {video.sourceUrl && (
            <a className="btn btn-ghost" href={video.sourceUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} aria-hidden /> YouTube
            </a>
          )}
          {ctx?.next ? (
            <Link className="btn btn-secondary" style={{ marginLeft: 'auto' }} to={watchUrl(ctx.next.id, ctx.playlist.id)} title={ctx.next.title}>
              Next <ChevronRight size={16} aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>

      <aside className="study-side" aria-label="Notes and playlist">
        <Notes video={video} />
        {playlistId && <Queue playlistId={playlistId} currentId={video.id} />}
      </aside>
    </div>
  );
}

export default function StudyPage() {
  const { videoId } = useParams();
  const [params] = useSearchParams();
  const playlistParam = params.get('playlist');
  const q = useVideo(videoId, playlistParam);
  const open = useOpenVideo();
  const qc = useQueryClient();
  const opened = useRef<string | null>(null);
  useDocumentTitle(q.data?.title);

  useEffect(() => {
    if (!videoId || !q.data || opened.current === videoId) return;
    opened.current = videoId;
    open.mutate(videoId, { onSettled: () => void qc.invalidateQueries({ queryKey: keys.video(videoId) }) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, q.data?.id]);

  if (q.isLoading) return <PageLoading label="Loading lecture…" />;
  if (q.isError || !q.data) {
    const notFound = (q.error as any)?.status === 404;
    return <ErrorState error={q.error} onRetry={notFound ? undefined : () => q.refetch()} title={notFound ? 'Lecture not found' : "We couldn't load this lecture"} />;
  }
  // key: a fresh player + notes editor per video, so nothing leaks between lectures
  return <StudyView key={q.data.id} video={q.data} playlistParam={playlistParam} />;
}
