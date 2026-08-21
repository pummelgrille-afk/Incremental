<script lang="ts">
  import { game } from '../stores/game.svelte'
  import { NUDGE } from '../content/field'

  /**
   * Minimal always-on HUD: objective health, resources, wave indicator.
   * Phase 42 builds the real one with shared primitives and gain animations.
   */

  let { showDiagnostics = false }: { showDiagnostics?: boolean } = $props()

  const RING_LABELS = ['Inner', 'Main', 'Outer']

  function format(n: number): string {
    if (n < 1000) return Math.floor(n).toString()
    if (n < 1_000_000) return (n / 1000).toFixed(2) + 'K'
    return (n / 1_000_000).toFixed(2) + 'M'
  }
</script>

<div class="hud">
  <header>
    <div class="tension" class:low={game.tensionFraction < 0.3}>
      <span class="label">Tension</span>
      <div class="bar">
        <div class="fill" style:width="{game.tensionFraction * 100}%"></div>
      </div>
      <span class="value">{format(game.tension)} / {format(game.maxTension)}</span>
    </div>

    <div class="stack">
      <span class="label">Filings</span>
      <span class="value big">{format(game.filings)}</span>
    </div>

    <div class="stack">
      <span class="label">{game.zoneName}</span>
      <span class="value">{game.stageName} — wave {game.waveNumber}/{game.waveCount}</span>
    </div>
  </header>

  <footer>
    <div class="rings">
      {#each RING_LABELS as label, i (label)}
        {@const cooldown = game.nudgeCooldowns[i] ?? 0}
        <div class="ring" class:ready={cooldown <= 0}>
          <span class="key">{i + 1}</span>
          <span class="name">{label}</span>
          <div class="cd">
            <div class="cd-fill" style:width="{(1 - cooldown / NUDGE.cooldown) * 100}%"></div>
          </div>
        </div>
      {/each}
    </div>

    <p class="hint">
      <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> select ring · <kbd>←</kbd><kbd>→</kbd> nudge
    </p>
  </footer>

  {#if showDiagnostics}
    <aside class="diagnostics">
      <dl>
        <dt>fps</dt><dd>{game.fps.toFixed(0)}</dd>
        <dt>frame</dt><dd>{game.frameMs.toFixed(2)} ms</dd>
        <dt>sim</dt><dd>{game.simMs.toFixed(2)} ms</dd>
        <dt>slack</dt><dd>{game.slackCount}</dd>
        <dt>bullets</dt><dd>{game.projectilesLive}</dd>
        <dt>peak</dt><dd>{game.projectilePeak}</dd>
        {#if game.projectileExhausted > 0}
          <dt class="warn">over budget</dt><dd class="warn">{game.projectileExhausted}</dd>
        {/if}
        <dt>killed</dt><dd>{game.slackKilled}</dd>
        <dt>conj.</dt><dd>{game.conjunctions}</dd>
      </dl>
    </aside>
  {/if}

  {#if game.phase === 'cleared'}
    <div class="banner">
      <strong>Stage clear.</strong>
      <span>The rings hold. {format(game.filings)} filings recovered.</span>
    </div>
  {:else if game.phase === 'overwhelmed'}
    <div class="banner lost">
      <strong>The Orrery has stopped.</strong>
      <span>Tension exhausted. Nothing is lost but the shift.</span>
    </div>
  {/if}
</div>

<style>
  .hud {
    position: fixed;
    inset: 0;
    pointer-events: none;
    font-size: 0.8rem;
  }

  header {
    display: flex;
    gap: 2rem;
    align-items: flex-start;
    padding: 1rem 1.25rem;
  }

  footer {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
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

  .value.big {
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--brass);
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .tension {
    min-width: 15rem;
  }

  .bar {
    height: 6px;
    margin: 0.3rem 0 0.25rem;
    background: #1c1a14;
    border: 1px solid var(--brass-dim);
    border-radius: 3px;
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: var(--brass);
    transition: width 120ms linear;
  }

  .tension.low .fill {
    background: #f87171;
  }

  .rings {
    display: flex;
    gap: 0.5rem;
  }

  .ring {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    min-width: 4.5rem;
    padding: 0.35rem 0.6rem;
    background: rgba(11, 10, 8, 0.8);
    border: 1px solid var(--brass-dim);
    border-radius: 0.3rem;
    opacity: 0.5;
  }

  .ring.ready {
    opacity: 1;
  }

  .key {
    font-weight: 600;
    color: var(--brass);
  }

  .name {
    font-size: 0.65rem;
    color: var(--muted);
  }

  .cd {
    width: 100%;
    height: 3px;
    background: #1c1a14;
    border-radius: 2px;
    overflow: hidden;
  }

  .cd-fill {
    height: 100%;
    background: var(--brass);
  }

  .hint {
    margin: 0;
    color: var(--muted);
    font-size: 0.7rem;
  }

  kbd {
    display: inline-block;
    padding: 0 0.25rem;
    margin: 0 0.1rem;
    font: inherit;
    font-size: 0.65rem;
    color: var(--text);
    background: #1c1a14;
    border: 1px solid var(--brass-dim);
    border-radius: 0.2rem;
  }

  .diagnostics {
    position: absolute;
    top: 1rem;
    right: 1.25rem;
    padding: 0.6rem 0.8rem;
    background: rgba(11, 10, 8, 0.85);
    border: 1px solid var(--brass-dim);
    border-radius: 0.3rem;
  }

  dl {
    display: grid;
    grid-template-columns: auto auto;
    gap: 0.05rem 0.7rem;
    margin: 0;
    font-size: 0.7rem;
  }

  dt {
    color: var(--muted);
  }

  dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .warn {
    color: #f87171;
  }

  .banner {
    position: absolute;
    top: 42%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: 1rem 2rem;
    text-align: center;
    background: rgba(11, 10, 8, 0.92);
    border: 1px solid var(--brass);
    border-radius: 0.4rem;
  }

  .banner strong {
    color: var(--brass);
    font-size: 1.1rem;
    letter-spacing: 0.06em;
  }

  .banner span {
    color: var(--muted);
  }

  .banner.lost {
    border-color: #f87171;
  }

  .banner.lost strong {
    color: #f87171;
  }
</style>
