import { Popover } from './Popover.jsx';

export const EMOJI = ['😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '🤔', '😮', '😢', '😭', '😡', '🥳', '😴', '🙄', '👍', '👎', '👏', '🙌', '🙏', '💪', '👀', '🔥', '❤️', '💔', '🎉', '✅', '❌', '⭐', '💡', '🚀'];

/** A compact emoji grid in a popover (reactions and the composer). `onPick(emoji)`; closes after a pick unless `keepOpen`. */
export function EmojiPicker({ anchorRef, open, onClose, onPick, keepOpen = false, emojis = EMOJI }) {
  return (
    <Popover anchorRef={anchorRef} open={open} onClose={onClose} maxHeight={240} className="w-64 p-2">
      <div role="menu" aria-label="Emoji" className="grid grid-cols-8 gap-0.5">
        {emojis.map((emoji) => (
          <button key={emoji} type="button" role="menuitem" aria-label={emoji} onClick={() => { onPick(emoji); if (!keepOpen) onClose(); }} className="grid size-7 place-items-center rounded-md text-lg outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring">{emoji}</button>
        ))}
      </div>
    </Popover>
  );
}
