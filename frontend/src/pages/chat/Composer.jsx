import { CHAT_MAX_BODY } from '@app/shared';
import { useEffect, useRef, useState } from 'react';
import { EmojiPicker } from '../../components/ui/EmojiPicker.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { nameOf } from './chatFormat.js';

/**
 * Message box: Enter sends, Shift+Enter adds a line, the box grows up to ~8 lines. Shows what is being replied to or edited.
 * `onTyping()` is called while the person types (the hub throttles it).
 */
export function Composer({ conversationId, replyTo, editing, people, myId, onSend, onSaveEdit, onCancel, onTyping, disabled }) {
  const [text, setText] = useState('');
  const [picker, setPicker] = useState(false);
  const box = useRef(null);
  const pickerButton = useRef(null);

  useEffect(() => { setText(editing ? editing.body : ''); box.current?.focus(); }, [editing, conversationId]);
  useEffect(() => { if (replyTo) box.current?.focus(); }, [replyTo]);
  useEffect(() => { // autosize
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 176)}px`;
  }, [text]);

  const submit = () => {
    const body = text.trim();
    if (!body || disabled) return;
    if (editing) onSaveEdit(editing, body); else onSend({ body, replyTo: replyTo?.id });
    setText('');
  };
  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
    if (event.key === 'Escape' && (replyTo || editing)) { event.stopPropagation(); onCancel(); }
  };
  const insert = (emoji) => {
    const el = box.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText((t) => `${t.slice(0, start)}${emoji}${t.slice(end)}`);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + emoji.length, start + emoji.length); });
  };

  const context = editing ? { label: 'Editing message', body: editing.body } : replyTo ? { label: `Replying to ${replyTo.senderId === myId ? 'yourself' : nameOf(people, replyTo.senderId)}`, body: replyTo.body } : null;

  return (
    <div className="border-t border-line p-3">
      {context && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs">
          <Icon name={editing ? 'edit' : 'reply'} className="mt-0.5 size-3.5 shrink-0 text-muted" />
          <div className="min-w-0 flex-1"><p className="font-semibold text-ink">{context.label}</p><p className="truncate text-muted">{context.body}</p></div>
          <button type="button" aria-label="Cancel" onClick={onCancel} className="grid size-5 place-items-center rounded text-muted hover:text-ink"><Icon name="x" className="size-3.5" /></button>
        </div>
      )}
      <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-surface p-1.5 focus-within:border-accent focus-within:ring-4 focus-within:ring-ring">
        <button ref={pickerButton} type="button" aria-label="Emoji" onClick={() => setPicker((o) => !o)} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"><Icon name="smile" className="size-5" /></button>
        <textarea
          ref={box} rows={1} value={text} maxLength={CHAT_MAX_BODY} aria-label="Message" placeholder="Write a message" disabled={disabled}
          onChange={(e) => { setText(e.target.value); if (e.target.value) onTyping?.(); }} onKeyDown={onKeyDown}
          className="max-h-44 min-h-9 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-ink outline-none placeholder:text-muted"
        />
        <Button size="icon" className="size-9" aria-label={editing ? 'Save edit' : 'Send message'} onClick={submit} disabled={!text.trim() || disabled}><Icon name="send" className="size-4" /></Button>
      </div>
      <EmojiPicker anchorRef={pickerButton} open={picker} onClose={() => setPicker(false)} onPick={insert} keepOpen />
    </div>
  );
}
