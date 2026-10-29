<script lang="ts">
  import { qrShape } from '../qr';

  // dark modules on a light square in both themes. a code with swapped colours
  // reads on most phones, but not on all of them
  let { text, label, size = 168 }: { text: string; label: string; size?: number } = $props();

  const shape = $derived(qrShape(text));
</script>

<svg class="qr" width={size} height={size} viewBox="0 0 {shape.size} {shape.size}" role="img" aria-label={label} shape-rendering="crispEdges">
  <rect width={shape.size} height={shape.size} class="light" />
  <path d={shape.path} class="dark" />
</svg>

<style>
  .qr {
    display: block;
    flex-shrink: 0;
    border-radius: var(--radius-sm);
  }

  .light {
    fill: var(--text-strong);
  }

  .dark {
    fill: var(--bg-deep);
  }

  /* the light theme turns those two tokens around, so it takes two others */
  :global(:root[data-theme='light']) .light {
    fill: var(--bg-surface);
  }

  :global(:root[data-theme='light']) .dark {
    fill: var(--text-strong);
  }
</style>
