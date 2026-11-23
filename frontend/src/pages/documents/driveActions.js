/**
 * The Documents sidebar (search + "+") and the Documents page are different components in different places, so the sidebar's "New folder" / "File upload" choices
 * reach the page through this tiny bus. Emitting runs the page's handler synchronously, inside the click — which is what lets it open the browser's file chooser.
 */
const bus = new EventTarget();
export const driveActions = {
  emit: (name) => bus.dispatchEvent(new Event(name)),
  on: (name, handler) => { bus.addEventListener(name, handler); return () => bus.removeEventListener(name, handler); },
};
