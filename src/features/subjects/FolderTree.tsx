import { ChevronRight, Folder, FolderOpen, Layers } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Folder as FolderT } from '@/lib/types';
import { useDropTarget, type DragPayload } from './dnd';
import { ancestorIds, buildFolderTree, type TreeNode } from './folderTreeUtils';

interface Props {
  subjectId: string;
  subjectName: string;
  folders: FolderT[];
  currentFolderId: string | null;
  onDropOn: (folderId: string | null, payload: DragPayload) => void;
}

function Row({ node, subjectId, current, expanded, toggle, onDropOn }: { node: TreeNode; subjectId: string; current: string | null; expanded: Set<string>; toggle: (id: string) => void; onDropOn: Props['onDropOn'] }) {
  const { folder, children } = node;
  const open = expanded.has(folder.id);
  const drop = useDropTarget((p) => onDropOn(folder.id, p));
  return (
    <li>
      <div className={`tree-row ${current === folder.id ? 'is-current' : ''} ${drop.over ? 'is-drop' : ''}`} {...drop.props}>
        {children.length ? (
          <button type="button" className="tree-toggle" aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${folder.name}`} onClick={() => toggle(folder.id)}>
            <ChevronRight size={14} aria-hidden />
          </button>
        ) : (
          <span className="tree-spacer" />
        )}
        <Link to={`/subjects/${subjectId}?folder=${folder.id}`} className="tree-link" aria-current={current === folder.id ? 'page' : undefined}>
          {open && children.length ? <FolderOpen size={15} aria-hidden /> : <Folder size={15} aria-hidden />}
          <span className="truncate">{folder.name}</span>
        </Link>
      </div>
      {open && children.length > 0 && (
        <ul>
          {children.map((c) => (
            <Row key={c.folder.id} node={c} subjectId={subjectId} current={current} expanded={expanded} toggle={toggle} onDropOn={onDropOn} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Collapsible tree of every folder in the subject. Click to open; drop items on a row to move them there. */
export function FolderTree({ subjectId, subjectName, folders, currentFolderId, onDropOn }: Props) {
  const tree = useMemo(() => buildFolderTree(folders), [folders]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!currentFolderId) return;
    setExpanded((prev) => new Set([...prev, currentFolderId, ...ancestorIds(folders, currentFolderId)]));
  }, [currentFolderId, folders]);
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const rootDrop = useDropTarget((p) => onDropOn(null, p));

  return (
    <nav className="tree" aria-label="Folders">
      <ul>
        <li>
          <div className={`tree-row ${currentFolderId === null ? 'is-current' : ''} ${rootDrop.over ? 'is-drop' : ''}`} {...rootDrop.props}>
            <span className="tree-spacer" />
            <Link to={`/subjects/${subjectId}`} className="tree-link" aria-current={currentFolderId === null ? 'page' : undefined}>
              <Layers size={15} aria-hidden />
              <span className="truncate">{subjectName}</span>
            </Link>
          </div>
          {tree.length > 0 && (
            <ul>
              {tree.map((n) => (
                <Row key={n.folder.id} node={n} subjectId={subjectId} current={currentFolderId} expanded={expanded} toggle={toggle} onDropOn={onDropOn} />
              ))}
            </ul>
          )}
        </li>
      </ul>
    </nav>
  );
}
