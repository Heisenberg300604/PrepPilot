import { CheckCircle2, ChevronDown, Circle, ClipboardCheck, ExternalLink, Link2, MoreHorizontal, Pencil, Pin, PinOff, Play, Plus, Trash2, TrendingDown, TrendingUp, X } from 'lucide-react';
import { useState } from 'react';
import { Button, ConfirmDialog, EmptyState, ErrorState, IconButton, Menu, Skeleton, type MenuItem } from '@/components/ui';
import { daysUntil, formatDate, formatMinutes, plural } from '@/lib/format';
import { toast } from '@/lib/toast';
import type { ExamLink, ExamResources, LinkCategory, MockAttempt, MockTest } from '@/lib/types';
import { AddResourcesDialog } from './AddResourcesDialog';
import { EditLinkDialog, EditMockTestDialog } from './EditResourceDialogs';
import { LogAttemptDialog } from './LogAttemptDialog';
import { SiteMark } from './SiteMark';
import { useAddResources, useDeleteAttempt, useDeleteLink, useDeleteMockTest, useExamResources, useLogAttempt, useUpdateLink } from './queries';
import { CATEGORY_LABEL, CATEGORY_ORDER, MOCK_TYPE_LABEL, domainOf, fmtScore, mockSummary, pct, platformOf } from './resourceUtils';
import './resources.css';

const daysAgo = (key: string) => {
  const d = -daysUntil(key);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};
const openUrl = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

export function ResourcesSection({ examId }: { examId: string }) {
  const q = useExamResources(examId);
  const [adding, setAdding] = useState<null | { kind?: 'LINK' | 'MOCK' }>(null);

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Resources</h2>
          <p>Important links and the mock tests you’re working through.</p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAdding({})} disabled={!q.data}>
          Add links
        </Button>
      </div>
      {q.data ? (
        <div className="stack">
          <QuickLinks examId={examId} links={q.data.links} onAdd={() => setAdding({ kind: 'LINK' })} />
          <MockTests tests={q.data.tests} onAdd={() => setAdding({ kind: 'MOCK' })} />
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="Couldn’t load resources" />
      ) : (
        // Keyed on data, not status: between retries a query can be neither loading nor errored yet.
        <div className="stack">
          <Skeleton style={{ height: 150 }} />
          <Skeleton style={{ height: 260 }} />
        </div>
      )}
      {adding && <AddResourcesDialog examId={examId} existing={q.data} defaultKind={adding.kind} onClose={() => setAdding(null)} />}
    </>
  );
}

/** Small chips for the exam hero: the links you need in a hurry (admit card, login). */
export function PinnedLinks({ resources }: { resources?: ExamResources }) {
  const pinned = resources?.links.filter((l) => l.pinned) ?? [];
  if (!pinned.length) return null;
  return (
    <div className="pinned-links" aria-label="Pinned links">
      {pinned.map((l) => (
        <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="pin-chip">
          <SiteMark url={l.url} size={20} />
          {l.title}
          <ExternalLink size={12} aria-hidden />
        </a>
      ))}
    </div>
  );
}

// ---------------- Quick links ----------------

