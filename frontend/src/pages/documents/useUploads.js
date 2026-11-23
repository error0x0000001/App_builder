import { useCallback, useEffect, useRef, useState } from 'react';

const CONCURRENCY = 3;
let counter = 0;

/**
 * Upload queue: files go up three at a time, each with its own progress, cancel and retry. `send(file, { onProgress, signal })` does the actual
 * request (a folder upload or a record attachment); `onDone(item)` runs after each success so the caller can refresh its lists.
 */
export function useUploads({ onDone }) {
  const [items, setItems] = useState([]);
  const state = useRef({ queue: [], running: 0, controllers: new Map(), send: new Map() });
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; }, [onDone]);

  const patch = useCallback((id, change) => setItems((list) => list.map((item) => (item.id === id ? { ...item, ...change } : item))), []);

  const pump = useCallback(() => {
    const s = state.current;
    while (s.running < CONCURRENCY && s.queue.length) {
      const id = s.queue.shift();
      const { file, send } = s.send.get(id);
      const controller = new AbortController();
      s.controllers.set(id, controller);
      s.running += 1;
      patch(id, { status: 'uploading', progress: 0 });
      send(file, { signal: controller.signal, onProgress: (progress) => patch(id, { progress }) })
        .then((result) => { patch(id, { status: 'done', progress: 1, result }); doneRef.current?.(result); })
        .catch((error) => patch(id, error?.name === 'AbortError' ? { status: 'cancelled' } : { status: 'error', error: error?.message ?? 'Upload failed' }))
        .finally(() => { s.running -= 1; s.controllers.delete(id); pump(); });
    }
  }, [patch]);

  const add = useCallback((files, send) => {
    const s = state.current;
    const added = files.map((file) => {
      counter += 1;
      const id = `up${counter}`;
      s.send.set(id, { file, send });
      s.queue.push(id);
      return { id, name: file.name, size: file.size, progress: 0, status: 'queued' };
    });
    setItems((list) => [...list, ...added]);
    pump();
  }, [pump]);

  const cancel = useCallback((id) => {
    const s = state.current;
    if (s.controllers.has(id)) s.controllers.get(id).abort();
    else { s.queue = s.queue.filter((q) => q !== id); patch(id, { status: 'cancelled' }); }
  }, [patch]);

  const retry = useCallback((id) => { state.current.queue.push(id); patch(id, { status: 'queued', progress: 0, error: undefined }); pump(); }, [patch, pump]);
  const clear = useCallback(() => setItems((list) => list.filter((i) => i.status === 'uploading' || i.status === 'queued')), []);

  return { items, add, cancel, retry, clear };
}
