<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    label: string
    tone?: 'normal' | 'loud' | 'quiet'

    inline?: boolean
    children: Snippet

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
