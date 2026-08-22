<script lang="ts">
  import { game } from '../stores/game.svelte'
  import { BUDGETS } from '../content/budgets'
  import { compact } from '../utils/format'
  import { bindingLabel } from '../core/keybindings'
  import type { ActionId } from '../content/keybindings'
  import Stat from './primitives/Stat.svelte'
  import Meter from './primitives/Meter.svelte'
  import Delta from './primitives/Delta.svelte'
  import Kbd from './primitives/Kbd.svelte'
  import Button from './primitives/Button.svelte'

  /**
   * The always-on readout: Output, the currencies, where you are, and the
   * Flare.
   *
   * Everything here is drawn from primitives, and the reason is not tidiness —
   * it is that the HUD is the one surface a player looks at *while doing
   * something else*. A label that is 0.65rem here and 0.62rem in the Rewind
   * modal costs a fraction of a second of re-reading every time they move
   * between the two, and they move between them constantly.
   *
   * **What moves is what is animated.** Phase 42's readability brief comes down
   * to one rule: a number the player must react to gets a float, and a number
   * they merely need to know does not. Output and Salvage move on the scale of
   * a second and carry deltas; Clearance and Recollection move on the scale of
   * a run and are drawn quiet.
   */

  let { showDiagnostics = false }: { showDiagnostics?: boolean } = $props()

  const low = $derived(game.outputFraction < 0.3)

  /**
   * The hint line reads the player's actual bindings.
   *
   * It listed the defaults as literal letters until Phase 43 made keys
   * rebindable, at which point a hardcoded hint stops being a help and becomes
   * a lie — and the player it lies to is exactly the one who needed the hint.
   */
  const key = (action: ActionId) => bindingLabel(game.keybindings[action] ?? '')
</script>

