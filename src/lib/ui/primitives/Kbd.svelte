<script lang="ts">
  import type { Snippet } from 'svelte'

  let { children }: { children: Snippet } = $props()
</script>

<kbd>{@render children()}</kbd>

<style>
  kbd {
    display: inline-block;
    padding: 0 0.25rem;
    margin: 0 0.1rem;
    font: inherit;
    font-size: 0.65rem;
    color: var(--text);
    background: var(--well);
    border: 1px solid var(--corona-dim);
    border-radius: 0.2rem;
  }
</style>
