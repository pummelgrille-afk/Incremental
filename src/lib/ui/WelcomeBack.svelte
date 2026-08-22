<script lang="ts">
  import { game } from '../stores/game.svelte'
  import Modal from './primitives/Modal.svelte'
  import Button from './primitives/Button.svelte'
  import Stat from './primitives/Stat.svelte'

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

<Modal
  open={summary !== null}
  title="The orbits kept turning"
  label="While you were away"
  width="26rem"
  onclose={dismiss}
>
  {#if summary}
    <p class="voice">
      {duration(summary.elapsedSeconds)} away. Somebody covered the watch,
      after a fashion.
    </p>

    <div class="earned">
      <Stat label="Salvage" tone="loud" inline>+{summary.salvage}</Stat>
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
  {/if}

  {#snippet footer()}
    <Button block onclick={dismiss}>Back to it</Button>
  {/snippet}
</Modal>

<style>
  .voice {
    margin: 0 0 1rem;
    color: var(--muted);
    font-style: italic;
    line-height: 1.5;
  }

  .earned {
    padding: 0.7rem 0.9rem;
    border: 1px solid var(--corona-dim);
    border-radius: var(--radius);
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
</style>
