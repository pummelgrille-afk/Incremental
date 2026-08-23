<script lang="ts">
  import { untrack } from 'svelte'
  import { game } from '../stores/game.svelte'
  import { bindingLabel } from '../core/keybindings'
  import { compact } from '../utils/format'
  import { content, t } from '../stores/i18n.svelte'
  import Modal from './primitives/Modal.svelte'
  import Button from './primitives/Button.svelte'
  import Stat from './primitives/Stat.svelte'
  import Kbd from './primitives/Kbd.svelte'
  import T from './T.svelte'

  let { open = false }: { open?: boolean } = $props()

  $effect(() => {
    if (!open) return

    const alreadyPaused = untrack(() => game.paused)
    if (!alreadyPaused) game.paused = true

    return () => {
      if (!alreadyPaused) game.paused = false
    }
  })

  function close() {
    game.showMenu = false
  }

  function openSettings() {
    game.showSettings = true
  }

  const key = (action: 'pause' | 'manual' | 'restart') =>
    bindingLabel(game.keybindings[action] ?? '')
</script>

<Modal
  {open}
  title={t('term.perihelion')}
  label={t('menu.label')}
  width="27rem"
  onclose={close}
>
  {#snippet sub()}
    {t('menu.sub')}
  {/snippet}

  <div class="where">
    <Stat label={t('menu.shift')} tone="quiet">
      {game.zoneName ? content('zone', game.zoneId, 'name', game.zoneName) : '—'}{game.stageName
        ? ` · ${content('stage', game.stageAddress, 'name', game.stageName)}`
        : ''}
    </Stat>
    <Stat label={t('term.salvage')} tone="quiet">{compact(game.salvage)}</Stat>
    <Stat label={t('term.recollection')} tone="quiet">{compact(game.recollection)}</Stat>
  </div>

  <div class="items">
    <Button block onclick={close}>{t('menu.back-to-field')}</Button>
    <Button block variant="ghost" onclick={openSettings}>{t('term.settings')}</Button>
    <Button
      block
      variant="ghost"
      onclick={() => {
        close()
        game.showMap = true
      }}
    >
      {t('term.perihelion')}
    </Button>
  </div>

  <p class="note">
    <T key="menu.note">
      {#snippet pause()}<Kbd>{key('pause')}</Kbd>{/snippet}
      {#snippet manual()}<Kbd>{key('manual')}</Kbd>{/snippet}
      {#snippet restart()}<Kbd>{key('restart')}</Kbd>{/snippet}
    </T>
  </p>
</Modal>

<style>
  .where {
    display: flex;
    gap: 1.6rem;
    padding-bottom: 0.9rem;
    margin-bottom: 0.9rem;
    border-bottom: 1px solid rgba(122, 100, 24, 0.18);
  }

  .items {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .note {
    margin: 1rem 0 0;
    font-size: 0.72rem;
    line-height: 1.6;
    color: var(--muted);
  }
</style>
