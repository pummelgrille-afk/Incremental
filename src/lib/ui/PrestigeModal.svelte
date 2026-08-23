<script lang="ts">
  import { game } from '../stores/game.svelte'
  import { plural, t } from '../stores/i18n.svelte'
  import Modal from './primitives/Modal.svelte'
  import Button from './primitives/Button.svelte'
  import Stat from './primitives/Stat.svelte'

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

<Modal open={open && preview !== null} title={t('term.rewind')} width="34rem" onclose={close}>
  {#if preview}
    <p class="voice">{t('rewind.voice')}</p>

    <div class="award" class:none={preview.award <= 0}>
      <Stat label={t('term.recollection')} tone="loud" inline>+{preview.award}</Stat>
      <span class="after">
        {t('rewind.after', { before: game.recollection, after: preview.after })}
      </span>
    </div>

    <div class="columns">
      <section class="keeps">
        <h3>{t('rewind.kept')}</h3>
        <ul>
          <li>{t('rewind.kept.clearance', { count: preview.keeps.clearance })}</li>
          <li>{t('rewind.kept.units', { count: preview.keeps.unlockedUnits })}</li>
          <li>{t('rewind.kept.nodes', { count: preview.keeps.nodes })}</li>
          <li>{plural('rewind.kept.zones', preview.keeps.zones)}</li>
          <li>{t('rewind.kept.rest')}</li>
        </ul>
        <p class="note">{t('rewind.kept.note')}</p>
      </section>

      <section class="resets">
        <h3>{t('rewind.reset')}</h3>
        <ul>
          <li>{t('rewind.reset.salvage', { count: preview.resets.salvage })}</li>
          <li>
            {t('rewind.reset.units', {
              platforms: preview.resets.platforms,
              arrays: preview.resets.arrays,
            })}
          </li>
          <li>{t('rewind.reset.stage')}</li>
          <li>{t('rewind.reset.repairs')}</li>
        </ul>
        <p class="note">{t('rewind.reset.note')}</p>
      </section>
    </div>

    {#if preview.refusedBecause === 'no-award'}

      <p class="blocked">
        {t('rewind.no-award', { depth: preview.depth, threshold: preview.threshold })}
      </p>
    {:else if preview.refusedBecause === 'locked'}
      <p class="blocked">{t('rewind.locked')}</p>
    {/if}
  {/if}

  {#snippet footer()}
    <Button variant="ghost" onclick={close}>{t('rewind.not-yet')}</Button>
    {#if confirming}
      <Button variant="danger" onclick={commit}>{t('rewind.confirm')}</Button>
    {:else}
      <Button disabled={!preview?.canRewind} onclick={() => (confirming = true)}>
        {t('rewind.commit', { award: preview?.award ?? 0 })}
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
