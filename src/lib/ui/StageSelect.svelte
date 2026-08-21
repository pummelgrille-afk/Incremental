<script lang="ts">
  import { game } from '../stores/game.svelte'

  /**
   * The progression map.
   *
   * Reads a projection the store publishes from `progression/map.ts` — which
   * stages are enterable is a progression rule, and a rule expressed in a
   * template is a rule nothing can test.
   *
   * Locked zones are shown, not hidden. A player should be able to see that
   * there is more out there and roughly how much; hiding it turns a ladder into
   * a corridor and removes the reason to finish the zone they are on.
   */

  let { open = false }: { open?: boolean } = $props()

  function enter(address: string, unlocked: boolean): void {
    if (!unlocked) return
    game.requestedStage = address
  }
</script>

{#if open}
  <div class="scrim" role="presentation" onclick={() => (game.showMap = false)}>
    <div
      class="panel"
      role="dialog"
      aria-modal="true"
      aria-label="Stage select"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <header>
        <h2>The Perihelion</h2>
        <span class="sub">
          {game.map.filter((z) => z.cleared).length} of {game.map.length} zones cleared
        </span>
      </header>

      <div class="zones">
        {#each game.map as zone (zone.id)}
          <section class="zone" class:locked={!zone.unlocked}>
            <div class="head">
              <h3>{zone.name}</h3>
              <span class="count">
                {#if zone.unlocked}
                  {zone.clearedCount}/{zone.stageCount}
                {:else}
                  Locked
                {/if}
              </span>
            </div>

            {#if zone.unlocked}
              <p class="epigraph">
                {zone.epigraph}
                <span class="attrib">— {zone.epigraphAttribution}</span>
              </p>

              <ul class="stages">
                {#each zone.stages as stage (stage.address)}
                  <li>
                    <button
                      class="stage"
                      class:cleared={stage.cleared}
                      class:boss={stage.isBoss}
                      class:current={stage.address === game.currentStage}
                      disabled={!stage.unlocked}
                      onclick={() => enter(stage.address, stage.unlocked)}
                    >
                      <span class="index">{stage.scalingIndex}</span>
                      <span class="name">{stage.name}</span>
                      {#if stage.isBoss}<span class="tag">Encounter</span>{/if}
                      {#if stage.cleared}<span class="tick" aria-label="cleared">✓</span>{/if}
                    </button>
                  </li>
                {/each}
              </ul>
            {:else}
              <!-- Named but not described. Knowing a place exists is the
                   incentive; knowing what is in it is the reward. -->
              <p class="sealed">Requires the previous zone.</p>
            {/if}
          </section>
        {/each}
      </div>

      <button class="close" onclick={() => (game.showMap = false)}>Back to it</button>
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(6, 6, 8, 0.72);
    display: grid;
    place-items: center;
    z-index: 20;
  }

  .panel {
    width: min(46rem, 92vw);
    max-height: 86vh;
    overflow-y: auto;
    padding: 1.2rem 1.4rem 1.4rem;
    background: rgba(11, 10, 8, 0.98);
    border: 1px solid var(--brass);
    border-radius: 0.4rem;
  }

  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    border-bottom: 1px solid var(--brass-dim);
    padding-bottom: 0.6rem;
    margin-bottom: 0.9rem;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--brass);
  }

  .sub {
    font-size: 0.72rem;
    color: var(--muted);
  }

  .zone {
    margin-bottom: 1.1rem;
  }

  .zone.locked {
    opacity: 0.45;
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.8rem;
  }

  h3 {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text);
  }

  .count {
    font-size: 0.7rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .epigraph {
    margin: 0.25rem 0 0.55rem;
    font-size: 0.72rem;
    font-style: italic;
    line-height: 1.45;
    color: var(--muted);
  }

  .attrib {
    font-style: normal;
    white-space: nowrap;
  }

  .sealed {
    margin: 0.3rem 0 0;
    font-size: 0.72rem;
    color: var(--muted);
  }

  .stages {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
    gap: 0.3rem;
  }

  .stage {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.4rem 0.55rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--brass-dim);
    border-radius: 0.25rem;
    color: var(--text);
    font: inherit;
    font-size: 0.74rem;
    text-align: left;
    cursor: pointer;
  }

  .stage:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .stage:not(:disabled):hover {
    border-color: var(--brass);
  }

  .stage.current {
    border-color: var(--brass);
    background: rgba(255, 255, 255, 0.07);
  }

  .stage.boss .name {
    color: var(--brass);
  }

  .index {
    min-width: 1.4rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tag {
    font-size: 0.58rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--brass);
  }

  .tick {
    color: var(--brass);
  }

  .close {
    margin-top: 0.4rem;
    padding: 0.45rem 0.9rem;
    background: transparent;
    border: 1px solid var(--brass);
    border-radius: 0.25rem;
    color: var(--text);
    font: inherit;
    font-size: 0.76rem;
    cursor: pointer;
  }
</style>
