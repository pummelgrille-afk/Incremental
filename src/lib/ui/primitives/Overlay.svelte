<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { compact } from '../../utils/format'

  /**
   * A full-screen work surface: the Formation editor and the Almanac.
   *
   * Distinct from `Modal` in one way that decides everything else — an overlay
   * **hides** the field rather than dimming it. Both of these are places you go
   * to think, and thinking against a moving starfield is the same information
   * twice. A modal is an interruption to the run; an overlay is a break from
   * it.
   *
   * The layout is fixed rather than offered: a header across the top, a large
   * region, and a column of detail on the right. Both screens had independently
   * arrived at that grid — 19rem in one, 20rem in the other — because it is
   * what "arrange things, inspect one of them" looks like.
   *
   * The header is drawn from props rather than a snippet so it can be styled
   * here. Svelte scopes styles to the component that authors the markup, so a
   * heading passed in as a snippet would need its rules retyped by every
   * caller — which is the duplication this file exists to end.
   */

  interface Balance {
    label: string
    value: number
  }

  interface Props extends HTMLAttributes<HTMLDivElement> {
    open?: boolean
    title: string
    /** Currencies the screen spends. Rendered abbreviated, as in the HUD. */
    balances?: Balance[]
    /** Width of the detail column. */
    aside?: string
    /** Toolbar controls, sitting between the balances and the hint. */
    controls?: Snippet
    /** How to leave, and what the pointer does here. */
    hint?: Snippet
    children: Snippet
  }

  let {
    open = false,
    title,
    balances = [],
    aside = '20rem',
    controls,
    hint,
    children,
    ...rest
  }: Props = $props()
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" style:--aside={aside} role="dialog" aria-label={title} {...rest}>
    <header>
      <h2>{title}</h2>
      {#each balances as balance (balance.label)}
        <span class="balance">{compact(balance.value)} {balance.label}</span>
      {/each}
      {#if controls}<span class="controls">{@render controls()}</span>{/if}
      {#if hint}<span class="hint">{@render hint()}</span>{/if}
    </header>

    {@render children()}
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-columns: 1fr var(--aside);
    grid-template-rows: auto 1fr;
    background: var(--overlay);
    pointer-events: auto;
    z-index: var(--z-overlay);
    font-size: 0.78rem;
  }

  header {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.9rem 1.25rem;
    border-bottom: 1px solid var(--corona-dim);
  }

  h2 {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--corona);
  }

  .balance {
    font-variant-numeric: tabular-nums;
    color: var(--text);
  }

  .controls {
    display: flex;
    gap: 0.4rem;
  }

  /* Pushed to the far end: it is the least urgent thing in the row, and it is
     the only one whose position should not move as balances change. */
  .hint {
    margin-left: auto;
    color: var(--muted);
    font-size: 0.72rem;
  }
</style>
