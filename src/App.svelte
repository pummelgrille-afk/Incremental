<script lang="ts">
  import { onMount } from 'svelte'
  import { game, GENERATORS } from './game/state.svelte'
  import { startLoop } from './game/loop'
  import { load, save, reset } from './game/save'
  import { formatNumber, formatRate, formatDuration } from './game/format'
  import Generator from './lib/Generator.svelte'

  let offlineSeconds = $state(0)

  onMount(() => {
    offlineSeconds = load()
    const stop = startLoop()
    const persist = () => save()
    window.addEventListener('beforeunload', persist)

    return () => {
      stop()
      window.removeEventListener('beforeunload', persist)
      persist()
    }
  })

  function hardReset() {
    if (confirm('Wipe your save and start over?')) {
      reset()
      offlineSeconds = 0
    }
  }
</script>

<main>
  <header>
    <h1>Incremental</h1>
    <p class="points">{formatNumber(game.points)}</p>
    <p class="rate">{formatRate(game.pointsPerSecond)}</p>
  </header>

  {#if offlineSeconds > 1}
    <p class="offline">
      Welcome back — you were away {formatDuration(offlineSeconds)}.
    </p>
  {/if}

  <button class="collect" onclick={() => game.gain(1)}>Collect a point</button>

  <section class="generators">
    {#each GENERATORS as def (def.id)}
      <Generator {def} />
    {/each}
  </section>

  <footer>
    <span>Lifetime: {formatNumber(game.totalEarned)}</span>
    <button class="reset" onclick={hardReset}>Reset</button>
  </footer>
</main>

<style>
  main {
    max-width: 34rem;
    margin: 0 auto;
    padding: 2rem 1rem 4rem;
  }

  header {
    text-align: center;
    margin-bottom: 1.5rem;
  }

  h1 {
    font-size: 0.8rem;
    font-weight: 500;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--muted);
    margin: 0 0 0.75rem;
  }

  .points {
    font-size: 3rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    margin: 0;
    line-height: 1;
  }

  .rate {
    color: var(--accent);
    font-variant-numeric: tabular-nums;
    margin: 0.35rem 0 0;
  }

  .offline {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    padding: 0.6rem 0.9rem;
    color: var(--muted);
    font-size: 0.9rem;
    text-align: center;
  }

  .collect {
    display: block;
    width: 100%;
    padding: 0.9rem;
    margin-bottom: 1.5rem;
    font: inherit;
    font-weight: 600;
    color: var(--bg);
    background: var(--accent);
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
  }

  .collect:active {
    transform: translateY(1px);
  }

  .generators {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 2rem;
    color: var(--muted);
    font-size: 0.85rem;
  }

  .reset {
    font: inherit;
    color: var(--muted);
    background: none;
    border: 1px solid var(--border);
    border-radius: 0.35rem;
    padding: 0.3rem 0.7rem;
    cursor: pointer;
  }

  .reset:hover {
    color: var(--bg);
    background: var(--danger);
    border-color: var(--danger);
  }
</style>
