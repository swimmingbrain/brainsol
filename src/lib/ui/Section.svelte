<script lang="ts">
  import type { Snippet } from 'svelte';

  // the explanatory section below the cockpit: a heading, an optional lead
  // sentence and the content. the page gives it the hairline and the room
  let {
    title,
    lead,
    id,
    children
  }: {
    title: string;
    lead?: string;
    id?: string;
    children?: Snippet;
  } = $props();
</script>

<section class="section" {id}>
  <h2>{title}</h2>
  {#if lead}<p class="lead">{lead}</p>{/if}
  {#if children}<div class="content">{@render children()}</div>{/if}
</section>

<style>
  .section {
    min-width: 0;
  }

  h2 {
    font-size: 30px;
    line-height: 1.15;
    letter-spacing: -0.015em;
    color: var(--text-strong);
  }

  .lead {
    max-width: 640px;
    margin-top: 10px;
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-secondary);
  }

  .content {
    margin-top: 28px;
  }

  @media (max-width: 600px) {
    h2 {
      font-size: 25px;
    }

    .content {
      margin-top: 20px;
    }
  }
</style>
