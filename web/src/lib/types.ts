import type { ComponentType, SvelteComponent } from 'svelte';

/**
 * A Lucide (or compatible) icon component.
 *
 * lucide-svelte ships Svelte class components, so icons are typed as
 * `ComponentType`. Render them prop-less (`<Icon />`) and control size/color
 * from the parent element, e.g. `class="text-primary-600 [&_svg]:size-5"`.
 */
export type IconComponent = ComponentType<SvelteComponent>;

export interface NavItem {
  label: string;
  href: string;
  icon: IconComponent;
  /** Placeholder destinations (not yet built) render as disabled in Phase 0. */
  disabled?: boolean;
}
