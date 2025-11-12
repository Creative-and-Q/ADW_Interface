<template>
  <div>
    <div
      class="px-3 py-2 transition-colors group flex items-center"
      :class="{
        'hover:bg-blue-50': node.fullVariable && !node.hasChildren,
        'cursor-pointer': node.fullVariable && !node.hasChildren,
        'bg-amber-50 border-l-2 border-amber-300': node.label.includes('*') || node.valueDisplay.includes('hint')
      }"
      :style="{ paddingLeft: `${12 + node.depth * 16}px` }"
      @click="!node.hasChildren && node.fullVariable && $emit('insert', node.fullVariable)"
    >
      <!-- Expand/collapse button -->
      <button
        v-if="node.hasChildren"
        @click.stop="$emit('toggle', node.path)"
        class="mr-1 text-gray-500 hover:text-gray-700 flex-shrink-0 p-1 hover:bg-gray-200 rounded"
        title="Click to expand/collapse"
      >
        <span v-if="isExpanded" class="text-xs">▼</span>
        <span v-else class="text-xs">▶</span>
      </button>
      <div v-else class="w-3 mr-1 flex-shrink-0"></div>

      <!-- Variable content -->
      <div class="flex-1 min-w-0 flex items-center justify-between">
        <div class="flex-1 min-w-0 flex items-center space-x-2">
          <div
            class="text-xs font-medium font-mono truncate"
            :class="node.label.includes('*') ? 'text-amber-700 italic' : 'text-gray-800'"
          >
            {{ node.label }}
          </div>
          <div
            class="text-xs truncate"
            :class="node.valueDisplay.includes('hint') ? 'text-amber-600 italic' : 'text-gray-500'"
          >
            {{ node.valueDisplay }}
          </div>
        </div>
        <div v-if="node.fullVariable && !node.hasChildren" class="ml-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <span class="text-blue-600 text-xs font-bold">+</span>
        </div>
        <!-- Show clickable indicator for parent nodes -->
        <button
          v-else-if="node.fullVariable && node.hasChildren"
          @click.stop="$emit('insert', node.fullVariable)"
          class="ml-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 text-blue-600 text-xs font-bold px-1 hover:bg-blue-100 rounded"
          title="Click to insert this variable"
        >
          +
        </button>
      </div>
    </div>

    <!-- Render children recursively if expanded -->
    <template v-if="node.hasChildren && isExpanded && node.children">
      <VariableTreeNode
        v-for="(child, childIdx) in node.children"
        :key="`${node.path}-${childIdx}`"
        :node="child"
        :is-expanded="expandedPaths.has(child.path)"
        :expanded-paths="expandedPaths"
        @toggle="$emit('toggle', $event)"
        @insert="$emit('insert', $event)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
interface VariableNode {
  path: string;
  fullVariable: string;
  label: string;
  value: any;
  valueDisplay: string;
  hasChildren: boolean;
  children?: VariableNode[];
  depth: number;
}

interface Props {
  node: VariableNode;
  isExpanded: boolean;
  expandedPaths: Set<string>;
}

defineProps<Props>();
defineEmits<{
  toggle: [path: string];
  insert: [variable: string];
}>();
</script>
