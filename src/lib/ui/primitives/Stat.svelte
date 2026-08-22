<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * A labelled figure: the shape the HUD, the Rewind and the offline summary
   * were all drawing by hand, with three different label sizes between them.
   *
   * The `tone` is a statement about *pace*, not importance. `loud` is for a
   * number that moves every second, `quiet` for one that moves once a run. A
   * counter that never changes, drawn as loudly as one that always does, is
   * noise competing with signal — which is exactly how Clearance and
   * Recollection read next to Salvage before the HUD said so.
   */

  interface Props {
    label: string
    tone?: 'normal' | 'loud' | 'quiet'
    /** Lays the label and value on one line, for a panel's summary row. */
    inline?: boolean
    children: Snippet
    /** Anything trailing the figure: a delta, a limit, a tick. */
    after?: Snippet
  }

  let { label, tone = 'normal', inline = false, children, after }: Props = $props()
</script>

<div class="stat {tone}" class:inline>
  <span class="label">{label}</span>
  <span class="value">{@render children()}</span>
  {#if after}{@render after()}{/if}
</div>

<style>
  .stat {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .inline {
    flex-direction: row;
    align-items: baseline;
    gap: 0.5rem;
  }

  .label {
    display: block;
    font-size: 0.65rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .value {
    font-variant-numeric: tabular-nums;
    color: var(--text);
  }

  .loud .value {
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--corona);
  }

  .quiet .value {
    color: var(--muted);
  }
</style>
