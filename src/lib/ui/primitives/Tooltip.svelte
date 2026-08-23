<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    anchor: DOMRect | null
    width?: number
    prefer?: 'left' | 'right'
    children: Snippet
  }

  let { anchor, width = 260, prefer = 'left', children }: Props = $props()

  const MARGIN = 8
  const GAP = 12

  let height = $state(0)

  const x = $derived.by(() => {
    if (!anchor) return 0
    const preferred = prefer === 'left' ? anchor.left - width - GAP : anchor.right + GAP
    const other = prefer === 'left' ? anchor.right + GAP : anchor.left - width - GAP
    const fits = preferred >= MARGIN && preferred + width <= window.innerWidth - MARGIN
    const chosen = fits ? preferred : other
    return Math.max(MARGIN, Math.min(chosen, window.innerWidth - width - MARGIN))
  })

  const y = $derived(
    anchor
      ? Math.max(MARGIN, Math.min(anchor.top - MARGIN, window.innerHeight - height - MARGIN))
      : 0,
  )
</script>

{#if anchor}
  <div
    class="tooltip"
    role="tooltip"
    bind:clientHeight={height}
    style:left="{x}px"
    style:top="{y}px"
    style:width="{width}px"
  >
    {@render children()}
  </div>
{/if}

<style>
  .tooltip {
    position: fixed;
    z-index: var(--z-tooltip);
    padding: 0.7rem 0.8rem;
    background: var(--bg);
    border: 1px solid var(--corona-dim);
    border-radius: var(--radius);
    box-shadow: 0 0.6rem 1.6rem rgba(0, 0, 0, 0.55);

    pointer-events: none;
  }
</style>
