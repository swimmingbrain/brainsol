<script lang="ts">
  // the font comes with the build through app.css, the page asks no other server for anything
  import '../app.css';
  import Toast from '$lib/ui/Toast.svelte';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

{@render children()}
<Toast />
