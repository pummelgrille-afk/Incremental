<script lang="ts">
  import { untrack } from 'svelte'
  import { game } from '../stores/game.svelte'
  import { bindingLabel } from '../core/keybindings'
  import { compact } from '../utils/format'
  import Modal from './primitives/Modal.svelte'
  import Button from './primitives/Button.svelte'
  import Stat from './primitives/Stat.svelte'
  import Kbd from './primitives/Kbd.svelte'

  /**
   * The menu, on Escape.
   *
   * PLAN.md Phase 43 asks for a main menu, and this game does not have the
   * screen that phrase usually means. There is no title screen and no New Game:
   * the save is the game, it loads in under a second, and P1 says the machine
   * runs without you — a front door you have to walk through to reach a
   * simulation that has been running all along would be an obstacle in front of
   * the pitch rather than an entrance to it.
   *
   * So the main menu is the **pause menu**: the one place that gathers what a
   * player needs from outside the run. Where you are, what you have, how to
   * stop it, how to change it, and where the save lives.
   *
   * It pauses while it is open, and it is the only screen that does. Every
   * other panel leaves the field running on purpose (ui-spec.md §3); this one
   * is the player saying *wait*, which is the one time it is right to.
   */

  let { open = false }: { open?: boolean } = $props()

  /*
   * Pause on open, resume on close — unless the player had already paused it
   * themselves, in which case closing the menu must not start the field moving
   * again behind them.
   *
   * `untrack` on the read is load-bearing, not tidiness: an effect that both
   * reads and writes `game.paused` re-runs on its own write, and Svelte stops
   * it with `effect_update_depth_exceeded` — which is what the first version of
   * this did. The only thing this effect may depend on is `open`.
   */
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

<Modal {open} title="The Perihelion" label="Menu" width="27rem" onclose={close}>
  {#snippet sub()}
    paused
  {/snippet}

  <div class="where">
    <Stat label="Shift" tone="quiet">
      {game.zoneName || '—'}{game.stageName ? ` · ${game.stageName}` : ''}
    </Stat>
    <Stat label="Salvage" tone="quiet">{compact(game.salvage)}</Stat>
    <Stat label="Recollection" tone="quiet">{compact(game.recollection)}</Stat>
  </div>

  <div class="items">
    <Button block onclick={close}>Back to the field</Button>
    <Button block variant="ghost" onclick={openSettings}>Settings</Button>
    <Button
      block
      variant="ghost"
      onclick={() => {
        close()
        game.showMap = true
      }}
    >
      The Perihelion
    </Button>
  </div>

  <p class="note">
    The field is stopped while this is open. <Kbd>{key('pause')}</Kbd> pauses
    without it; <Kbd>{key('manual')}</Kbd> opens the Manual;
    <Kbd>{key('restart')}</Kbd> restarts the stage. Nothing is lost but the
    shift.
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
