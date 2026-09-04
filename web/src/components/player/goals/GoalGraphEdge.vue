<script setup lang="ts">
import { computed } from 'vue';
import { BaseEdge, getBezierPath, Position, type EdgeProps } from '@vue-flow/core';

import { NODE_DIAMETER } from '@/lib/goalGraphLayout';

/**
 * A "floating" dependency edge for the Goals graph (GoalsGraph.vue) —
 * rather than always leaving a node from one fixed side (a plain
 * `smoothstep`/`bezier` edge bound to GoalGraphNode.vue's own fixed
 * left/right <Handle>s), this recomputes where the curve actually meets
 * each node's own 52px ring every time either node moves: whichever point
 * on that circle sits closest to the *other* node's own centre, so the
 * line always leaves toward wherever it's actually headed instead of
 * routing out one fixed side regardless of where a viewer's dragged the
 * other end to.
 *
 * `sourceNode`/`targetNode` (EdgeProps' own — Vue Flow's live node store,
 * not the fixed x/y this component never reads) update reactively during
 * a drag, so the curve visibly follows in real time rather than only
 * catching up once the drag ends. The fixed <Handle>s stay on
 * GoalGraphNode.vue regardless — Vue Flow still needs *a* concrete
 * anchor per node to resolve which two nodes an edge connects, this just
 * ignores where that anchor happens to sit for the actual drawn path.
 */
const props = defineProps<EdgeProps>();

const RADIUS = NODE_DIAMETER / 2;

const ringCenter = (node: { position: { x: number; y: number } }) => ({ x: node.position.x + RADIUS, y: node.position.y + RADIUS });

/** Whichever cardinal side a (dx, dy) direction most nearly points toward
 * — feeds getBezierPath's own sourcePosition/targetPosition, which only
 * shape the curve's initial tangent (a bezier "leaving Right" bows out
 * rightward before curving back, same as it would from a fixed handle);
 * the endpoint itself is always the floating point computed below,
 * regardless of which side this picks. */
const nearestSide = (dx: number, dy: number): Position => {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? Position.Right : Position.Left;
  return dy >= 0 ? Position.Bottom : Position.Top;
};

const path = computed(() => {
  const source = ringCenter(props.sourceNode);
  const target = ringCenter(props.targetNode);
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const angle = Math.atan2(dy, dx);

  const [d] = getBezierPath({
    sourceX: source.x + Math.cos(angle) * RADIUS,
    sourceY: source.y + Math.sin(angle) * RADIUS,
    sourcePosition: nearestSide(dx, dy),
    targetX: target.x - Math.cos(angle) * RADIUS,
    targetY: target.y - Math.sin(angle) * RADIUS,
    targetPosition: nearestSide(-dx, -dy),
  });
  return d;
});
</script>

<template>
  <BaseEdge :id="id" :path="path" :marker-end="markerEnd" :style="style" />
</template>
