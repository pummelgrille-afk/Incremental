<script lang="ts">
  import { game } from '../stores/game.svelte'
  import { content, t } from '../stores/i18n.svelte'
  import Modal from './primitives/Modal.svelte'
  import Button from './primitives/Button.svelte'

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

  function close(): void {
    game.showMap = false
  }
</script>

<Modal
  {open}
  title={t('term.perihelion')}
  label={t('map.label')}
  width="46rem"
  onclose={close}
>
  {#snippet sub()}
    {t('map.sub', {
      cleared: game.map.filter((z) => z.cleared).length,
      total: game.map.length,
    })}
  {/snippet}

  {#each game.map as zone (zone.id)}
    <section class="zone" class:locked={!zone.unlocked}>
      <div class="head">
        <h3>{content('zone', zone.id, 'name', zone.name)}</h3>
        <span class="count">
          {#if zone.unlocked}
            {t('map.zone-progress', { cleared: zone.clearedCount, total: zone.stageCount })}
          {:else}
            {t('common.locked')}
          {/if}
        </span>
      </div>

      {#if zone.unlocked}
        <p class="epigraph">
          {content('epigraph', zone.id, 'description', zone.epigraph)}
          <span class="attrib">
            {t('map.attribution', {
              source: content('epigraph', zone.id, 'name', zone.epigraphAttribution),
            })}
          </span>
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
                <span class="name">{content('stage', stage.address, 'name', stage.name)}</span>
                {#if stage.isBoss}<span class="tag">{t('map.encounter')}</span>{/if}
                {#if stage.cleared}
                  <span class="tick" aria-label={t('map.cleared')}>✓</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <!-- Named but not described. Knowing a place exists is the
             incentive; knowing what is in it is the reward. -->
        <p class="sealed">{t('map.sealed')}</p>
      {/if}
    </section>
  {/each}

  {#snippet footer()}
    <Button variant="ghost" onclick={close}>{t('common.back-to-it')}</Button>
  {/snippet}
</Modal>

<style>
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

  /*
   * Not a `<Button>`. A stage is a place on a map, and the primitive's three
   * variants are all statements about *what an action does* — none of them
   * describes a destination that can be current, cleared, or sealed. Forcing it
   * through would mean a fourth variant used exactly once, which is how a
   * shared set stops being shared.
   */
  .stage {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.4rem 0.55rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--corona-dim);
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
    border-color: var(--corona);
  }

  .stage:focus-visible {
    outline: 2px solid var(--corona);
    outline-offset: 2px;
  }

  .stage.current {
    border-color: var(--corona);
    background: rgba(255, 255, 255, 0.07);
  }

  .stage.boss .name {
    color: var(--corona);
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
    color: var(--corona);
  }

  .tick {
    color: var(--corona);
  }
</style>
