import { Markdown } from '../../../components/ui/Markdown.jsx';
import { BlockFrame } from './BlockFrame.jsx';

export default function MarkdownBlock({ block, onSettings }) {
  return <BlockFrame block={block} onSettings={onSettings}>{block.settings.content ? <Markdown source={block.settings.content} /> : <p className="text-sm text-muted">Write some text in the settings.</p>}</BlockFrame>;
}
