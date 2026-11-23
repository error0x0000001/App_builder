import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_SECONDS = 300;
const pickMime = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => window.MediaRecorder?.isTypeSupported?.(t)) ?? '';

/** Records a voice note with the microphone. `start()` asks for permission and records; `stop()` resolves a File (or null when nothing was captured); `cancel()` discards. */
export function useVoiceRecorder() {
  const [state, setState] = useState({ recording: false, seconds: 0, error: null });
  const recorder = useRef(null);
  const stream = useRef(null);
  const chunks = useRef([]);
  const timer = useRef(null);
  const finish = useRef(null);

  const release = useCallback(() => { clearInterval(timer.current); stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; recorder.current = null; setState((s) => ({ ...s, recording: false })); }, []);
  useEffect(() => release, [release]);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setState({ recording: false, seconds: 0, error: 'Voice notes are not supported in this browser.' }); return false; }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMime();
      recorder.current = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      recorder.current.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      recorder.current.onstop = () => {
        const type = recorder.current?.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunks.current, { type });
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        const done = finish.current; finish.current = null;
        release();
        done?.(blob.size ? new File([blob], `voice-note-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`, { type: type.split(';')[0] }) : null);
      };
      recorder.current.start();
      setState({ recording: true, seconds: 0, error: null });
      timer.current = setInterval(() => setState((s) => { if (s.seconds + 1 >= MAX_SECONDS) recorder.current?.stop(); return { ...s, seconds: s.seconds + 1 }; }), 1000);
      return true;
    } catch {
      release();
      setState({ recording: false, seconds: 0, error: 'Allow microphone access in the browser address bar to record voice notes.' });
      return false;
    }
  }, [release]);

  const stop = useCallback(() => new Promise((resolve) => { if (!recorder.current) return resolve(null); finish.current = resolve; return recorder.current.stop(); }), []);
  const cancel = useCallback(() => { finish.current = null; if (recorder.current && recorder.current.state !== 'inactive') { recorder.current.onstop = null; recorder.current.stop(); } release(); }, [release]);

  return { ...state, start, stop, cancel, clearError: () => setState((s) => ({ ...s, error: null })) };
}
