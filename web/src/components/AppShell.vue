<script setup lang="ts">
// .header-row (theme switcher, refresh button, auth widget) has moved
// into TheMasthead's own player-nav row — see that component.
</script>

<template>
  <div class="shell">
    <slot name="masthead" />

    <main id="panel" aria-label="Group standings and skill matrix">
      <slot />
    </main>
  </div>
</template>
