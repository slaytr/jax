<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue';

import { DEFAULT_LABEL_COLOUR, LABEL_COLOURS } from '@/lib/goals';

/**
 * The label picker inside the "new goal" dialog — a search-and-select box
 * (type to filter the known-labels dropdown, click one to add it) that can
 * also create a brand new label on the spot. Ported from player-goals.js's
 * labelPickerField — that version managed its own DOM in place specifically
 * to escape the legacy page's re-render-everything cycle; in Vue that
 * workaround simply isn't needed, so this is just an ordinary reactive
 * component. `onCreateLabel`/`onDeleteLabel` still fire immediately
 * (independent of whether the goal being created ends up saved), matching
 * the original's own reasoning: a label is a registry-wide thing, not
 * scoped to one goal.
 */
const props = defineProps<{
  initialLabels: Array<{ name: string; colour: string }>;
  recentNames: string[];
}>();

const emit = defineEmits<{ createLabel: [name: string, colour: string]; deleteLabel: [name: string] }>();

const selected = defineModel<string[]>({ required: true });

const knownLabels = ref([...props.initialLabels]);
const query = ref('');
const interacted = ref(false);
const creatingName = ref<string | null>(null);
const searchInput = useTemplateRef<HTMLInputElement>('searchInput');

const colourOf = (name: string) => knownLabels.value.find((label) => label.name === name)?.colour ?? DEFAULT_LABEL_COLOUR;

const RECENT_LABEL_LIMIT = 5;

const visibleOptions = computed(() => {
  if (!interacted.value) {
    return props.recentNames
      .map((name) => knownLabels.value.find((label) => label.name === name))
      .filter((label): label is { name: string; colour: string } => !!label && !selected.value.includes(label.name))
      .slice(0, RECENT_LABEL_LIMIT);
  }
  const q = query.value.trim().toLowerCase();
  return knownLabels.value.filter((label) => !selected.value.includes(label.name) && label.name.toLowerCase().includes(q));
});

const exactMatch = computed(() => knownLabels.value.some((label) => label.name.toLowerCase() === query.value.trim().toLowerCase()));
const trimmedQuery = computed(() => query.value.trim());
const showCreateOption = computed(() => interacted.value && trimmedQuery.value !== '' && !exactMatch.value);
const dropdownVisible = computed(() => creatingName.value === null && (visibleOptions.value.length > 0 || showCreateOption.value));

function onFocusOrInput() {
  interacted.value = true;
}

function selectLabel(name: string) {
  if (!selected.value.includes(name)) selected.value = [...selected.value, name];
  creatingName.value = null;
  query.value = '';
  searchInput.value?.focus();
}

function removeSelected(name: string) {
  selected.value = selected.value.filter((selectedName) => selectedName !== name);
}

function startCreating(name: string) {
  creatingName.value = name;
}

function pickColour(colour: string) {
  const name = creatingName.value;
  if (!name) return;
  knownLabels.value = [...knownLabels.value, { name, colour }];
  emit('createLabel', name, colour);
  selectLabel(name);
}

function deleteLabel(name: string) {
  knownLabels.value = knownLabels.value.filter((label) => label.name !== name);
  emit('deleteLabel', name);
}
</script>

<template>
  <div class="goal-label-field">
    <input
      ref="searchInput"
      v-model="query"
      type="text"
      class="goal-label-search"
      placeholder="Search or create a label…"
      @focus="onFocusOrInput"
      @input="onFocusOrInput"
    />

    <ul class="goal-label-dropdown" :hidden="!dropdownVisible">
      <li v-for="label in visibleOptions" :key="label.name" class="goal-label-row">
        <button type="button" class="goal-label-option" @click="selectLabel(label.name)">
          <span class="swatch" :style="{ '--swatch': label.colour }" aria-hidden="true" />
          <span>{{ label.name }}</span>
        </button>
        <button type="button" class="goal-label-row-delete" :aria-label="`Delete the ${label.name} label`" @click="deleteLabel(label.name)">×</button>
      </li>
      <li v-if="showCreateOption" class="goal-label-row">
        <button type="button" class="goal-label-option goal-label-create" @click="startCreating(trimmedQuery)">+ Create "{{ trimmedQuery }}"</button>
      </li>
    </ul>

    <div class="goal-label-colours" :hidden="creatingName === null">
      <button
        v-for="colour in LABEL_COLOURS"
        :key="colour"
        type="button"
        class="goal-label-swatch"
        :style="{ '--swatch': colour }"
        :aria-label="`Use ${colour}`"
        @click="pickColour(colour)"
      />
    </div>

    <div class="goal-label-chips">
      <span v-for="name in selected" :key="name" class="goal-label-chip">
        <span class="swatch" :style="{ '--swatch': colourOf(name) }" aria-hidden="true" />
        <span>{{ name }}</span>
        <button type="button" :aria-label="`Remove the ${name} label`" @click="removeSelected(name)">×</button>
      </span>
    </div>
  </div>
</template>
