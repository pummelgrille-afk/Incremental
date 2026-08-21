<script lang="ts">
  import { game } from '../stores/game.svelte'

  /**
   * The Rewind — before and after.
   *
   * PLAN.md Phase 26 asks for "a clear before/after preview", and the numbers
   * are quoted from `progression/prestige.ts` rather than recomputed here, so
   * what the player is shown is what they get.
   *
   * The layout leads with what is **kept**, not what is lost. economy-spec.md §3
   * turns on a player believing they are not re-traversing cleared ground; a
   * modal that opened with a list of things being taken away would argue the
   * opposite of the design.
   */

  let { open = false }: { open?: boolean } = $props()

  let confirming = $state(false)

  const preview = $derived(game.rewindPreview)

  function close() {
    confirming = false
    game.showPrestige = false
  }

  function commit() {
    game.prestigeActions?.rewind()
    confirming = false
  }
</script>

<!-- Escape closes. Must sit outside the block: `<svelte:window>` cannot be
     nested inside an element or an `{#if}`. -->
<svelte:window onkeydown={(e) => open && e.key === 'Escape' && close()} />

{#if open && preview}
  <div class="scrim" role="presentation" onclick={close}>
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-label="Rewind"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <h2>Rewind</h2>
      <p class="voice">
        Wind it back to the first shift. You keep what you have learned; the
        floor does not.
      </p>

      <div class="award" class:none={preview.award <= 0}>
        <span class="label">Recollection</span>
        <span class="value">+{preview.award}</span>
        <span class="after">{game.recollection} → {preview.after}</span>
      </div>

      <div class="columns">
        <section class="keeps">
          <h3>Kept</h3>
          <ul>
            <li>{preview.keeps.clearance} Clearance</li>
            <li>{preview.keeps.unlockedUnits} unlocked units, with their levels</li>
            <li>{preview.keeps.nodes} Almanac nodes</li>
            <li>{preview.keeps.zones} zone{preview.keeps.zones === 1 ? '' : 's'} unlocked</li>
            <li>Achievements, settings, statistics</li>
          </ul>
          <p class="note">
            You never re-clear a zone to reach it again.
          </p>
        </section>

        <section class="resets">
          <h3>Reset</h3>
          <ul>
            <li>{preview.resets.salvage} Salvage</li>
            <li>
              {preview.resets.platforms} slotted Platforms,
              {preview.resets.arrays} mounted Arrays
            </li>
            <li>Stage progress this run</li>
            <li>Repairs and reinforcements</li>
          </ul>
          <p class="note">The opening formation is handed back.</p>
        </section>
      </div>

      {#if preview.refusedBecause === 'no-award'}
        <!-- The zero-award guard economy-spec.md §1 requires: never let a
             player burn a run for nothing, and say what the threshold is. -->
        <p class="blocked">
          This run reached stage {preview.depth}, which grants no Recollection.
          Reach stage {preview.threshold} and a Rewind starts paying.
        </p>
      {:else if preview.refusedBecause === 'locked'}
        <p class="blocked">The Rewind opens after the first boss is cleared.</p>
      {/if}

      <div class="actions">
        <button class="ghost" onclick={close}>Not yet</button>
        {#if confirming}
          <button class="danger" onclick={commit}>Yes — wind it back</button>
        {:else}
          <button disabled={!preview.canRewind} onclick={() => (confirming = true)}>
            Rewind for {preview.award}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(6, 6, 5, 0.8);
    pointer-events: auto;
    z-index: 20;
  }

  .modal {
    width: min(34rem, 92vw);
    padding: 1.4rem 1.5rem;
    background: var(--bg);
    border: 1px solid var(--brass-dim);
    border-radius: 0.4rem;
    font-size: 0.8rem;
  }

  h2 {
    margin: 0;
    font-size: 0.85rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--brass);
  }

  .voice {
    margin: 0.4rem 0 1rem;
    color: var(--muted);
    font-style: italic;
    line-height: 1.5;
  }

  .award {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--brass-dim);
    border-radius: 0.3rem;
  }

  .award.none {
    border-color: #4a4438;
  }

  .label {
    font-size: 0.62rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .value {
    font-size: 1.5rem;
    color: var(--brass);
    font-variant-numeric: tabular-nums;
  }

  .award.none .value {
    color: var(--muted);
  }

  .after {
    margin-left: auto;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.2rem;
    margin-top: 1rem;
  }

  h3 {
    margin: 0 0 0.4rem;
    font-size: 0.62rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .keeps h3 {
    color: var(--brass);
  }

  .resets h3 {
    color: var(--muted);
  }

  ul {
    margin: 0;
    padding-left: 1rem;
    line-height: 1.6;
  }

  .resets ul {
    color: var(--muted);
  }

  .note {
    margin: 0.5rem 0 0;
    color: var(--muted);
    font-size: 0.72rem;
    line-height: 1.45;
  }

  .blocked {
    margin: 1rem 0 0;
    padding: 0.6rem 0.7rem;
    color: #f0b06c;
    background: rgba(240, 176, 108, 0.08);
    border-radius: 0.25rem;
    line-height: 1.5;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1.2rem;
  }

  button {
    padding: 0.45rem 0.9rem;
    font: inherit;
    color: var(--bg);
    background: var(--brass);
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
  }

  button:disabled {
    background: #2a2620;
    color: var(--muted);
    cursor: default;
  }

  button.ghost {
    background: transparent;
    color: var(--muted);
    border: 1px solid var(--brass-dim);
  }

  button.danger {
    background: #f0b06c;
  }
</style>
