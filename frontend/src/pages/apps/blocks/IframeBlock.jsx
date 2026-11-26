import { BlockFrame } from './BlockFrame.jsx';

/** Another page inside this one, sandboxed. The server only accepts http(s) addresses. */
export default function IframeBlock({ block, onSettings }) {
  const { url, allowFullscreen } = block.settings;
  return (
    <BlockFrame block={block} onSettings={onSettings}>
      {url ? <iframe title={block.title || 'Embedded page'} src={url} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" referrerPolicy="no-referrer" allowFullScreen={allowFullscreen} className="h-96 w-full rounded-lg border border-line bg-white" style={block.heightPx ? { height: block.heightPx - 80 } : undefined} />
        : <p className="text-sm text-muted">Enter a web address in the settings.</p>}
    </BlockFrame>
  );
}
