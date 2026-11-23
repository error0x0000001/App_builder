import { CHAT_MAX_BODY, formatBytes } from '@app/shared';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { chatApi } from '../../api/endpoints.js';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { UtilityButton } from '../../components/ui/UtilityButton.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/DropdownMenu.jsx';
import { EmojiPicker } from '../../components/ui/EmojiPicker.jsx';
import { useFilePicker } from '../../components/ui/FilePicker.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { ProgressBar } from '../../components/ui/ProgressBar.jsx';
import { cn } from '../../lib/cn.js';
import { nameOf } from './chatFormat.js';
import { useVoiceRecorder } from './useVoiceRecorder.js';

const MAX_ATTACHMENTS = 10;
const MENTION_AT_CARET = /(^|\s)@([\p{L}\p{N}_-]*)$/u;
let counter = 0;
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Message box: Enter sends, Shift+Enter adds a line, the box grows up to ~8 lines. "+" attaches files or starts a poll; you can also paste a picture or drop files on
 * the conversation (`ref.addFiles`); with nothing typed the microphone records a voice note. In groups `@` suggests members to mention.
 * Files upload straight away into the conversation's folder in Documents; the message then references them.
 */
export const Composer = forwardRef(function Composer({ conversationId, replyTo, editing, people, myId, members = [], onSend, onSaveEdit, onCancel, onTyping, onPoll, disabled }, ref) {
  const [text, setText] = useState('');
  const [picker, setPicker] = useState(false);
  const [files, setFiles] = useState([]); // { key, name, size, progress, file?: uploaded record, error? }
  const [mention, setMention] = useState(null); // { query, start, index }
  const picked = useRef(new Map()); // user id -> name chosen from the @ list
  const box = useRef(null);
  const pickerButton = useRef(null);
  const voice = useVoiceRecorder();

  useEffect(() => { setText(editing ? editing.body : ''); box.current?.focus(); }, [editing, conversationId]);
  useEffect(() => { setFiles([]); picked.current = new Map(); setMention(null); voice.cancel(); }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (replyTo) box.current?.focus(); }, [replyTo]);
  useEffect(() => { // autosize
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 176)}px`;
  }, [text]);

  const upload = useCallback((file, key) => chatApi.uploadFile(conversationId, file, { onProgress: (p) => setFiles((list) => list.map((f) => (f.key === key ? { ...f, progress: p } : f))) })
    .then(({ file: record }) => { setFiles((list) => list.map((f) => (f.key === key ? { ...f, progress: 1, file: record } : f))); return record; })
    .catch((e) => { setFiles((list) => list.map((f) => (f.key === key ? { ...f, error: e.message || 'Upload failed' } : f))); return null; }), [conversationId]);

  const addFiles = useCallback((picks) => {
    if (editing) return;
    picks.slice(0, MAX_ATTACHMENTS).forEach((file) => {
      counter += 1;
      const key = `f${counter}`;
      setFiles((list) => (list.length >= MAX_ATTACHMENTS ? list : [...list, { key, name: file.name, size: file.size, progress: 0 }]));
      upload(file, key);
    });
  }, [editing, upload]);
  useImperativeHandle(ref, () => ({ addFiles }), [addFiles]);
  const { open: openPicker, input } = useFilePicker({ multiple: true, onPick: addFiles });

  const uploading = files.some((f) => !f.file && !f.error);
  const ready = files.filter((f) => f.file);
  const canSend = !disabled && !uploading && (text.trim().length > 0 || ready.length > 0);

  const submit = () => {
    if (!canSend) return;
    const body = text.trim();
    const mentions = [...picked.current].filter(([, name]) => body.includes(`@${name}`)).map(([id]) => id);
    if (editing) onSaveEdit(editing, body); else onSend({ body, replyTo: replyTo?.id, attachments: ready.map((f) => f.file), mentions });
    setText(''); setFiles([]); picked.current = new Map(); setMention(null);
  };

  const sendVoice = async () => {
    const file = await voice.stop();
    if (!file) return;
    counter += 1;
    const key = `v${counter}`;
    setFiles((list) => [...list, { key, name: file.name, size: file.size, progress: 0 }]);
    const record = await upload(file, key);
    setFiles((list) => list.filter((f) => f.key !== key));
    if (record) onSend({ body: '', replyTo: replyTo?.id, attachments: [record], mentions: [] });
  };

  // -- @mentions
  const candidates = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return members.filter((m) => m.name && m.name.toLowerCase().includes(q)).sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q))).slice(0, 6);
  }, [mention, members]);
  const updateMention = (value, caret) => {
    const hit = members.length ? MENTION_AT_CARET.exec(value.slice(0, caret)) : null;
    setMention(hit ? { query: hit[2], start: caret - hit[2].length - 1, index: 0 } : null);
  };
  const chooseMention = (member) => {
    const el = box.current;
    const caret = el?.selectionStart ?? text.length;
    const insert = `@${member.name} `;
    picked.current.set(member.id, member.name);
    setText((t) => `${t.slice(0, mention.start)}${insert}${t.slice(caret)}`);
    setMention(null);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(mention.start + insert.length, mention.start + insert.length); });
  };

  const onKeyDown = (event) => {
    if (mention && candidates.length) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setMention((m) => ({ ...m, index: (m.index + (event.key === 'ArrowDown' ? 1 : -1) + candidates.length) % candidates.length })); return; }
      if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); chooseMention(candidates[mention.index]); return; }
      if (event.key === 'Escape') { event.stopPropagation(); setMention(null); return; }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
    if (event.key === 'Escape' && (replyTo || editing)) { event.stopPropagation(); onCancel(); }
  };
  const onPaste = (event) => { const pasted = [...(event.clipboardData?.files ?? [])]; if (pasted.length) { event.preventDefault(); addFiles(pasted); } };
  const insert = (emoji) => {
    const el = box.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText((t) => `${t.slice(0, start)}${emoji}${t.slice(end)}`);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + emoji.length, start + emoji.length); });
  };

  const context = editing ? { label: 'Editing message', body: editing.body } : replyTo ? { label: `Replying to ${replyTo.senderId === myId ? 'yourself' : nameOf(people, replyTo.senderId)}`, body: replyTo.body || (replyTo.kind === 'poll' ? 'Poll' : 'Attachment') } : null;
  const showMic = !text.trim() && files.length === 0 && !editing && !voice.recording;

  return (
    <div className="relative border-t border-line p-3">
      {mention && candidates.length > 0 && (
        <ul role="listbox" aria-label="Mention someone" className="absolute inset-x-3 bottom-full z-20 mb-1 overflow-hidden rounded-lg border border-line bg-surface p-1">
          {candidates.map((m, i) => (
            <li key={m.id}><button type="button" role="option" aria-selected={i === mention.index} onMouseDown={(e) => { e.preventDefault(); chooseMention(m); }} className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm', i === mention.index && 'bg-surface-2')}><Avatar name={m.name} src={people[m.id]?.avatar} size="size-6" /><span className="truncate font-medium text-ink">{m.name}</span></button></li>
          ))}
        </ul>
      )}
      {context && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs">
          <Icon name={editing ? 'edit' : 'reply'} className="mt-0.5 size-3.5 shrink-0 text-muted" />
          <div className="min-w-0 flex-1"><p className="font-semibold text-ink">{context.label}</p><p className="truncate text-muted">{context.body}</p></div>
          <button type="button" aria-label="Cancel" onClick={onCancel} className="grid size-5 place-items-center rounded text-muted hover:text-ink"><Icon name="x" className="size-3.5" /></button>
        </div>
      )}
      {voice.error && <p role="alert" className="mb-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-danger">{voice.error} <button type="button" onClick={voice.clearError} className="ml-1 font-semibold underline">Dismiss</button></p>}
      {files.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2" aria-label="Attachments">
          {files.map((f) => (
            <li key={f.key} className="flex w-52 items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs">
              <Icon name="paperclip" className="size-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">{f.name}</span>
                {f.error ? <span className="block truncate text-danger">{f.error}</span> : f.file ? <span className="block text-muted">{formatBytes(f.size)}</span> : <ProgressBar value={f.progress * 100} label={`Uploading ${f.name}`} />}
              </span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((list) => list.filter((x) => x.key !== f.key))} className="grid size-5 shrink-0 place-items-center rounded text-muted hover:text-ink"><Icon name="x" className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      )}

      {voice.recording ? (
        <div className="flex items-center gap-3 rounded-xl border border-line-strong bg-surface p-1.5" role="status" aria-label="Recording a voice note">
          <Button size="icon" variant="ghost" aria-label="Discard recording" onClick={voice.cancel}><Icon name="trash" className="size-5" /></Button>
          <span className="flex flex-1 items-center gap-2 text-sm font-medium text-ink"><span className="size-2.5 animate-pulse rounded-full bg-danger" />Recording {clock(voice.seconds)}</span>
          <Button size="icon" className="size-9" aria-label="Send voice note" onClick={sendVoice}><Icon name="send" className="size-4" /></Button>
        </div>
      ) : (
        <div className="relative rounded-lg border border-line-strong bg-surface focus-within:border-accent focus-within:ring-4 focus-within:ring-ring">
          <textarea
            ref={box} rows={2} value={text} maxLength={CHAT_MAX_BODY} aria-label="Message" placeholder="Message" disabled={disabled}
            onChange={(e) => { setText(e.target.value); updateMention(e.target.value, e.target.selectionStart); if (e.target.value) onTyping?.(); }} onKeyDown={onKeyDown} onPaste={onPaste} onClick={(e) => updateMention(text, e.target.selectionStart)}
            className="block max-h-52 min-h-[5.5rem] w-full resize-none rounded-lg bg-transparent px-3.5 pb-11 pt-3 pr-10 text-[15px] text-ink outline-none placeholder:text-placeholder"
          />
          {showMic && <UtilityButton icon="mic" label="Record a voice note" onClick={voice.start} className="absolute right-2 top-2" />}
          <div className="absolute bottom-2 right-3 flex items-center gap-2">
            <div className="flex items-center gap-0.5">
              <DropdownMenu>
                <DropdownMenuTrigger>{(props) => <UtilityButton {...props} icon="paperclip" label="Attach" disabled={Boolean(editing)} />}</DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="end" className="min-w-48">
                  <DropdownMenuItem icon="file-plus" onSelect={openPicker}>Photos, videos and files</DropdownMenuItem>
                  <DropdownMenuItem icon="poll" onSelect={onPoll}>Poll</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <UtilityButton ref={pickerButton} icon="smile" label="Emoji" onClick={() => setPicker((o) => !o)} />
            </div>
            <UtilityButton tone="brand" label={editing ? 'Save edit' : 'Send message'} onClick={submit} disabled={!canSend}>{editing ? 'Save' : 'Send'}</UtilityButton>
          </div>
        </div>
      )}
      {input}
      <EmojiPicker anchorRef={pickerButton} open={picker} onClose={() => setPicker(false)} onPick={insert} keepOpen />
    </div>
  );
});
