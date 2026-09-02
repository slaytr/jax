import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
    { path: '/stats/:slug', name: 'player', component: () => import('./views/PlayerView.vue') },
  ],
});
