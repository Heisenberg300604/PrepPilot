import { History } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, PageHeader } from '@/components/ui';
import { ActivityList } from '@/features/dashboard/ActivityList';
import { useDocumentTitle } from '@/lib/hooks';
import { PagedVideoGrid } from './PagedVideoGrid';
import './library.css';

export default function RecentPage() {
  useDocumentTitle('Recently studied');
  const query = useMemo(() => ({ studied: true, sort: 'studied' as const }), []);
  return (
    <>
      <PageHeader eyebrow="Pick up the thread" title="Recently studied" description="Lectures you opened in PrepPilot's player, most recent first." />
      <PagedVideoGrid
        query={query}
        empty={
          <EmptyState
            icon={History}
            title="Nothing studied yet"
            action={
              <Link to="/library" className="btn btn-primary">
                Open the library
              </Link>
            }
          >
            Open a lecture and it will appear here so you can resume from where you stopped. Only viewing inside PrepPilot is tracked.
          </EmptyState>
        }
      />
      <section className="section-head" aria-labelledby="recent-activity">
        <div>
          <h2 id="recent-activity">Recent activity</h2>
          <p>A log of things you actually did.</p>
        </div>
      </section>
      <div className="card">
        <ActivityList limit={20} />
      </div>
    </>
  );
}
