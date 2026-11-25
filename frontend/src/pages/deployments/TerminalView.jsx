import { useEffect, useRef, useState } from 'react';
import { tokenStore } from '../../api/http.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';

const url = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/v1/deployments/terminal`;
const css = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const REASONS = { 4403: 'You need the Manager level of Deployments to open a terminal.', 4429: 'You already have 3 terminals open.', 4408: 'Closed after 15 minutes without activity.', 4401: 'Your session expired. Reload the page.' };

/** A terminal in a container (`serviceId`) or on a server (`serverId`). xterm is loaded only when one is opened. */
export function TerminalView({ serviceId, serverId, height = 'h-[60vh]', controlRef, onState }) {
  const box = useRef(null);
  const [state, setState] = useState('connecting'); const [message, setMessage] = useState(null); const [attempt, setAttempt] = useState(0);
  useEffect(() => { onState?.(state); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let disposed = false; let socket; let term; let observer;
    setState('connecting'); setMessage(null);
    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit'), import('@xterm/xterm/css/xterm.css')]);
      if (disposed) return;
      term = new Terminal({ cursorBlink: true, fontSize: 13, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', theme: { background: css('--surface-2', '#181818'), foreground: css('--ink', '#e5e5e5'), cursor: css('--accent', '#7f56d9'), selectionBackground: css('--accent-soft', '#444') } });
      const fit = new FitAddon(); term.loadAddon(fit); term.open(box.current); fit.fit();
      socket = new WebSocket(url());
      const send = (frame) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify(frame));
      socket.onopen = () => send({ type: 'auth', token: tokenStore.current(), serviceId, serverId, cols: term.cols, rows: term.rows });
      socket.onmessage = (m) => {
        const f = JSON.parse(m.data);
        if (f.type === 'ready') { setState('open'); term.focus(); if (controlRef) controlRef.current = { send: (text) => send({ type: 'data', data: text }), clear: () => term.clear(), focus: () => term.focus() }; }
        else if (f.type === 'data') term.write(f.data);
        else if (f.type === 'error') setMessage(f.message);
        else if (f.type === 'exit') setState('closed');
      };
      socket.onclose = (e) => { if (!disposed) { setState('closed'); if (REASONS[e.code]) setMessage(REASONS[e.code]); } };
      term.onData((data) => send({ type: 'data', data }));
      term.onResize(({ cols, rows }) => send({ type: 'resize', cols, rows }));
      observer = new ResizeObserver(() => { try { fit.fit(); } catch { /* not visible yet */ } });
      observer.observe(box.current);
    })();
    return () => { disposed = true; observer?.disconnect(); socket?.close(); term?.dispose(); };
  }, [serviceId, serverId, attempt]);
  return (
    <div className="space-y-3">
      {message && <Alert tone="error">{message}</Alert>}
      <div className={`relative overflow-hidden rounded-xl border border-line bg-surface-2 p-2 ${height}`}>
        <div ref={box} className="size-full" />
        {state === 'connecting' && <div className="absolute inset-0 grid place-items-center bg-surface-2/80 text-muted"><Spinner className="size-5" /></div>}
      </div>
      {state === 'closed' && <div className="flex items-center gap-3 text-sm text-muted">Session ended. <Button size="sm" variant="neutral" onClick={() => setAttempt((a) => a + 1)}>Reconnect</Button></div>}
    </div>
  );
}
