import { useState, type DragEvent } from 'react';

const MIME = 'application/x-preppilot-item';

export type DragPayload =
  | { kind: 'folder'; id: string }
  | { kind: 'playlist'; id: string; placementId: string }
  | { kind: 'video'; id: string; placementId: string };

/** Desktop drag-and-drop is a convenience; every action also exists in the "Move to…" menu. */
export function dragSource(payload: DragPayload) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(MIME, JSON.stringify(payload));
      e.dataTransfer.effectAllowed = 'move';
    },
  };
}

export function readDrag(e: DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer.getData(MIME);
    return raw ? (JSON.parse(raw) as DragPayload) : null;
  } catch {
    return null;
  }
}

export function useDropTarget(onDrop: (payload: DragPayload) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (e.dataTransfer.types.includes(MIME)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setOver(true);
        }
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        const p = readDrag(e);
        if (p) onDrop(p);
      },
    },
  };
}
