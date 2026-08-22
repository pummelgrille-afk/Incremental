<script lang="ts">
  import { game } from '../stores/game.svelte'
  import Modal from './primitives/Modal.svelte'
  import Button from './primitives/Button.svelte'
  import Stat from './primitives/Stat.svelte'

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

<Modal open={open && preview !== null} title="Rewind" width="34rem" onclose={close}>
  {#if preview}
    <p class="voice">
      Wind it back to the first shift. You keep what you have learned; the
      floor does not.
    </p>

    <div class="award" class:none={preview.award <= 0}>
      <Stat label="Recollection" tone="loud" inline>+{preview.award}</Stat>
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
  {/if}

  {#snippet footer()}
    <Button variant="ghost" onclick={close}>Not yet</Button>
    {#if confirming}
      <Button variant="danger" onclick={commit}>Yes — wind it back</Button>
    {:else}
      <Button disabled={!preview?.canRewind} onclick={() => (confirming = true)}>
        Rewind for {preview?.award ?? 0}
      </Button>
    {/if}
  {/snippet}
</Modal>

<style>
  .voice {
    margin: 0 0 1rem;
    color: var(--muted);
    font-style: italic;
    line-height: 1.5;
  }

  .award {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--corona-dim);
    border-radius: var(--radius);
  }

  .award.none {
    border-color: #4a4438;
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
    color: var(--corona);
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
    color: var(--warn);
    background: rgba(240, 176, 108, 0.08);
    border-radius: 0.25rem;
    line-height: 1.5;
  }
</style>
