import { useEffect, useLayoutEffect, type RefObject } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarState {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggle: () => void;
}

// One preference for every sidebar in the app. It follows the user between
// pages and survives reloads, so a collapsed sidebar stays collapsed until
// they say otherwise.
export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      setCollapsed: (collapsed) => set({ collapsed }),
      toggle: () => set((state) => ({ collapsed: !state.collapsed })),
    }),
    { name: 'caprio-sidebar' },
  ),
);

// Width of the sidebar and the matching content offset, expanded and collapsed.
export const SIDEBAR_WIDTH_CLASS = { expanded: 'w-[240px]', collapsed: 'w-16' } as const;
export const CONTENT_OFFSET_CLASS = { expanded: 'md:ml-[240px]', collapsed: 'md:ml-16' } as const;

export function sidebarShortcutLabel() {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  return mac ? '⌘B' : 'Ctrl+B';
}

// Cmd/Ctrl+B toggles the sidebar from anywhere, the convention editors and
// most sidebar UIs share. Focus outside the sidebar is left alone; focus inside
// it is handled by useSidebarFocus in the sidebar itself.
export function useSidebarShortcut() {
  const toggle = useSidebarStore((state) => state.toggle);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'b') return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);
}

// However the sidebar toggles (its own buttons or the shortcut), focus that
// was inside it must not be stranded in the layer that just became inert. Hand
// it to the toggle that is now visible; focus anywhere else is left untouched.
// Runs before paint, while the old element is still the active one.
export function useSidebarFocus(
  collapsed: boolean,
  container: RefObject<HTMLElement>,
  collapseButton: RefObject<HTMLButtonElement>,
  expandButton: RefObject<HTMLButtonElement>,
) {
  useLayoutEffect(() => {
    if (!container.current?.contains(document.activeElement)) return;
    (collapsed ? expandButton : collapseButton).current?.focus();
  }, [collapsed, container, collapseButton, expandButton]);
}
