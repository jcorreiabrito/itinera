<script lang="ts">
  let {
    size = 32,
    withText = false,
    class: className = '',
  }: {
    size?: number;
    withText?: boolean;
    class?: string;
  } = $props();
</script>

<div class={`inline-flex items-center gap-2.5 ${className}`}>
  <svg
    width={size}
    height={size}
    viewBox="0 0 512 512"
    role="img"
    aria-label="Itinera"
    class="shrink-0 rounded-lg shadow-sm"
  >
    <defs>
      <radialGradient id="logo-bg" cx="40%" cy="35%" r="70%">
        <stop offset="0%" stop-color="#2B614B" />
        <stop offset="100%" stop-color="#163728" />
      </radialGradient>
      <linearGradient id="logo-terra-l" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#E37351" />
        <stop offset="100%" stop-color="#C85434" />
      </linearGradient>
      <linearGradient id="logo-terra-r" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#F08C6D" />
        <stop offset="100%" stop-color="#D66646" />
      </linearGradient>
      <linearGradient id="logo-cream-l" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#F7F4EE" />
        <stop offset="100%" stop-color="#E5DDD0" />
      </linearGradient>
      <linearGradient id="logo-cream-r" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#DFD5C4" />
        <stop offset="100%" stop-color="#C9BCAB" />
      </linearGradient>
      <filter id="logo-shadow" x="-10%" y="-10%" width="130%" height="130%">
        <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#081710" flood-opacity="0.5" />
      </filter>
    </defs>

    <rect width="512" height="512" rx="118" fill="url(#logo-bg)" />

    <circle cx="256" cy="256" r="184" fill="none" stroke="#3D785F" stroke-width="3" stroke-opacity="0.75" />
    <circle cx="256" cy="256" r="154" fill="none" stroke="#F5EEDB" stroke-width="2" stroke-opacity="0.22" stroke-dasharray="3 7" />

    <line x1="256" y1="64" x2="256" y2="82" stroke="#E5AA58" stroke-width="4.5" stroke-linecap="round" />
    <line x1="256" y1="430" x2="256" y2="448" stroke="#90B8A4" stroke-width="3.5" stroke-linecap="round" stroke-opacity="0.6" />
    <line x1="64" y1="256" x2="82" y2="256" stroke="#90B8A4" stroke-width="3.5" stroke-linecap="round" stroke-opacity="0.6" />
    <line x1="430" y1="256" x2="448" y2="256" stroke="#90B8A4" stroke-width="3.5" stroke-linecap="round" stroke-opacity="0.6" />

    <path d="M 104 384 C 130 290 190 280 236 266 C 280 252 350 240 408 128" fill="none" stroke="#E5AA58" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="9 11" stroke-opacity="0.85" />

    <circle cx="104" cy="384" r="9" fill="#E5AA58" />
    <circle cx="104" cy="384" r="4.5" fill="#163728" />
    <circle cx="408" cy="128" r="11" fill="#F08C6D" />
    <circle cx="408" cy="128" r="5.5" fill="#FFFDF9" />

    <g filter="url(#logo-shadow)">
      <path d="M 256 96 L 256 256 L 214 256 Z" fill="url(#logo-terra-l)" />
      <path d="M 256 96 L 298 256 L 256 256 Z" fill="url(#logo-terra-r)" />

      <path d="M 256 416 L 214 256 L 256 256 Z" fill="url(#logo-cream-r)" />
      <path d="M 256 416 L 256 256 L 298 256 Z" fill="url(#logo-cream-l)" />

      <path d="M 136 256 L 256 214 L 256 256 Z" fill="#3F765E" />
      <path d="M 136 256 L 256 256 L 256 298 Z" fill="#2E5D49" />

      <path d="M 376 256 L 256 256 L 256 214 Z" fill="#5A967C" />
      <path d="M 376 256 L 256 298 L 256 256 Z" fill="#477F67" />

      <circle cx="256" cy="256" r="24" fill="#E5AA58" />
      <circle cx="256" cy="256" r="16" fill="#C88E3E" />
      <circle cx="256" cy="256" r="8" fill="#FFFDF9" />
    </g>
  </svg>

  {#if withText}
    <span class="font-serif text-xl font-bold tracking-tight text-ink">Itinera</span>
  {/if}
</div>
