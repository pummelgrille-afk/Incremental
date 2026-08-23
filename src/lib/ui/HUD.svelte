<script lang="ts">
  import { game } from '../stores/game.svelte'
  import { BUDGETS } from '../content/budgets'
  import { compact } from '../utils/format'
  import { bindingLabel } from '../core/keybindings'
  import type { ActionId } from '../content/keybindings'
  import { content, t } from '../stores/i18n.svelte'
  import Stat from './primitives/Stat.svelte'
  import Meter from './primitives/Meter.svelte'
  import Delta from './primitives/Delta.svelte'
  import Kbd from './primitives/Kbd.svelte'
  import Button from './primitives/Button.svelte'
  import T from './T.svelte'

  let { showDiagnostics = false }: { showDiagnostics?: boolean } = $props()

  const low = $derived(game.outputFraction < 0.3)

  const key = (action: ActionId) => bindingLabel(game.keybindings[action] ?? '')
</script>

<div class="hud">
  <header>
    <div class="output">
      <Stat label={t('term.output')}>
        {compact(game.output)} / {compact(game.maxOutput)}
        <Delta value={game.outputLoss} direction="loss" />
        <Delta value={game.outputGain} direction="gain" />
        {#snippet after()}

          <Meter
            label={t('term.output')}
            fraction={game.outputFraction}
            tone={low ? 'danger' : 'corona'}
            struck={game.outputLoss > 0}
          />
        {/snippet}
      </Stat>

      <div class="controls">
        <button
          class:on={game.paused}
          disabled={game.standby}
          onclick={() => (game.paused = !game.paused)}
        >
          {game.paused ? t('hud.resume') : t('hud.pause')}
          <Kbd>{key('pause')}</Kbd>
        </button>
      </div>
    </div>

    <Stat label={t('term.salvage')} tone="loud">
      {compact(game.salvage)}
      {#snippet after()}
        <Delta value={game.salvageGain} direction="gain" />
        <Delta value={game.salvageLoss} direction="loss" />
      {/snippet}
    </Stat>

    <Stat label={t('term.clearance')} tone="quiet">{compact(game.clearance)}</Stat>
    <Stat label={t('term.recollection')} tone="quiet">{compact(game.recollection)}</Stat>

    <Stat label={content('zone', game.zoneId, 'name', game.zoneName)}>
      {t('hud.wave', {
        stage: content('stage', game.stageAddress, 'name', game.stageName),
        current: game.waveNumber,
        total: game.waveCount,
      })}
    </Stat>
  </header>

  <footer>
    <div class="flare" class:ready={game.canStrike}>
      <span class="flare-label">{t('term.flare')}</span>
      <div class="pips">
        {#each Array(game.flareMaxCharge) as _, i (i)}
          <span class="pip" class:filled={i < game.flaresReady}></span>
        {/each}
      </div>

      <Meter
        label={t('hud.flare-charge')}
        fraction={game.flareProgress}
        tone={game.canStrike ? 'corona' : 'dim'}
        instant
      />
    </div>

    <p class="hint">
      <T key="hud.strike-hint">
        {#snippet flare()}<Kbd>{key('flare')}</Kbd>{/snippet}
      </T>
    </p>
  </footer>

  <!-- i18n-exempt: the diagnostics panel is a frame-time readout behind a
       setting, written for whoever is profiling the build rather than for a
       player. Translating "fps" and "over budget" would be paid work on a
       surface no player is meant to read. -->
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
  <!-- /i18n-exempt -->

  {#if game.standby}

    <div class="banner held">
      <strong>{t('hud.standby.title')}</strong>
      <span>{t('hud.standby.body')}</span>
      <span class="next">{t('hud.standby.next')}</span>
      <div class="banner-actions">
        <Button onclick={() => game.stageActions?.begin()}>{t('hud.standby.begin')}</Button>
        <Button variant="ghost" onclick={() => (game.showFormation = true)}>
          {t('term.formation')}
        </Button>
      </div>
    </div>
  {:else if game.paused}

    <div class="banner paused">
      <strong>{t('hud.paused.title')}</strong>
      <span>{t('hud.paused.body')}</span>
      <span class="next">
        <T key="hud.paused.next">
          {#snippet pause()}<Kbd>{key('pause')}</Kbd>{/snippet}

          {#snippet escape()}<Kbd>{key('menu')}</Kbd>{/snippet}
        </T>
      </span>
    </div>
  {:else if game.phase === 'cleared'}
    <div class="banner">
      <strong>{t('hud.cleared.title')}</strong>
      <span>{t('hud.cleared.body', { salvage: compact(game.salvage) })}</span>
      {#if game.lastClearanceAward}
        <span class="reward">
          {t(
            game.lastClearanceAward.zoneCompleted
              ? 'hud.cleared.award-zone'
              : 'hud.cleared.award',
            { clearance: game.lastClearanceAward.clearance },
          )}
        </span>
      {/if}

      {#if game.nextStageIn > 0}
        <span class="next">
          {t('hud.cleared.next-in', { seconds: Math.ceil(game.nextStageIn) })}
        </span>
      {:else}
        <span class="next">
          <T key="hud.cleared.end">
            {#snippet restart()}<Kbd>{key('restart')}</Kbd>{/snippet}
          </T>
        </span>
      {/if}
    </div>
  {:else if game.phase === 'overwhelmed'}
    <div class="banner lost">
      <strong>{t('hud.lost.title')}</strong>
      <span>{t('hud.lost.body')}</span>
      <span class="next">
        <T key="hud.lost.next">
          {#snippet restart()}<Kbd>{key('restart')}</Kbd>{/snippet}
        </T>
      </span>
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
