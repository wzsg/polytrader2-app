<script lang="ts">
import type { Component } from 'vue';

export interface ContextMenuItem {
  label?: string;
  icon?: Component;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  title?: string;
  ariaLabel?: string;
  onSelect?: () => void | Promise<void>;
  children?: ContextMenuItem[];
}
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, watch, ref } from 'vue';
import { ChevronRight } from '@lucide/vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    x: number;
    y: number;
    items: ContextMenuItem[];
    width?: number;
    submenuWidth?: number;
  }>(),
  {
    width: 200,
    submenuWidth: 188,
  },
);

const emit = defineEmits<{
  'update:open': [value: boolean];
  close: [];
}>();

const menuRef = ref<HTMLElement | null>(null);
const activeIndex = ref<number | null>(null);
const position = ref({ left: 0, top: 0 });
const menuId = Symbol('context-menu');
const menuOpenedEventName = 'polytrader:context-menu-opened';

const rootStyle = computed(() => ({
  left: `${position.value.left}px`,
  top: `${position.value.top}px`,
  width: `${props.width}px`,
}));

const submenuSide = computed(() => {
  const margin = 8;
  const rightEdge = position.value.left + props.width + props.submenuWidth + margin;
  return rightEdge <= window.innerWidth ? 'right' : 'left';
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

async function updatePosition(): Promise<void> {
  position.value = { left: props.x, top: props.y };
  await nextTick();

  const margin = 8;
  const rect = menuRef.value?.getBoundingClientRect();
  const width = rect?.width || props.width;
  const height = rect?.height || 0;
  position.value = {
    left: clamp(props.x, margin, Math.max(margin, window.innerWidth - width - margin)),
    top: clamp(props.y, margin, Math.max(margin, window.innerHeight - height - margin)),
  };
}

function closeMenu(): void {
  if (!props.open) return;
  activeIndex.value = null;
  emit('update:open', false);
  emit('close');
}

function notifyMenuOpened(): void {
  document.dispatchEvent(new CustomEvent(menuOpenedEventName, { detail: menuId }));
}

function hasChildren(item: ContextMenuItem): boolean {
  return Boolean(item.children?.length);
}

function activateItem(item: ContextMenuItem, index: number): void {
  activeIndex.value = !item.disabled && hasChildren(item) ? index : null;
}

function selectItem(item: ContextMenuItem): void {
  if (item.disabled || item.separator || hasChildren(item)) return;
  closeMenu();
  void item.onSelect?.();
}

function handleDocumentPointerDown(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (menuRef.value?.contains(target)) return;
  closeMenu();
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  closeMenu();
}

function handleViewportChange(): void {
  closeMenu();
}

function handleMenuOpened(event: Event): void {
  if (!(event instanceof CustomEvent)) return;
  if (event.detail === menuId) return;
  closeMenu();
}

watch(
  () => [props.open, props.x, props.y, props.items] as const,
  () => {
    if (!props.open) return;
    activeIndex.value = null;
    notifyMenuOpened();
    void updatePosition();
  },
  { immediate: true },
);

document.addEventListener('pointerdown', handleDocumentPointerDown, true);
document.addEventListener('keydown', handleKeydown);
document.addEventListener(menuOpenedEventName, handleMenuOpened);
window.addEventListener('resize', handleViewportChange);
document.addEventListener('scroll', handleViewportChange, true);

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
  document.removeEventListener('keydown', handleKeydown);
  document.removeEventListener(menuOpenedEventName, handleMenuOpened);
  window.removeEventListener('resize', handleViewportChange);
  document.removeEventListener('scroll', handleViewportChange, true);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="context-menu">
      <div
        v-if="open"
        ref="menuRef"
        class="border-border bg-surface app-no-drag fixed z-[100] overflow-visible rounded-md border py-1 shadow-xl shadow-black/40"
        :style="rootStyle"
        role="menu"
        @contextmenu.prevent
        @pointerdown.stop
      >
        <template v-for="(item, index) in items" :key="index">
          <div v-if="item.separator" class="bg-border/70 my-1 h-px" role="separator"></div>
          <div
            v-else
            class="relative px-1"
            @mouseenter="activateItem(item, index)"
            @mouseleave="activeIndex = null"
          >
            <button
              type="button"
              class="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-45"
              :class="
                item.danger
                  ? 'text-red-400 enabled:hover:bg-red-500/10'
                  : 'text-text enabled:hover:bg-btn-secondary'
              "
              :disabled="item.disabled"
              :title="item.title"
              :aria-label="item.ariaLabel"
              role="menuitem"
              :aria-haspopup="hasChildren(item) ? 'menu' : undefined"
              :aria-expanded="hasChildren(item) ? activeIndex === index : undefined"
              @focus="activateItem(item, index)"
              @click="selectItem(item)"
            >
              <component
                :is="item.icon"
                v-if="item.icon"
                :size="14"
                class="shrink-0"
                :stroke-width="2"
              />
              <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
              <ChevronRight v-if="hasChildren(item)" :size="14" class="text-muted shrink-0" />
            </button>

            <div
              v-if="hasChildren(item) && activeIndex === index"
              class="border-border bg-surface absolute top-[-4px] z-[101] max-h-[calc(100vh-16px)] overflow-auto rounded-md border py-1 shadow-xl shadow-black/40"
              :class="submenuSide === 'right' ? 'left-full ml-1' : 'right-full mr-1'"
              :style="{ width: `${submenuWidth}px` }"
              role="menu"
            >
              <template v-for="(child, childIndex) in item.children" :key="childIndex">
                <div v-if="child.separator" class="bg-border/70 my-1 h-px" role="separator"></div>
                <button
                  v-else
                  type="button"
                  class="flex h-8 w-full items-center gap-2 px-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                  :class="
                    child.danger
                      ? 'text-red-400 enabled:hover:bg-red-500/10'
                      : 'text-text enabled:hover:bg-btn-secondary'
                  "
                  :disabled="child.disabled"
                  :title="child.title"
                  :aria-label="child.ariaLabel"
                  role="menuitem"
                  @click="selectItem(child)"
                >
                  <component
                    :is="child.icon"
                    v-if="child.icon"
                    :size="14"
                    class="shrink-0"
                    :stroke-width="2"
                  />
                  <span class="min-w-0 flex-1 truncate">{{ child.label }}</span>
                </button>
              </template>
            </div>
          </div>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.context-menu-enter-active,
.context-menu-leave-active {
  transition:
    opacity 130ms ease,
    transform 130ms ease;
}

.context-menu-enter-from,
.context-menu-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.98);
}
</style>