<div class="hud">
  <header>
    <div class="output">
      <Stat label="Output">
        {compact(game.output)} / {compact(game.maxOutput)}
        <Delta value={game.outputLoss} direction="loss" />
        <Delta value={game.outputGain} direction="gain" />
        {#snippet after()}
          <!-- `struck` flashes the bar's own border on a hit. Under a full
               formation the bar can lose a fifth of its width between two
               glances and never be seen moving; the flash is what makes a
               fast, survivable hit distinguishable from a slow, fatal one. -->
          <Meter
            label="Output"
            fraction={game.outputFraction}
            tone={low ? 'danger' : 'corona'}
            struck={game.outputLoss > 0}
          />
        {/snippet}
      </Stat>

      <!-- Under the bar rather than beside the Flare, because it is a
           statement about the *stage*, not about the player's one live input.
           The HUD around it is inert, so this row opts back in. -->
      <div class="controls">
        <button
          class:on={game.paused}
          disabled={game.standby}
          onclick={() => (game.paused = !game.paused)}
        >
          {game.paused ? 'Resume' : 'Pause'}
          <Kbd>{key('pause')}</Kbd>
        </button>
      </div>
    </div>

    <Stat label="Salvage" tone="loud">
      {compact(game.salvage)}
      {#snippet after()}
        <Delta value={game.salvageGain} direction="gain" />
        <Delta value={game.salvageLoss} direction="loss" />
      {/snippet}
    </Stat>

    <!-- The permanent currencies. Kept visually quieter than Salvage: they
         change on the scale of a run, not a second, and a counter that never
         moves competing for attention with one that always does is noise. -->
    <Stat label="Clearance" tone="quiet">{compact(game.clearance)}</Stat>
    <Stat label="Recollection" tone="quiet">{compact(game.recollection)}</Stat>

    <Stat label={game.zoneName}>
      {game.stageName} — wave {game.waveNumber}/{game.waveCount}
    </Stat>
  </header>

  <footer>
    <div class="flare" class:ready={game.canStrike}>
      <span class="flare-label">The Flare</span>
      <div class="pips">
        {#each Array(game.flareMaxCharge) as _, i (i)}
          <span class="pip" class:filled={i < game.flaresReady}></span>
        {/each}
      </div>
      <!-- `instant`, because this one updates every frame. A 120 ms ease on a
           250 ms cooldown reports a state the player has already left. -->
      <Meter
        label="Flare charge"
        fraction={game.flareProgress}
        tone={game.canStrike ? 'corona' : 'dim'}
        instant
      />
    </div>

    <p class="hint">
      Click the field or <Kbd>{key('flare')}</Kbd> to strike ·
      <Kbd>{key('map')}</Kbd> map ·
      <Kbd>{key('formation')}</Kbd> formation{#if game.treeRevealed}{' '}·
        <Kbd>{key('tree')}</Kbd> tree{/if}{#if game.rewindUnlocked}{' '}·
        <Kbd>{key('rewind')}</Kbd> rewind{/if} ·
      <Kbd>{key('manual')}</Kbd> manual · <Kbd>Esc</Kbd> menu
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

  {#if game.standby}
    <!-- The between-state. It says what it costs, because standing down
         restarts the stage and a player should not learn that by losing four
         cleared waves to it. -->
    <div class="banner held">
      <strong>Standing by.</strong>
      <span>Nothing is approaching. Take as long as you need.</span>
      <span class="next">The shift restarts from the first wave.</span>
      <div class="banner-actions">
        <Button onclick={() => game.stageActions?.begin()}>Begin the shift</Button>
        <Button variant="ghost" onclick={() => (game.showFormation = true)}>Formation</Button>
      </div>
    </div>
  {:else if game.paused}
    <!-- Said plainly and centrally. A stopped field with no explanation is the
         exact thing Phase 33 had to fix on the clear banner, and a pause that
         did not announce itself would reintroduce it. -->
    <div class="banner paused">
      <strong>Paused.</strong>
      <span>The rings are holding station.</span>
      <span class="next"><Kbd>{key('pause')}</Kbd> or <Kbd>Esc</Kbd> to go on.</span>
    </div>
  {:else if game.phase === 'cleared'}
    <div class="banner">
      <strong>Stage clear.</strong>
      <span>The rings hold. {compact(game.salvage)} salvage recovered.</span>
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
          End of the authored stages. <Kbd>R</Kbd> to run it again.
        </span>
      {/if}
    </div>
  {:else if game.phase === 'overwhelmed'}
    <div class="banner lost">
      <strong>The Perihelion has stopped.</strong>
      <span>Output exhausted. Nothing is lost but the shift.</span>
      <span class="next"><Kbd>R</Kbd> to wind it again.</span>
    </div>
  {/if}
</div>

<style>
  .hud {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: var(--z-hud);
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

  .output {
    min-width: 15rem;
  }

  .flare {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    width: 11rem;
    padding: 0.45rem 1rem;
    background: rgba(11, 10, 8, 0.8);
    border: 1px solid var(--corona-dim);
    border-radius: var(--radius);
    opacity: 0.55;
    transition: opacity 120ms linear;
  }

  .flare.ready {
    opacity: 1;
    border-color: var(--corona);
  }

  .flare-label {
    font-size: 0.65rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .pips {
    display: flex;
    gap: 0.3rem;
  }

  .pip {
    width: 10px;
    height: 10px;
    background: var(--well);
    border: 1px solid var(--corona-dim);
    border-radius: 50%;
  }

  .pip.filled {
    background: var(--corona);
    border-color: var(--corona);
  }

  .hint {
    margin: 0;
    color: var(--muted);
    font-size: 0.7rem;
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
    border: 1px solid var(--corona-dim);
    border-radius: var(--radius);
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
    color: var(--danger);
  }

  .of {
    color: var(--muted);
    opacity: 0.7;
  }

  .sep {
    margin-top: 0.35rem;
    padding-top: 0.35rem;
    border-top: 1px solid var(--corona-dim);
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
    border: 1px solid var(--corona);
    border-radius: 0.4rem;
  }

  .banner strong {
    color: var(--corona);
    font-size: 1.1rem;
    letter-spacing: 0.06em;
  }

  .banner span {
    color: var(--muted);
  }

  .banner .reward {
    color: var(--corona);
  }

  .banner .next {
    color: var(--muted);
    font-size: 0.75rem;
  }

  .banner.held {
    border-color: var(--corona-dim);
  }

  .banner.held strong {
    color: var(--text);
  }

  .banner-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.6rem;
    pointer-events: auto;
  }

  .controls {
    display: flex;
    margin-top: 0.5rem;
    pointer-events: auto;
  }

  .controls button {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.55rem;
    font: inherit;
    font-size: 0.68rem;
    color: var(--muted);
    background: rgba(11, 10, 8, 0.8);
    border: 1px solid var(--corona-dim);
    border-radius: 0.25rem;
    cursor: pointer;
    transition: color 120ms linear, border-color 120ms linear;
  }

  .controls button:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--corona);
  }

  .controls button:disabled {
    color: var(--inert);
    cursor: default;
  }

  .controls button:focus-visible {
    outline: 2px solid var(--corona);
    outline-offset: 2px;
  }

  .controls .on {
    color: var(--corona);
    border-color: var(--corona);
  }

  .banner.paused {
    border-color: var(--corona-dim);
  }

  .banner.paused strong {
    color: var(--text);
  }

  .banner.lost {
    border-color: var(--danger);
  }

  .banner.lost strong {
    color: var(--danger);
  }
</style>
