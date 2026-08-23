<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { compact } from '../../utils/format'

  interface Balance {
    label: string
    value: number
  }

  interface Props extends HTMLAttributes<HTMLDivElement> {
    open?: boolean
    title: string

    balances?: Balance[]

    aside?: string

    controls?: Snippet

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

  .hint {
    margin-left: auto;
    color: var(--muted);
    font-size: 0.72rem;
  }
</style>
