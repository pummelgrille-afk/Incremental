<script lang="ts">
  import { game } from '../stores/game.svelte'
  import { plural, t } from '../stores/i18n.svelte'
  import Modal from './primitives/Modal.svelte'
  import T from './T.svelte'
  import Button from './primitives/Button.svelte'
  import Stat from './primitives/Stat.svelte'

  const summary = $derived(game.offlineSummary)

  function duration(seconds: number): string {
    if (seconds < 60) return t('duration.seconds', { count: Math.round(seconds) })
    const minutes = Math.round(seconds / 60)
    if (minutes < 60) return plural('duration.minutes', minutes)
    const hours = seconds / 3600
    return t('duration.hours', { count: hours.toFixed(hours < 10 ? 1 : 0) })
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
  title={t('offline.title')}
  label={t('offline.label')}
  width="26rem"
  onclose={dismiss}
>
  {#if summary}
    <p class="voice">
      {t('offline.voice', { duration: duration(summary.elapsedSeconds) })}
    </p>

    <div class="earned">
      <Stat label={t('term.salvage')} tone="loud" inline>+{summary.salvage}</Stat>
    </div>

    <ul class="ledger">
      <li>
        <span>{t('offline.counted')}</span>
        <span>{duration(summary.effectiveSeconds)}</span>
      </li>
      {#if summary.wastedSeconds > 0}

        <li class="missed">
          <span>{t('offline.over-cap', { duration: duration(summary.capSeconds) })}</span>
          <span>
            {t('offline.over-cap.value', { duration: duration(summary.wastedSeconds) })}
          </span>
        </li>
      {/if}
      {#if shortfall > 0}
        <li class="missed">
          <span>{t('offline.shortfall')}</span>
          <span>{t('offline.shortfall.value', { amount: shortfall })}</span>
        </li>
      {/if}
    </ul>

    <p class="note">
      <T key="offline.note">
        {#snippet emphasis()}<strong>{t('offline.note.emphasis')}</strong>{/snippet}
      </T>
    </p>
  {/if}

  {#snippet footer()}
    <Button block onclick={dismiss}>{t('common.back-to-it')}</Button>
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
