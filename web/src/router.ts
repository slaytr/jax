import { createRouter, createWebHistory } from 'vue-router';

import { hideTooltip } from '@/lib/tooltipDirective';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
    { path: '/stats/:slug', name: 'player', component: () => import('./views/PlayerView.vue') },
  ],
});

// A nav-item click tears down the page (and whatever row's tooltip was
// open) before the mouse itself ever leaves that row, so its own
// pointerleave never fires — without this, the singleton tooltip is left
// stuck visible on the page navigated to.
router.beforeEach(() => {
  hideTooltip();
});
