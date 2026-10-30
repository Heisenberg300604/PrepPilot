import { Star } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, PageHeader } from '@/components/ui';
import { useDocumentTitle } from '@/lib/hooks';
import { PagedVideoGrid } from './PagedVideoGrid';
import './library.css';

export default function FavoritesPage() {
  useDocumentTitle('Favorites');
  const query = useMemo(() => ({ favorite: true, sort: 'added' as const }), []);
  return (
    <>
      <PageHeader eyebrow="Keep close" title="Favorites" description="Lectures you've starred for quick access and revision." />
      <PagedVideoGrid
        query={query}
        empty={
          <EmptyState
            icon={Star}
            title="No favorites yet"
            action={
              <Link to="/library" className="btn btn-primary">
                Browse your library
              </Link>
            }
          >
            Tap the star on any lecture to pin it here — handy for formula sessions and last-minute revision.
          </EmptyState>
        }
      />
    </>
  );
}
