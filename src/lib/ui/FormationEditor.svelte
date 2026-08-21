<script lang="ts">
  import { game } from '../stores/game.svelte'

  /**
   * The synergy preview.
   *
   * combat-spec.md §3 calls time-to-next-conjunction **a hard requirement, not
   * a nice-to-have — without it the mechanic is invisible**. Conjunctions fire
   * on their own schedule and the player only ever *arranges* for them, so a
   * formation with no readout is a formation chosen blind.
   *
   * PLAN.md Phase 24 owns the editing half of this file — drag-and-drop, the
   * roster, saved loadouts. What is here is the part Phase 18 owes: read the
   * current arrangement and say what it is worth.
   */

  let { open = false }: { open?: boolean } = $props()

  const PAIRING_COPY = {
    matched: {
      title: 'Matched',
      detail: 'One damage type throughout. Conjunction effects are amplified.',
    },
    interference: {
      title: 'Interference',
      detail: 'Opposed types are aligned. Effects are weaker but reach further.',
    },
    mixed: {
      title: 'Mixed',
      detail: 'No amplification either way. Conjunction effects are unmodified.',
    },
  } as const

  const countdown = $derived(
    game.secondsToConjunction === null ? null : game.secondsToConjunction.toFixed(1),
  )
</script>

{#if open}
  <aside class="panel">
    <h2>Formation</h2>

    <div class="conjunction" class:imminent={(game.secondsToConjunction ?? 99) < 3}>
      <span class="label">Next conjunction</span>
      {#if countdown === null}
        <span class="value none">none scheduled</span>
        <p class="note">
          Conjunction needs two Movements on <em>different</em> rings. Same-ring
          units hold a fixed offset and never align.
        </p>
      {:else}
        <span class="value">{countdown}s</span>
      {/if}
    </div>

    <div class="pairing {game.pairing}">
      <span class="label">{PAIRING_COPY[game.pairing].title}</span>
      <p class="note">{PAIRING_COPY[game.pairing].detail}</p>
    </div>

    {#if game.shieldedUnits > 0 || game.hastedUnits > 0}
      <p class="active">
        {#if game.shieldedUnits > 0}<span>{game.shieldedUnits} shielded</span>{/if}
        {#if game.hastedUnits > 0}<span>{game.hastedUnits} hastened</span>{/if}
      </p>
    {/if}

    <ul class="slots">
      {#each game.formation as unit (unit.id)}
        <li>
          <span class="slot">R{unit.ring}·{unit.slot}</span>
          <span class="name">{unit.name}</span>
          <span class="type">{unit.damageType}</span>
          <span class="bonuses">
            {#if unit.attackBonus > 0}<b>+{Math.round(unit.attackBonus * 100)}% atk</b>{/if}
            {#if unit.defenceBonus > 0}<b>+{Math.round(unit.defenceBonus * 100)}% def</b>{/if}
            {#if unit.rangeBonus > 0}<b>+{Math.round(unit.rangeBonus * 100)}% rng</b>{/if}
          </span>
        </li>
      {:else}
        <li class="empty">No Movements slotted.</li>
      {/each}
    </ul>
  </aside>
{/if}

<style>
  .panel {
    position: fixed;
    top: 5.5rem;
    right: 1.25rem;
    width: 17rem;
    padding: 0.85rem 1rem;
    background: rgba(11, 10, 8, 0.92);
    border: 1px solid var(--brass-dim);
    border-radius: 0.4rem;
    font-size: 0.75rem;
    pointer-events: auto;
  }

  h2 {
    margin: 0 0 0.6rem;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .label {
    display: block;
    font-size: 0.65rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .conjunction .value {
    font-size: 1.5rem;
    font-variant-numeric: tabular-nums;
    color: var(--brass);
  }

  .conjunction .value.none {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .conjunction.imminent .value {
    color: var(--text);
  }

  .note {
    margin: 0.25rem 0 0;
    color: var(--muted);
    line-height: 1.4;
  }

  .pairing {
    margin-top: 0.75rem;
    padding-top: 0.6rem;
    border-top: 1px solid rgba(122, 100, 24, 0.35);
  }

  .pairing.matched .label {
    color: var(--brass);
  }

  .active {
    margin: 0.6rem 0 0;
    display: flex;
    gap: 0.5rem;
    color: var(--brass);
  }

  .slots {
    margin: 0.75rem 0 0;
    padding: 0.6rem 0 0;
    list-style: none;
    border-top: 1px solid rgba(122, 100, 24, 0.35);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .slots li {
    display: grid;
    grid-template-columns: 2.6rem 1fr auto;
    gap: 0.4rem;
    align-items: baseline;
  }

  .slot {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .type {
    color: var(--muted);
    font-size: 0.65rem;
  }

  .bonuses {
    grid-column: 2 / -1;
    display: flex;
    gap: 0.4rem;
    color: var(--brass-dim);
    font-size: 0.65rem;
  }

  .bonuses b {
    font-weight: 500;
  }

  .empty {
    display: block;
    color: var(--muted);
  }
</style>
