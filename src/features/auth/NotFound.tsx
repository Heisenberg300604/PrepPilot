import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Brand } from '@/components/layout/Brand';
import { useDocumentTitle, useNoIndex } from '@/lib/hooks';

/** Shown for unknown URLs instead of silently redirecting, so broken links are obvious and never indexed. */
export default function NotFound() {
  useDocumentTitle('Page not found');
  useNoIndex();
  return (
    <main className="setup-screen">
      <div className="setup-card">
        <Brand />
        <div className="empty-icon">
          <Compass size={22} aria-hidden />
        </div>
        <h1>Page not found</h1>
        <p>This link doesn't lead anywhere in PrepPilot. It may have been mistyped, or the page has moved.</p>
        <Link to="/" className="btn btn-primary btn-md">
          Go to PrepPilot
        </Link>
      </div>
    </main>
  );
}
