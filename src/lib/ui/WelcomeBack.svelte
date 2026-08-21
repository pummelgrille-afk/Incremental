<script lang="ts">
  import { game } from '../stores/game.svelte'

  /**
   * The "welcome back" summary.
   *
   * economy-spec.md §4 asks it to report elapsed time, Salvage earned, **and —
   * honestly — what was missed**: "telling the player they lost nothing when
   * they did is the kind of thing that erodes trust in an idle game's numbers."
   *
   * So this reports the shortfall against active play, names the three things
   * that cannot happen while away, and says plainly when time ran past the cap.
   * A summary that only showed the number going up would be the flattering
   * version, and the spec rules it out.
   */

  const summary = $derived(game.offlineSummary)

  function duration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)} seconds`
    const minutes = Math.round(seconds / 60)
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`
    const hours = seconds / 3600
    return `${hours.toFixed(hours < 10 ? 1 : 0)} hours`
  }

  const shortfall = $derived(
    summary && summary.activeEquivalent > summary.salvage
      ? summary.activeEquivalent - summary.salvage
      : 0,
  )

  function dismiss() {
    game.offlineSummary = null
  }
</script>

<svelte:window onkeydown={(e) => summary && e.key === 'Escape' && dismiss()} />

{#if summary}
  <div class="scrim" role="presentation" onclick={dismiss}>
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-label="While you were away"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <h2>The orbits kept turning</h2>
      <p class="voice">
        {duration(summary.elapsedSeconds)} away. Somebody covered the watch,
        after a fashion.
      </p>

      <div class="earned">
        <span class="value">+{summary.salvage}</span>
        <span class="label">Salvage</span>
      </div>

      <ul class="ledger">
        <li>
          <span>Counted</span>
          <span>{duration(summary.effectiveSeconds)}</span>
        </li>
        {#if summary.wastedSeconds > 0}
          <!-- Said plainly. Quietly dropping the overflow is the flattering
               version, and economy-spec.md §4 rules it out. -->
          <li class="missed">
            <span>Past the {duration(summary.capSeconds)} limit</span>
            <span>{duration(summary.wastedSeconds)} earned nothing</span>
          </li>
        {/if}
        {#if shortfall > 0}
          <li class="missed">
            <span>Had you been here</span>
            <span>about {shortfall} more</span>
          </li>
        {/if}
      </ul>

      <p class="note">
        Nothing else accrues while you are away: no conjunctions fire, no stages
        clear, and so <strong>no Clearance is earned</strong>. The station runs
        without you — just not as well.
      </p>

      <button onclick={dismiss}>Back to it</button>
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(6, 6, 5, 0.82);
    pointer-events: auto;
    z-index: 20;
  }

  .modal {
    width: min(26rem, 92vw);
    padding: 1.4rem 1.5rem;
    background: var(--bg);
    border: 1px solid var(--brass-dim);
    border-radius: 0.4rem;
    font-size: 0.8rem;
  }

  h2 {
    margin: 0;
    font-size: 0.85rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--brass);
  }

  .voice {
    margin: 0.4rem 0 1rem;
    color: var(--muted);
    font-style: italic;
    line-height: 1.5;
  }

  .earned {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.7rem 0.9rem;
    border: 1px solid var(--brass-dim);
    border-radius: 0.3rem;
  }

  .value {
    font-size: 1.7rem;
    color: var(--brass);
    font-variant-numeric: tabular-nums;
  }

  .label {
    font-size: 0.62rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .ledger {
    margin: 0.9rem 0 0;
    padding: 0;
    list-style: none;
  }

  .ledger li {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.25rem 0;
    border-bottom: 1px solid rgba(122, 100, 24, 0.18);
  }

  .ledger .missed {
    color: var(--muted);
  }

  .note {
    margin: 0.9rem 0 0;
    color: var(--muted);
    line-height: 1.5;
  }

  button {
    width: 100%;
    margin-top: 1.2rem;
    padding: 0.5rem;
    font: inherit;
    color: var(--bg);
    background: var(--brass);
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
  }
</style>
