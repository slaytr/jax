import { createApp } from 'vue';

import App from './App.vue';
import { router } from './router';
import '@css/styles.css';
// Vue Flow's own structural stylesheet (positioning, drag transforms,
// the SVG edge/marker plumbing) — required for it to render/behave
// correctly at all. Deliberately NOT importing its theme-default.css: the
// Goals graph (GoalsGraph.vue) supplies its own node/edge styling
// end-to-end, on top of this bare structural layer.
import '@vue-flow/core/dist/style.css';
import '@vue-flow/controls/dist/style.css';

createApp(App).use(router).mount('#app');
