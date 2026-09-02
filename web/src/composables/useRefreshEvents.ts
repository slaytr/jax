/**
 * One shared EventSource against /api/refresh/stream, module-singleton so
 * every mounted RefreshButton (today just the group one, but this also
 * covers a future per-player button on /stats/:slug) reacts off the same
 * connection rather than each opening its own. This is what makes a
 * refresh someone *else* triggers — another open tab, another visitor —
 * show up here too: every listener hears the same broadcast regardless of
 * who clicked. The browser's own EventSource reconnects automatically on
 * a dropped connection, so no reconnect logic is needed here.
 */
export interface RunFinishedEvent {
  scope: 'group' | 'player';
  playerSlug: string | null;
  status: 'ok' | 'failed';
}

type Listener = (event: RunFinishedEvent) => void;

let source: EventSource | null = null;
const listeners = new Set<Listener>();

function ensureSource() {
  if (source) return source;
  source = new EventSource('/api/refresh/stream');
  source.addEventListener('run-finished', (event) => {
    const data = JSON.parse((event as MessageEvent).data) as RunFinishedEvent;
    for (const listener of listeners) listener(data);
  });
  return source;
}

/** Registers `listener` for every finished run (any scope) and returns an
 * unsubscribe function. Opens the shared connection on first use. */
export function onRunFinished(listener: Listener): () => void {
  ensureSource();
  listeners.add(listener);
  return () => listeners.delete(listener);
}
