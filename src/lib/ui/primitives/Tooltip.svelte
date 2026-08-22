<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * A card explaining whatever the pointer is on.
   *
   * The card is positioned from the anchor's own rectangle rather than from the
   * pointer, so it holds still while the pointer moves inside the thing it is
   * describing — a card that tracks the cursor is unreadable at exactly the
   * moment it is being read.
   *
   * It **measures itself**. The Formation editor's version clamped against a
   * hardcoded estimate of its own height, which was right for a fielded unit
   * and wrong for a locked one, whose extra paragraph ran off the bottom of the
   * window. `bind:clientHeight` costs a frame and cannot be wrong.
   *
   * And it flips rather than clamps: when the preferred side has no room the
   * card moves to the other side, because a card slid along the viewport edge
   * ends up covering the thing it is explaining.
   */

  interface Props {
    /** The rectangle to sit beside, or `null` to show nothing. */
    anchor: DOMRect | null
    width?: number
    prefer?: 'left' | 'right'
    children: Snippet
  }

  let { anchor, width = 260, prefer = 'left', children }: Props = $props()

  /** Clearance from the viewport edge, and from the anchor. */
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
    /* Never a hit target. A card that can be hovered can be hovered *off* the
       thing that raised it, and then it never leaves. */
    pointer-events: none;
  }
</style>
