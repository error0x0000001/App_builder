import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { chatApi } from '../../../api/endpoints.js';
import { useAuth } from '../../../auth/AuthProvider.jsx';
import { KEYS } from '../chatCache.js';
import { useChatRealtime } from '../ChatRealtime.jsx';
import { CallScreen } from './CallScreen.jsx';
import { IncomingCall } from './IncomingCall.jsx';

const RING_MS = 45_000;
const Context = createContext({ enabled: false, session: null, startCall: async () => {}, joinCall: async () => {} });
export const useCall = () => useContext(Context);

/**
 * Calls inside chat. Ringing and call state arrive on the chat socket; media goes browser ⇄ LiveKit directly with a token from our API.
 * `livekit-client` is loaded only when a call starts, so it costs nothing until used. One call at a time per tab.
 */
export function CallProvider({ children }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { subscribe } = useChatRealtime();
  const { data: config } = useQuery({ queryKey: ['chat', 'config'], queryFn: chatApi.config, enabled: Boolean(user), staleTime: Infinity });
  const [incoming, setIncoming] = useState(null);
  const [session, setSession] = useState(null); // { conversationId, video, status: connecting|connected, notice, error, startedBy }
  const [, rerender] = useReducer((n) => n + 1, 0);
  const room = useRef(null);
  const sessionRef = useRef(null);
  sessionRef.current = session;

  const cleanup = useCallback(async (notice) => {
    const current = room.current;
    room.current = null;
    current?.removeAllListeners();
    await current?.disconnect();
    setSession(notice ? { ended: true, notice } : null);
  }, []);

  const connect = useCallback(async (conversationId, { video, startedBy }) => {
    if (room.current) await cleanup();
    setIncoming(null);
    setSession({ conversationId, video, status: 'connecting', startedBy });
    try {
      const { Room, RoomEvent, DisconnectReason } = await import('livekit-client');
      const { url, token } = await chatApi.joinCall(conversationId);
      const next = new Room({ adaptiveStream: true, dynacast: true });
      room.current = next;
      [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted,
        RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished, RoomEvent.ActiveSpeakersChanged, RoomEvent.ParticipantNameChanged, RoomEvent.ParticipantAttributesChanged].forEach((event) => next.on(event, rerender));
      next.on(RoomEvent.Disconnected, (reason) => { if (room.current === next) { room.current = null; chatApi.leaveCall(conversationId).catch(() => {}); setSession({ ended: true, notice: reason === DisconnectReason.PARTICIPANT_REMOVED ? 'The host removed you from the call' : 'You were disconnected from the call' }); } });
      await next.connect(url, token);
      setSession((s) => (s && !s.ended ? { ...s, status: 'connected', connectedAt: Date.now() } : s)); // in the room: the call is on, devices follow
      const blocked = video ? 'Your camera or microphone is blocked. Allow access in the browser address bar to be seen and heard.' : 'Your microphone is blocked. Allow access in the browser address bar to be heard.';
      next.localParticipant.setMicrophoneEnabled(true)
        .then(() => (video ? next.localParticipant.setCameraEnabled(true) : undefined))
        .catch(() => setSession((s) => (s && !s.ended ? { ...s, error: blocked } : s)))
        .finally(rerender);
    } catch (e) {
      await cleanup(null);
      setSession({ ended: true, notice: e.message || 'Could not join the call' });
    }
  }, [cleanup]);

  const startCall = useCallback(async (conversationId, video) => {
    try { await chatApi.startCall(conversationId, video); } catch (e) { setSession({ ended: true, notice: e.message }); return; }
    await connect(conversationId, { video, startedBy: user.id });
  }, [connect, user?.id]);

  const joinCall = useCallback((conversationId, video = true) => connect(conversationId, { video }), [connect]);
  const accept = useCallback(() => incoming && connect(incoming.conversationId, { video: incoming.video, startedBy: incoming.from?.id }), [incoming, connect]);
  const decline = useCallback(() => { if (incoming) chatApi.declineCall(incoming.conversationId).catch(() => {}); setIncoming(null); }, [incoming]);

  const leave = useCallback(async () => {
    const conversationId = sessionRef.current?.conversationId;
    await cleanup(null);
    if (conversationId) await chatApi.leaveCall(conversationId).catch(() => {});
    qc.invalidateQueries({ queryKey: KEYS.inbox });
  }, [cleanup, qc]);
  const endForAll = useCallback(async () => {
    const conversationId = sessionRef.current?.conversationId;
    await cleanup(null);
    if (conversationId) await chatApi.endCall(conversationId).catch(() => {});
  }, [cleanup]);

  useEffect(() => subscribe((event) => {
    switch (event.type) {
      case 'call.ring': setIncoming((current) => (sessionRef.current?.conversationId === event.conversationId ? current : event)); break;
      case 'call.dismissed': setIncoming((current) => (current?.callId === event.callId ? null : current)); break;
      case 'call.ended': if (sessionRef.current?.conversationId === event.conversationId && room.current) cleanup('The call has ended'); break;
      case 'call.declined': if (sessionRef.current?.conversationId === event.conversationId) setSession((s) => (s ? { ...s, notice: 'Declined the call' } : s)); break;
      default: break;
    }
  }), [subscribe, cleanup]);

  useEffect(() => { // an unanswered ring stops by itself
    if (!incoming) return undefined;
    const timer = setTimeout(() => setIncoming(null), RING_MS);
    return () => clearTimeout(timer);
  }, [incoming]);
  useEffect(() => () => { room.current?.disconnect(); }, []);

  const value = useMemo(() => ({ enabled: Boolean(config?.enabled), session, startCall, joinCall }), [config, session, startCall, joinCall]);
  return (
    <Context.Provider value={value}>
      {children}
      <IncomingCall call={incoming} onAccept={accept} onDecline={decline} />
      {session && <CallScreen session={session} room={room.current} myId={user.id} onLeave={leave} onEndForAll={endForAll} onDismiss={() => setSession(null)} />}
    </Context.Provider>
  );
}
