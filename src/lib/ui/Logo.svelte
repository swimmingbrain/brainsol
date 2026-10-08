<script lang="ts">
  let { size = 24 }: { size?: number } = $props();
</script>

<!-- the sun moves on, two fading copies show where it was, the panel on its stand turns after it.
     plain shapes, so no ids to keep apart -->
<svg width={size} height={size} viewBox="0 0 64 64" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="11.9" cy="25.7" r="6.5" opacity="0.3" />
  <circle cx="22.4" cy="10.8" r="9.5" opacity="0.55" />
  <path d="M38 33h6v22h7a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H31a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h7z" />
  <rect x="-19" y="-7" width="38" height="14" rx="3" transform="translate(41 33) rotate(-40)" />
</svg>
