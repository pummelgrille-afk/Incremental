<script lang="ts">
  import { game, type GeneratorDef } from '../game/state.svelte'
  import { formatNumber } from '../game/format'

  let { def }: { def: GeneratorDef } = $props()

  let cost = $derived(game.costOf(def))
  let count = $derived(game.owned[def.id])
  let affordable = $derived(game.points >= cost)
</script>

<button class="generator" disabled={!affordable} onclick={() => game.buy(def)}>
  <span class="info">
    <span class="name">{def.name}</span>
    <span class="desc">{def.description}</span>
    <span class="output">
      {formatNumber(def.baseOutput * count)}/s from {count} owned
    </span>
  </span>
  <span class="cost">{formatNumber(cost)}</span>
</button>

<style>
  .generator {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    width: 100%;
    padding: 0.8rem 1rem;
    font: inherit;
    text-align: left;
    color: inherit;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    cursor: pointer;
  }

  .generator:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .generator:not(:disabled):hover {
    border-color: var(--accent);
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .name {
    font-weight: 600;
  }

  .desc,
  .output {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .cost {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: var(--accent);
    white-space: nowrap;
  }
</style>
