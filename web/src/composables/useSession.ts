import { onMounted, onUnmounted, ref } from 'vue';

import { claimPlayer, getSession, login, logout, publishSession, subscribeSession } from '@shared/session.js';

export interface SessionUser {
  discordId: string;
  username: string;
  avatar: string | null;
}
export interface SessionPlayer {
  slug: string;
  name: string;
}
export interface Session {
  user: SessionUser | null;
  player: SessionPlayer | null;
  unclaimed: SessionPlayer[];
}

const EMPTY_SESSION: Session = { user: null, player: null, unclaimed: [] };

/** Reactive wrapper around session.js — every mounted consumer shares the
 * same pub-sub (subscribeSession/publishSession) that module already
 * provides, so AuthWidget claiming a slug is instantly reflected in
 * RefreshButton's ownership check without either component knowing about
 * the other. */
export function useSession() {
  const session = ref<Session>(EMPTY_SESSION);
  const error = ref<string | null>(null);

  async function refresh() {
    try {
      session.value = await getSession();
      error.value = null;
      publishSession(session.value);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
    }
  }

  let unsubscribe: (() => void) | undefined;
  onMounted(() => {
    unsubscribe = subscribeSession((next: Session) => {
      session.value = next;
    });
    refresh();
  });
  onUnmounted(() => unsubscribe?.());

  async function handleClaim(slug: string) {
    await claimPlayer(slug);
    await refresh();
  }

  async function handleLogout() {
    await logout();
    await refresh();
  }

  return { session, error, refresh, login, claim: handleClaim, logout: handleLogout };
}
