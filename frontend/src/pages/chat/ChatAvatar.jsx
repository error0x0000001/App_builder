import { Avatar } from '../../components/ui/Avatar.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { hueOf } from '../../lib/hue.js';
import { cn } from '../../lib/cn.js';
import { conversationTitle } from './chatFormat.js';

/** A person's avatar (with an online dot) for DMs, a coloured tile for groups and meetings. */
export function ChatAvatar({ conversation, people, online = false, size = 'size-10' }) {
  const title = conversationTitle(conversation, people);
  if (conversation.kind === 'dm') {
    return (
      <span className="relative shrink-0">
        <Avatar name={title} src={people[conversation.peerId]?.avatar} size={size} />
        {online && <span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-surface bg-success" title="Online" />}
      </span>
    );
  }
  if (conversation.icon) return <Avatar name={title} src={conversation.icon} size={size} />;
  const hue = hueOf(title);
  return (
    <span className={cn(size, 'grid shrink-0 place-items-center rounded-full text-white')} style={{ backgroundColor: `hsl(${hue} 55% 45%)` }} aria-hidden="true">
      <Icon name={conversation.meetingAt ? 'video' : 'users'} className="size-1/2" />
    </span>
  );
}