function QuickLinks({ examId, links, onAdd }: { examId: string; links: ExamLink[]; onAdd: () => void }) {
  const [filter, setFilter] = useState<LinkCategory | 'ALL'>('ALL');
  const [editing, setEditing] = useState<ExamLink | null>(null);
  const present = CATEGORY_ORDER.filter((c) => links.some((l) => l.category === c));
  const active = filter !== 'ALL' && !present.includes(filter) ? 'ALL' : filter; // the last link of a category was deleted
  const shown = links.filter((l) => active === 'ALL' || l.category === active).sort((a, b) => Number(b.pinned) - Number(a.pinned));

  return (
    <section className="card res-card" aria-labelledby="ql-title">
      <header className="res-card-head">
        <div className="row">
          <span className="res-icon">
            <Link2 size={18} aria-hidden />
          </span>
          <div>
            <h3 id="ql-title">Quick links</h3>
            <p>{links.length ? `${plural(links.length, 'link')} · pinned ones also show at the top of this exam` : 'Official pages, syllabus, notes'}</p>
          </div>
        </div>
        {present.length > 1 && (
          <div className="segmented" role="group" aria-label="Filter links by category">
            <button type="button" className={active === 'ALL' ? 'selected' : ''} aria-pressed={active === 'ALL'} onClick={() => setFilter('ALL')}>
              All
            </button>
            {present.map((c) => (
              <button key={c} type="button" className={active === c ? 'selected' : ''} aria-pressed={active === c} onClick={() => setFilter(c)}>
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        )}
      </header>
      {links.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="No links yet"
          action={
            <Button icon={<Plus size={16} />} onClick={onAdd}>
              Add a link
            </Button>
          }
        >
          Save the official notification, login page, syllabus and previous papers, so they’re one click away on exam day.
        </EmptyState>
      ) : (
        <div className="qlink-grid">
          {shown.map((l) => (
            <LinkTile key={l.id} examId={examId} link={l} onEdit={() => setEditing(l)} />
          ))}
          <button type="button" className="qlink qlink-add" onClick={onAdd}>
            <Plus size={18} aria-hidden /> Add link
          </button>
        </div>
      )}
      {editing && <EditLinkDialog link={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function LinkTile({ examId, link, onEdit }: { examId: string; link: ExamLink; onEdit: () => void }) {
  const update = useUpdateLink();
  const del = useDeleteLink();
  const add = useAddResources(examId);
  const togglePin = () => update.mutate({ id: link.id, pinned: !link.pinned });
  const remove = () =>
    del.mutate(link.id, {
      onSuccess: () =>
        toast.success(`Removed “${link.title}”`, {
          label: 'Undo',
          onClick: () => add.mutate({ links: [{ title: link.title, url: link.url, category: link.category, pinned: link.pinned }] }),
        }),
    });
  const items: MenuItem[] = [
    { label: 'Open in new tab', icon: <ExternalLink size={16} />, onSelect: () => openUrl(link.url) },
    { label: 'Copy link', icon: <Link2 size={16} />, onSelect: () => void navigator.clipboard?.writeText(link.url).then(() => toast.success('Link copied'), () => toast.error('Couldn’t copy the link')) },
    { label: link.pinned ? 'Unpin' : 'Pin to exam header', icon: link.pinned ? <PinOff size={16} /> : <Pin size={16} />, onSelect: togglePin },
    { label: 'Edit', icon: <Pencil size={16} />, onSelect: onEdit },
    { label: 'Delete', icon: <Trash2 size={16} />, danger: true, separated: true, onSelect: remove },
  ];
  return (
    <div className={`qlink cat-${link.category.toLowerCase()}`}>
      <a href={link.url} target="_blank" rel="noopener noreferrer" className="qlink-main">
        <SiteMark url={link.url} />
        <span className="qlink-text">
          <span className="qlink-title">{link.title}</span>
          <span className="qlink-sub">
            <span className="cat-dot" aria-hidden />
            {CATEGORY_LABEL[link.category]} · {domainOf(link.url)}
          </span>
        </span>
      </a>
      <IconButton label={link.pinned ? `Unpin ${link.title}` : `Pin ${link.title}`} className={`pin-btn ${link.pinned ? 'is-pinned' : ''}`} aria-pressed={link.pinned} onClick={togglePin}>
        <Pin size={16} />
      </IconButton>
      <Menu label={`More actions for ${link.title}`} trigger={<MoreHorizontal size={18} />} items={items} />
    </div>
  );
}

// ---------------- Mock tests ----------------

type MockFilter = 'ALL' | 'TODO' | 'DONE';

function MockTests({ tests, onAdd }: { tests: MockTest[]; onAdd: () => void }) {
  const [filter, setFilter] = useState<MockFilter>('ALL');
  const [loggingId, setLoggingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<MockTest | null>(null);
  const [inProgressId, setInProgressId] = useState<string | null>(null);
  const del = useDeleteMockTest();
  const s = mockSummary(tests);
  const todo = tests.filter((t) => !t.attempts.length);
  const done = tests.filter((t) => t.attempts.length);
  const shown = filter === 'TODO' ? todo : filter === 'DONE' ? done : [...todo, ...done];
  // Look tests up by id so dialogs always see the latest server data.
  const logging = tests.find((t) => t.id === loggingId);
  const editing = tests.find((t) => t.id === editingId);
  const inProgress = tests.find((t) => t.id === inProgressId);

  const remove = (t: MockTest) => {
    if (t.attempts.length) return setDeleting(t);
    del.mutate(t.id, { onSuccess: () => toast.success(`Removed “${t.title}”`) });
  };

  return (
    <section className="card res-card" aria-labelledby="mt-title">
      <header className="res-card-head">
        <div className="row">
          <span className="res-icon">
            <ClipboardCheck size={18} aria-hidden />
          </span>
          <div>
            <h3 id="mt-title">Mock tests</h3>
            <p>{tests.length ? `${s.attempted} of ${plural(s.total, 'test')} attempted` : 'Practice tests from any site'}</p>
          </div>
        </div>
      </header>

      {s.fullAttempts.length > 0 && (
        <div className="mock-summary">
          <div className="stat">
            <strong>{s.last ? fmtScore(s.last.score) : '—'}</strong>
            <span>Last score{s.last ? ` / ${fmtScore(s.last.maxScore)}` : ''}</span>
          </div>
          <div className="stat">
            <strong>{s.best ? fmtScore(s.best.score) : '—'}</strong>
            <span>Best{s.best ? ` / ${fmtScore(s.best.maxScore)}` : ''}</span>
          </div>
          <div className="stat">
            <strong>{s.avg != null ? Math.round(s.avg) : '—'}</strong>
            <span>{s.trendSpan > 1 ? `Avg of last ${s.trendSpan}` : 'Average'}</span>
          </div>
          <div className="stat stat-trend">
            <Sparkline attempts={s.fullAttempts} />
            {s.trend != null ? (
              <span className={s.trend >= 0 ? 'trend-up' : 'trend-down'}>
                {s.trend >= 0 ? <TrendingUp size={14} aria-hidden /> : <TrendingDown size={14} aria-hidden />}
                {s.trend >= 0 ? '+' : ''}
                {fmtScore(s.trend)} over last {s.trendSpan} full papers
              </span>
            ) : (
              <span>Log another full paper to see your trend</span>
            )}
          </div>
        </div>
      )}

      {inProgress && (
        <div className="mock-banner" role="status">
          <Play size={16} aria-hidden />
          <span>
            Taking <b>{inProgress.title}</b>? Log your score when you’re done.
          </span>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setLoggingId(inProgress.id);
              setInProgressId(null);
            }}
          >
            Log score
          </Button>
          <IconButton label="Dismiss" onClick={() => setInProgressId(null)}>
            <X size={16} />
          </IconButton>
        </div>
      )}

      {tests.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No mock tests yet"
          action={
            <Button icon={<Plus size={16} />} onClick={onAdd}>
              Add mock tests
            </Button>
          }
        >
          Paste links to tests from PrepHub, Testbook or anywhere else. Then log your score after each one to see your progress.
        </EmptyState>
      ) : (
        <>
          <div className="row row-wrap mock-toolbar">
            <div className="segmented" role="group" aria-label="Filter mock tests">
              {(
                [
                  ['ALL', 'All', tests.length],
                  ['TODO', 'Not attempted', todo.length],
                  ['DONE', 'Attempted', done.length],
                ] as const
              ).map(([k, label, n]) => (
                <button key={k} type="button" className={filter === k ? 'selected' : ''} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                  {label} <span className="seg-count">{n}</span>
                </button>
              ))}
            </div>
            <span className="spacer" />
            <Button size="sm" variant="ghost" icon={<Plus size={15} />} onClick={onAdd}>
              Add tests
            </Button>
          </div>
          {shown.length === 0 ? (
            <p className="muted small">{filter === 'TODO' ? 'You’ve attempted every test here. Nice work.' : 'No attempts logged yet.'}</p>
          ) : (
            <div>
              {shown.map((t) => (
                <MockRow
                  key={t.id}
                  test={t}
                  onStart={() => {
                    openUrl(t.url);
                    setInProgressId(t.id);
                  }}
                  onLog={() => setLoggingId(t.id)}
                  onEdit={() => setEditingId(t.id)}
                  onDelete={() => remove(t)}
                />
              ))}
            </div>
          )}
        </>
      )}
      {logging && <LogAttemptDialog test={logging} onClose={() => setLoggingId(null)} />}
      {editing && <EditMockTestDialog test={editing} onClose={() => setEditingId(null)} />}
      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.title}”?`}
          confirmLabel="Delete test"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await del.mutateAsync(deleting.id);
            toast.success(`Removed “${deleting.title}”`);
          }}
        >
          <p>
            This also deletes its {plural(deleting.attempts.length, 'logged attempt')} and can’t be undone. The test on {platformOf(deleting.url)} isn’t affected.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function MockRow({ test, onStart, onLog, onEdit, onDelete }: { test: MockTest; onStart: () => void; onLog: () => void; onEdit: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const delAttempt = useDeleteAttempt();
  const relog = useLogAttempt();
  const attempts = test.attempts;
  const done = attempts.length > 0;
  const last = attempts.at(-1);
  const prev = attempts.at(-2);
  const best = attempts.reduce<MockAttempt | null>((b, a) => (!b || a.score > b.score ? a : b), null);
  const delta = last && prev ? last.score - prev.score : null;

  const removeAttempt = (a: MockAttempt, n: number) =>
    delAttempt.mutate(a.id, {
      onSuccess: () =>
        toast.success(`Attempt #${n} deleted`, {
          label: 'Undo',
          onClick: () => relog.mutate({ testId: test.id, score: a.score, maxScore: a.maxScore, correct: a.correct, wrong: a.wrong, skipped: a.skipped, timeMinutes: a.timeMinutes, reflection: a.reflection, attemptedOn: a.attemptedOn }),
        }),
    });

  const items: MenuItem[] = [
    { label: 'Open test', icon: <ExternalLink size={16} />, onSelect: () => openUrl(test.url) },
    { label: done ? 'Log a retake' : 'Log score', icon: <Plus size={16} />, onSelect: onLog },
    { label: 'Edit', icon: <Pencil size={16} />, onSelect: onEdit },
    { label: done ? 'Delete…' : 'Delete', icon: <Trash2 size={16} />, danger: true, separated: true, onSelect: onDelete },
  ];

  return (
    <div className={`mrow ${done ? 'is-done' : ''} ${expanded ? 'is-expanded' : ''}`}>
      <span className="mrow-status" aria-hidden>
        {done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
      </span>
      <div className="mrow-main">
        {done ? (
          <button type="button" className="mrow-title" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
            {test.title}
            <ChevronDown size={16} className="mrow-chevron" aria-hidden />
          </button>
        ) : (
          <span className="mrow-title">{test.title}</span>
        )}
        <div className="vrow-meta">
          <span className="platform-chip">
            <SiteMark url={test.url} size={16} />
            {platformOf(test.url)}
          </span>
          <span className={`tag type-${test.testType.toLowerCase()}`}>{MOCK_TYPE_LABEL[test.testType]}</span>
          {done ? (
            <span>
              {plural(attempts.length, 'attempt')} · last {daysAgo(last!.attemptedOn)}
            </span>
          ) : (
            <span>{[test.durationMinutes && formatMinutes(test.durationMinutes), `${fmtScore(test.maxScore)} marks`].filter(Boolean).join(' · ')}</span>
          )}
        </div>
      </div>
      <div className="mrow-score" title={last ? `${pct(last).toFixed(0)}%` : undefined}>
        {last && (
          <>
            <span>
              <b>{fmtScore(last.score)}</b>/{fmtScore(last.maxScore)}
            </span>
            {delta != null && delta !== 0 && (
              <span className={delta > 0 ? 'trend-up' : 'trend-down'}>
                {delta > 0 ? '▲' : '▼'} {fmtScore(Math.abs(delta))}
              </span>
            )}
          </>
        )}
      </div>
      <div className="mrow-actions">
        {done ? (
          <Button size="sm" icon={<Plus size={14} />} onClick={onLog}>
            Log retake
          </Button>
        ) : (
          <Button size="sm" variant="primary" icon={<Play size={14} />} onClick={onStart}>
            Start
          </Button>
        )}
        <Menu label={`More actions for ${test.title}`} trigger={<MoreHorizontal size={18} />} items={items} />
      </div>

      {expanded && done && (
        <ol className="attempts">
          {[...attempts].reverse().map((a, i) => {
            const n = attempts.length - i;
            return (
              <li key={a.id} className="attempt">
                <div className="attempt-head">
                  <span className="attempt-n">#{n}</span>
                  <b>
                    {fmtScore(a.score)}/{fmtScore(a.maxScore)}
                  </b>
                  <span className="attempt-pct">{pct(a).toFixed(0)}%</span>
                  {best?.id === a.id && attempts.length > 1 && <span className="tag tag-completed">Best</span>}
                  <span className="spacer" />
                  <span className="attempt-date">{formatDate(a.attemptedOn, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  <IconButton label={`Delete attempt ${n}`} className="icon-btn-sm" onClick={() => removeAttempt(a, n)} disabled={delAttempt.isPending}>
                    <Trash2 size={14} />
                  </IconButton>
                </div>
                {(a.correct != null || a.wrong != null || a.skipped != null || a.timeMinutes != null) && (
                  <div className="attempt-stats">
                    {a.correct != null && <span className="ok">✓ {a.correct} correct</span>}
                    {a.wrong != null && <span className="bad">✗ {a.wrong} wrong</span>}
                    {a.skipped != null && <span>– {a.skipped} skipped</span>}
                    {a.correct != null && a.wrong != null && a.correct + a.wrong > 0 && <span>{Math.round((a.correct / (a.correct + a.wrong)) * 100)}% accuracy</span>}
                    {a.timeMinutes != null && <span>{formatMinutes(a.timeMinutes)}</span>}
                  </div>
                )}
                {a.reflection && <p className="attempt-note">“{a.reflection}”</p>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** Score % across full-length attempts, oldest → newest. Plain inline SVG: no chart library needed. */
function Sparkline({ attempts }: { attempts: MockAttempt[] }) {
  const w = 160;
  const h = 40;
  const pts = attempts.map(pct);
  if (pts.length < 2) return null;
  const min = Math.min(...pts) - 5;
  const max = Math.max(...pts) + 5;
  const xy = pts.map((p, i) => [(i / (pts.length - 1)) * (w - 8) + 4, h - 4 - ((p - min) / (max - min)) * (h - 8)] as const);
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg className="sparkline" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Score trend: ${pts.map((p) => `${p.toFixed(0)}%`).join(', ')}`}>
      <polyline points={xy.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {xy.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === xy.length - 1 ? 3.5 : 2} fill="currentColor" />
      ))}
      <circle cx={lx} cy={ly} r={6} fill="currentColor" opacity={0.15} />
    </svg>
  );
}
