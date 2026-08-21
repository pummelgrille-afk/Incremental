<script lang="ts">
  import { onMount } from 'svelte'
  import { startHarness, type RenderHarness } from './lib/core/render'

  // Phase 7 confirmation harness. Phase 10 replaces this with the vertical
  // slice and Phase 42 builds the real HUD. Nothing here is load-bearing.
  let host = $state<HTMLDivElement>()
  let harness: RenderHarness | undefined
  let frameMs = $state(0)
  let sprites = $state(0)
  let count = $state(600)

  onMount(() => {
    let disposed = false
    startHarness(host!, count).then((h) => {
      if (disposed) {
        h.destroy()
        return
      }
      harness = h
      const poll = setInterval(() => {
        frameMs = h.frameMs
        sprites = h.spriteCount
      }, 250)
      return () => clearInterval(poll)
    })

    return () => {
      disposed = true
      harness?.destroy()
    }
  })

  function setCount(n: number) {
    count = n
    harness?.setProjectileCount(n)
  }
</script>

<div class="stage" bind:this={host}></div>

<aside class="readout">
  <h1>Phase 7 — render confirmation</h1>
  <dl>
    <dt>frame</dt>
    <dd>{frameMs.toFixed(2)} ms</dd>
    <dt>fps</dt>
    <dd>{frameMs > 0 ? (1000 / frameMs).toFixed(0) : '—'}</dd>
    <dt>sprites</dt>
    <dd>{sprites}</dd>
  </dl>
  <div class="counts">
    {#each [200, 600, 1200, 2400] as n (n)}
      <button class:active={count === n} onclick={() => setCount(n)}>{n}</button>
    {/each}
  </div>
</aside>

<style>
  .stage {
    position: fixed;
    inset: 0;
  }

  .readout {
    position: fixed;
    top: 1rem;
    left: 1rem;
    padding: 0.75rem 1rem;
    background: rgba(11, 10, 8, 0.85);
    border: 1px solid var(--brass-dim);
    border-radius: 0.4rem;
    font-size: 0.8rem;
  }

  h1 {
    margin: 0 0 0.5rem;
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--brass);
  }

  dl {
    display: grid;
    grid-template-columns: auto auto;
    gap: 0.1rem 0.75rem;
    margin: 0 0 0.6rem;
  }

  dt {
    color: var(--muted);
  }

  dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .counts {
    display: flex;
    gap: 0.25rem;
  }

  button {
    flex: 1;
    padding: 0.25rem 0.4rem;
    font: inherit;
    font-size: 0.7rem;
    color: var(--muted);
    background: none;
    border: 1px solid var(--brass-dim);
    border-radius: 0.25rem;
    cursor: pointer;
  }

  button.active {
    color: var(--bg);
    background: var(--brass);
    border-color: var(--brass);
  }
</style>
