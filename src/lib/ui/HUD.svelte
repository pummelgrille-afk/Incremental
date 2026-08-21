<script lang="ts">
  import { game } from '../stores/game.svelte'
  import { BUDGETS } from '../content/budgets'

  /**
   * Minimal always-on HUD: objective health, resources, wave indicator.
   * Phase 42 builds the real one with shared primitives and gain animations.
   */

  let { showDiagnostics = false }: { showDiagnostics?: boolean } = $props()

  function format(n: number): string {
    if (n < 1000) return Math.floor(n).toString()
    if (n < 1_000_000) return (n / 1000).toFixed(2) + 'K'
    return (n / 1_000_000).toFixed(2) + 'M'
  }
</script>

<div class="hud">
  <header>
    <div class="output" class:low={game.outputFraction < 0.3}>
      <span class="label">Output</span>
      <div class="bar">
        <div class="fill" style:width="{game.outputFraction * 100}%"></div>
      </div>
      <span class="value">{format(game.output)} / {format(game.maxOutput)}</span>
    </div>

    <div class="stack">
      <span class="label">Salvage</span>
      <span class="value big" class:gaining={game.salvageGain > 0}>{format(game.salvage)}</span>
      {#if game.salvageGain > 0}<span class="gain">+{format(game.salvageGain)}</span>{/if}
    </div>

    <!-- The permanent currencies. Kept visually quieter than Salvage: they
         change on the scale of a run, not a second, and a counter that never
         moves competing for attention with one that always does is noise. -->
    <div class="stack meta">
      <span class="label">Clearance</span>
      <span class="value">{format(game.clearance)}</span>
    </div>

    <div class="stack meta">
      <span class="label">Recollection</span>
      <span class="value">{format(game.recollection)}</span>
    </div>

    <div class="stack">
      <span class="label">{game.zoneName}</span>
      <span class="value">{game.stageName} — wave {game.waveNumber}/{game.waveCount}</span>
    </div>
  </header>

  <footer>
    <div class="flare" class:ready={game.canStrike}>
      <span class="label">The Flare</span>
      <div class="pips">
        {#each Array(game.flareMaxCharge) as _, i (i)}
          <span class="pip" class:filled={i < game.flaresReady}></span>
        {/each}
      </div>
      <div class="charge" class:ready={game.canStrike}>
        <div class="fill" style:width="{game.flareProgress * 100}%"></div>
      </div>
    </div>

    <p class="hint">
      Click the field to strike · <kbd>F</kbd> formation{#if game.treeRevealed}{' '}·
        <kbd>T</kbd> tree{/if}{#if game.rewindUnlocked}{' '}· <kbd>P</kbd> rewind{/if} ·
      <kbd>R</kbd> restart · <kbd>F2</kbd> diagnostics
    </p>
  </footer>

  {#if showDiagnostics}
    <aside class="diagnostics">
      <dl>
        <dt>fps</dt><dd class:warn={game.fps < 55 && game.fps > 0}>{game.fps.toFixed(0)}</dd>
        <dt>frame</dt><dd>{game.frameMs.toFixed(2)} ms</dd>
        <dt>sim</dt><dd>{game.simMs.toFixed(2)} ms</dd>
        <dt>render</dt><dd class:warn={game.overFrameBudget}>{game.renderMs.toFixed(2)} ms</dd>

        <dt class="sep">contact</dt>
        <dd class="sep" class:warn={game.contactCount > BUDGETS.contact}>
          {game.contactCount}<span class="of">/{BUDGETS.contact}</span>
        </dd>
        <dt>peak</dt><dd>{game.contactPeak}</dd>
        <dt>bullets</dt>
        <dd>{game.projectilesLive}<span class="of">/{BUDGETS.projectiles}</span></dd>
        <dt>peak</dt><dd>{game.projectilePeak}</dd>

        {#if game.projectileExhausted > 0}
          <dt class="warn">refused</dt><dd class="warn">{game.projectileExhausted}</dd>
        {/if}
        {#if game.ticksOverBudget > 0}
          <dt class="warn">over budget</dt><dd class="warn">{game.ticksOverBudget} ticks</dd>
        {/if}

        <dt class="sep">killed</dt><dd class="sep">{game.contactKilled}</dd>
        <dt>conj.</dt><dd>{game.conjunctions}</dd>
        <dt>flares</dt><dd>{game.flaresStruck}</dd>
      </dl>

      {#if game.telemetryRows.length > 0}
        <!-- Dev-only: the collector does not exist in a production build. -->
        <dl class="telemetry">
          <dt class="sep head">source</dt><dd class="sep head">dps · share</dd>
          {#each game.telemetryRows as row (row.id)}
            <dt>{row.id}</dt>
            <dd>
              {row.dps.toFixed(1)}<span class="of"> · {(row.share * 100).toFixed(0)}%</span>
              {#if row.disables > 0}<span class="warn"> ×{row.disables}</span>{/if}
            </dd>
          {/each}
        </dl>
      {/if}
    </aside>
  {/if}

  {#if game.phase === 'cleared'}
    <div class="banner">
      <strong>Stage clear.</strong>
      <span>The rings hold. {format(game.salvage)} salvage recovered.</span>
      {#if game.lastClearanceAward}
        <span class="reward">
          +{game.lastClearanceAward.clearance}{' '}
          Clearance{''}{game.lastClearanceAward.zoneCompleted
            ? ' — zone complete'
            : ''}
        </span>
      {/if}
      <!-- Says what happens next. Without this the stopped field read as a
           freeze, which is exactly what a playtest reported. -->
      {#if game.nextStageIn > 0}
        <span class="next">Next stage in {Math.ceil(game.nextStageIn)}…</span>
      {:else}
        <span class="next">
          End of the authored stages. <kbd>R</kbd> to run it again.
        </span>
      {/if}
    </div>
  {:else if game.phase === 'overwhelmed'}
    <div class="banner lost">
      <strong>The Perihelion has stopped.</strong>
      <span>Output exhausted. Nothing is lost but the shift.</span>
      <span class="next"><kbd>R</kbd> to wind it again.</span>
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

  .output {
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

  .stack.meta .value {
    color: var(--muted);
  }

  .value.gaining {
    color: #f0e6c8;
  }

  .gain {
    font-size: 0.7rem;
    color: var(--brass);
    animation: gain-fade 1.1s linear forwards;
  }

  @keyframes gain-fade {
    from {
      opacity: 1;
      transform: translateY(0);
    }
    to {
      opacity: 0;
      transform: translateY(-0.4rem);
    }
  }

  .fill {
    height: 100%;
    background: var(--brass);
    transition: width 120ms linear;
  }

  .output.low .fill {
    background: #f87171;
  }

  .flare {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: 0.45rem 1rem;
    background: rgba(11, 10, 8, 0.8);
    border: 1px solid var(--brass-dim);
    border-radius: 0.3rem;
    opacity: 0.55;
    transition: opacity 120ms linear;
  }

  .flare.ready {
    opacity: 1;
    border-color: var(--brass);
  }

  .pips {
    display: flex;
    gap: 0.3rem;
  }

  .pip {
    width: 10px;
    height: 10px;
    background: #1c1a14;
    border: 1px solid var(--brass-dim);
    border-radius: 50%;
  }

  .pip.filled {
    background: var(--brass);
    border-color: var(--brass);
  }

  /* Progress to the next strike: the cooldown, or the charge regenerating. */
  .charge {
    width: 100%;
    height: 3px;
    background: #1c1a14;
    border-radius: 2px;
    overflow: hidden;
  }

  .charge .fill {
    height: 100%;
    background: var(--brass-dim);
    /* Explicitly cancels the 120ms width transition the shared `.fill` rule
       applies. The value already updates every frame, and 120ms of easing on a
       250ms cooldown would leave the bar reporting a state the player has
       already left. */
    transition: none;
  }

  .charge.ready .fill {
    background: var(--brass);
  }

  .banner .reward {
    color: var(--brass);
  }

  .banner .next {
    color: var(--muted);
    font-size: 0.75rem;
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

  .telemetry .head {
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.7;
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

  .of {
    color: var(--muted);
    opacity: 0.7;
  }

  .sep {
    margin-top: 0.35rem;
    padding-top: 0.35rem;
    border-top: 1px solid var(--brass-dim);
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
