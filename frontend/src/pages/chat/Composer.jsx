import { CHAT_MAX_BODY, formatBytes } from '@app/shared';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { chatApi } from '../../api/endpoints.js';
import { Button } from '../../components/ui/Button.jsx';
import { EmojiPicker } from '../../components/ui/EmojiPicker.jsx';
import { useFilePicker } from '../../components/ui/FilePicker.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { ProgressBar } from '../../components/ui/ProgressBar.jsx';
import { nameOf } from './chatFormat.js';

const MAX_ATTACHMENTS = 10;
let counter = 0;

/**
 * Message box: Enter sends, Shift+Enter adds a line, the box grows up to ~8 lines. Attach files with the paperclip, paste a picture, or drop
 * files on the conversation (`ref.addFiles`). Files upload straight away into the conversation's folder in Documents; the message then references them.
 * Shows what is being replied to or edited. `onTyping()` is called while the person types (the hub throttles it).
 */
export const Composer = forwardRef(function Composer({ conversationId, replyTo, editing, people, myId, onSend, onSaveEdit, onCancel, onTyping, disabled }, ref) {
  const [text, setText] = useState('');
  const [picker, setPicker] = useState(false);
  const [files, setFiles] = useState([]); // { key, name, size, progress, file?: uploaded record, error? }
  const box = useRef(null);
  const pickerButton = useRef(null);

  useEffect(() => { setText(editing ? editing.body : ''); box.current?.focus(); }, [editing, conversationId]);
  useEffect(() => { setFiles([]); }, [conversationId]);
  useEffect(() => { if (replyTo) box.current?.focus(); }, [replyTo]);
  useEffect(() => { // autosize
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 176)}px`;
  }, [text]);

  const addFiles = useCallback((picked) => {
    if (editing) return;
    picked.slice(0, MAX_ATTACHMENTS).forEach((file) => {
      counter += 1;
      const key = `f${counter}`;
      setFiles((list) => (list.length >= MAX_ATTACHMENTS ? list : [...list, { key, name: file.name, size: file.size, progress: 0 }]));
      chatApi.uploadFile(conversationId, file, { onProgress: (p) => setFiles((list) => list.map((f) => (f.key === key ? { ...f, progress: p } : f))) })
        .then(({ file: record }) => setFiles((list) => list.map((f) => (f.key === key ? { ...f, progress: 1, file: record } : f))))
        .catch((e) => setFiles((list) => list.map((f) => (f.key === key ? { ...f, error: e.message || 'Upload failed' } : f))));
    });
  }, [conversationId, editing]);
  useImperativeHandle(ref, () => ({ addFiles }), [addFiles]);
  const { open: openPicker, input } = useFilePicker({ multiple: true, onPick: addFiles });

  const uploading = files.some((f) => !f.file && !f.error);
  const ready = files.filter((f) => f.file);
  const canSend = !disabled && !uploading && (text.trim().length > 0 || ready.length > 0);

  const submit = () => {
    if (!canSend) return;
    const body = text.trim();
    if (editing) onSaveEdit(editing, body); else onSend({ body, replyTo: replyTo?.id, attachments: ready.map((f) => f.file) });
    setText(''); setFiles([]);
  };
  const onKeyDown = (event) => {
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

  const context = editing ? { label: 'Editing message', body: editing.body } : replyTo ? { label: `Replying to ${replyTo.senderId === myId ? 'yourself' : nameOf(people, replyTo.senderId)}`, body: replyTo.body || 'Attachment' } : null;

  return (
    <div className="border-t border-line p-3">
      {context && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs">
          <Icon name={editing ? 'edit' : 'reply'} className="mt-0.5 size-3.5 shrink-0 text-muted" />
          <div className="min-w-0 flex-1"><p className="font-semibold text-ink">{context.label}</p><p className="truncate text-muted">{context.body}</p></div>
          <button type="button" aria-label="Cancel" onClick={onCancel} className="grid size-5 place-items-center rounded text-muted hover:text-ink"><Icon name="x" className="size-3.5" /></button>
        </div>
      )}
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
      <div className="flex items-end gap-1 rounded-xl border border-line-strong bg-surface p-1.5 focus-within:border-accent focus-within:ring-4 focus-within:ring-ring">
        <button ref={pickerButton} type="button" aria-label="Emoji" onClick={() => setPicker((o) => !o)} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"><Icon name="smile" className="size-5" /></button>
        <button type="button" aria-label="Attach files" disabled={Boolean(editing)} onClick={openPicker} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"><Icon name="paperclip" className="size-5" /></button>
        <textarea
          ref={box} rows={1} value={text} maxLength={CHAT_MAX_BODY} aria-label="Message" placeholder="Write a message" disabled={disabled}
          onChange={(e) => { setText(e.target.value); if (e.target.value) onTyping?.(); }} onKeyDown={onKeyDown} onPaste={onPaste}
          className="max-h-44 min-h-9 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-ink outline-none placeholder:text-muted"
        />
        <Button size="icon" className="size-9" aria-label={editing ? 'Save edit' : 'Send message'} onClick={submit} disabled={!canSend}><Icon name="send" className="size-4" /></Button>
      </div>
      {input}
      <EmojiPicker anchorRef={pickerButton} open={picker} onClose={() => setPicker(false)} onPick={insert} keepOpen />
    </div>
  );
});
