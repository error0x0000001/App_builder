import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';

/**
 * Opens the system file chooser from OUR button (the browser's own input is hidden — it is the only way to reach the OS dialog).
 * `const { open, input } = useFilePicker({ multiple, onPick(files) })` — render `{input}` once, call `open()` from any button or menu item.
 */
export function useFilePicker({ multiple = true, accept, onPick }) {
  const ref = useRef(null);
  const open = useCallback(() => ref.current?.click(), []);
  const input = (
    <input
      ref={ref} type="file" hidden multiple={multiple} accept={accept} tabIndex={-1} aria-hidden="true"
      onChange={(event) => { const files = [...event.target.files]; event.target.value = ''; if (files.length) onPick(files); }}
    />
  );
  return { open, input };
}

/** Wraps an area so files can be dropped on it; shows `label` over it while a file is being dragged in. Pass `disabled` to ignore drops. */
export function DropZone({ onFiles, disabled = false, label = 'Drop files to upload', className, children }) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  useEffect(() => { if (disabled) { depth.current = 0; setOver(false); } }, [disabled]);
  const hasFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files');
  return (
    <div
      className={cn('relative', className)}
      onDragEnter={(e) => { if (disabled || !hasFiles(e)) return; e.preventDefault(); depth.current += 1; setOver(true); }}
      onDragOver={(e) => { if (!disabled && hasFiles(e)) e.preventDefault(); }}
      onDragLeave={() => { if (disabled) return; depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); }}
      onDrop={(e) => { if (disabled || !hasFiles(e)) return; e.preventDefault(); depth.current = 0; setOver(false); const files = [...e.dataTransfer.files]; if (files.length) onFiles(files); }}
    >
      {children}
      {over && <div className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-xl border-2 border-dashed border-accent bg-accent-soft/80 text-sm font-semibold text-link">{label}</div>}
    </div>
  );
}
