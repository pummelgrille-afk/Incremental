<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * A key, drawn as a key.
   *
   * Its own file for a reason that is not styling: the same `kbd` rule had been
   * retyped in four components, and Phase 43 rebinds these. When it does, a
   * keycap that is a component can be told what a key is *bound to*; one that
   * is a CSS rule can only be told what it looks like.
   */

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
