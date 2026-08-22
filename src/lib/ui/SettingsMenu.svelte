<script lang="ts">
  import { game } from '../stores/game.svelte'
  import { ACTIONS } from '../content/keybindings'
  import { PALETTE_NAMES, type ColourblindPalette } from '../content/palettes'
  import { bindingLabel, conflictsWith } from '../core/keybindings'
  import Modal from './primitives/Modal.svelte'
  import Button from './primitives/Button.svelte'
  import Field from './primitives/Field.svelte'
  import Toggle from './primitives/Toggle.svelte'
  import Slider from './primitives/Slider.svelte'
  import Choice from './primitives/Choice.svelte'
  import Kbd from './primitives/Kbd.svelte'

  /**
   * Settings.
   *
   * Four of the things on this screen — screen shake, reduced motion, the
   * palette and text scale — have been in `saveSchema.ts` since Phase 8 and
   * were read by **nothing** until this phase. They were not forgotten so much
   * as unreachable: there was no settings screen to put them on, so each phase
   * that could have connected one had no surface to connect it to.
   *
   * Nothing here decides anything. Every control calls through
   * `game.settingsActions`, because `bootstrap.ts` owns the save and a setting
   * this file could write directly would be a setting that could disagree with
   * the file it is supposed to live in.
   */

  let { open = false }: { open?: boolean } = $props()

  const actions = $derived(game.settingsActions)
  const s = $derived(game.settings)

  function close() {
    game.settingsActions?.beginRebind(null)
    game.showSettings = false
  }

  const PALETTE_OPTIONS = (
    ['none', 'deuteranopia', 'protanopia', 'tritanopia'] as ColourblindPalette[]
  ).map((value) => ({ value, label: PALETTE_NAMES[value] }))

  const TEXT_SCALES = [
    { value: '0.875', label: 'Small' },
    { value: '1', label: 'Normal' },
    { value: '1.25', label: 'Large' },
    { value: '1.5', label: 'Largest' },
  ]

  /** Rebindable actions, grouped in authored order. `menu` is fixed and hidden. */
  const GROUPS = ['Play', 'Panels', 'System'] as const
  const bindable = ACTIONS.filter((a) => !a.fixed)

  /** Import is a paste box rather than a file picker: it is one line of text. */
  let importing = $state(false)
  let importText = $state('')
  let importProblem = $state<string | null>(null)
  let exported = $state<string | null>(null)

  function doImport() {
    const problem = game.settingsActions?.importSave(importText.trim()) ?? 'Unavailable'
    // On success the page reloads and nothing below this line runs.
    importProblem = problem
  }
</script>

<Modal {open} title="Settings" width="38rem" onclose={close}>
  <section>
    <h3>Sound</h3>

    <Field label="Master" for="vol-master" hint="Everything, together.">
      <Slider
        id="vol-master"
        label="Master volume"
        value={s.masterVolume}
        onchange={(v) => actions?.set('masterVolume', v)}
      />
    </Field>

    <Field label="Music" for="vol-music" hint="The bed. It follows the field's intensity.">
      <Slider
        id="vol-music"
        label="Music volume"
        value={s.musicVolume}
        onchange={(v) => actions?.set('musicVolume', v)}
      />
    </Field>

    <Field label="Effects" for="vol-sfx" hint="Hits, the Flare, and the acknowledgements.">
      <Slider
        id="vol-sfx"
        label="Effects volume"
        value={s.sfxVolume}
        onchange={(v) => actions?.set('sfxVolume', v)}
      />
    </Field>
  </section>

  <section>
    <h3>Legibility</h3>

    <Field
      label="Colour palette"
      for="palette"
      hint="The default palette puts four of the colours you have to tell apart on the red–green axis. These do not."
    >
      <Choice
        id="palette"
        label="Colour palette"
        value={s.colourblindPalette}
        options={PALETTE_OPTIONS}
        onchange={(v) => actions?.set('colourblindPalette', v as ColourblindPalette)}
      />
    </Field>

    <Field label="Text size" for="text-scale" hint="Scales every panel and the HUD.">
      <Choice
        id="text-scale"
        label="Text size"
        value={String(s.textScale)}
        options={TEXT_SCALES}
        onchange={(v) => actions?.set('textScale', Number(v))}
      />
    </Field>

    <Field
      label="Screen shake"
      for="shake"
      hint="A short kick when the Sun takes damage. Nothing else in the game shakes."
    >
      <Toggle
        id="shake"
        label="Screen shake"
        checked={s.screenShake}
        onchange={(v) => actions?.set('screenShake', v)}
      />
    </Field>

    <Field
      label="Reduced motion"
      for="reduced-motion"
      hint="Turns off sparks, the screen shake and the animated counters. The field itself keeps moving — that is the game."
    >
      {#snippet note()}
        {#if game.systemReducedMotion}
          <!-- Said out loud, because otherwise the toggle looks broken. -->
          <span class="forced">on — your system asks for it</span>
        {/if}
      {/snippet}
      <Toggle
        id="reduced-motion"
        label="Reduced motion"
        checked={s.reducedMotion || game.systemReducedMotion}
        onchange={(v) => actions?.set('reducedMotion', v)}
      />
    </Field>

    <Field label="Diagnostics" for="show-fps" hint="Frame times, entity counts and budgets.">
      <Toggle
        id="show-fps"
        label="Diagnostics"
        checked={s.showFps}
        onchange={(v) => actions?.set('showFps', v)}
      />
    </Field>
  </section>

  <section>
    <h3>Keys</h3>
    <p class="aside">
      Bindings follow the physical key, not the letter printed on it — so the
      defaults keep their shape under your hand on any layout. Escape is fixed:
      it closes whatever is open, and there has to be a way back to this screen.
    </p>

    {#each GROUPS as group (group)}
      {@const rows = bindable.filter((a) => a.group === group)}
      {#if rows.length > 0}
        <h4>{group}</h4>
        {#each rows as action (action.id)}
          {@const clashes = conflictsWith(action.id, game.keybindings)}
          <Field label={action.name} for="bind-{action.id}">
            {#snippet note()}
              {#if clashes.length > 0}
                <!-- Surfaced, not refused. Doubling two panels onto one key is
                     a choice; the thing that was impossible before was seeing
                     that you had. -->
                <span class="clash">
                  also {clashes.map((id) => ACTIONS.find((a) => a.id === id)?.name).join(', ')}
                </span>
              {/if}
            {/snippet}

            <Button
              id="bind-{action.id}"
              variant="ghost"
              small
              onclick={() => actions?.beginRebind(action.id)}
            >
              {#if game.rebinding === action.id}
                press a key…
              {:else}
                <Kbd>{bindingLabel(game.keybindings[action.id] ?? '')}</Kbd>
              {/if}
            </Button>
          </Field>
        {/each}
      {/if}
    {/each}

    <div class="row">
      <Button variant="ghost" small onclick={() => actions?.resetBindings()}>
        Back to defaults
      </Button>
    </div>
  </section>

  <section>
    <h3>Your save</h3>
    <p class="aside">
      Everything is kept in this browser, on this machine. Clearing site data
      clears the game — a copy is the only backup there is.
    </p>

    <div class="row">
      <Button variant="ghost" small onclick={() => (exported = actions?.exportSave() ?? null)}>
        Copy out
      </Button>
      <Button variant="ghost" small onclick={() => (importing = !importing)}>
        Bring one in
      </Button>
    </div>

    {#if exported}
      <!-- Shown, not downloaded. A file the page hands the player is a file
           some browsers will refuse; a selectable string always works. -->
      <label class="save-box" for="export-text">
        <span>Select all and copy. This is the whole save.</span>
        <textarea id="export-text" readonly rows="3" value={exported}></textarea>
      </label>
    {/if}

    {#if importing}
      <label class="save-box" for="import-text">
        <span>Paste a save here. This replaces everything and reloads.</span>
        <textarea
          id="import-text"
          rows="3"
          bind:value={importText}
          placeholder="perihelion…"
        ></textarea>
      </label>
      {#if importProblem}<p class="problem">{importProblem}</p>{/if}
      <div class="row">
        <Button
          variant="danger"
          small
          disabled={importText.trim().length === 0}
          onclick={doImport}
        >
          Replace my save
        </Button>
      </div>
    {/if}
  </section>

  {#snippet footer()}
    <Button variant="ghost" onclick={close}>Back to it</Button>
  {/snippet}
</Modal>

<style>
  section + section {
    margin-top: 1.4rem;
  }

  h3 {
    margin: 0 0 0.2rem;
    font-size: 0.62rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--corona);
  }

  h4 {
    margin: 0.9rem 0 0;
    font-size: 0.68rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    color: var(--muted);
  }

  .aside {
    margin: 0.3rem 0 0.6rem;
    font-size: 0.72rem;
    line-height: 1.5;
    color: var(--muted);
  }

  .row {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.7rem;
  }

  .save-box {
    display: block;
    margin-top: 0.7rem;
  }

  .save-box span {
    display: block;
    margin-bottom: 0.25rem;
    font-size: 0.7rem;
    color: var(--muted);
  }

  textarea {
    width: 100%;
    padding: 0.4rem 0.5rem;
    font: inherit;
    font-size: 0.7rem;
    color: var(--text);
    background: var(--well);
    border: 1px solid var(--corona-dim);
    border-radius: 0.25rem;
    resize: vertical;
  }

  textarea:focus-visible {
    outline: 2px solid var(--corona);
    outline-offset: 1px;
  }

  .problem {
    margin: 0.4rem 0 0;
    font-size: 0.72rem;
    color: var(--warn);
  }

  .clash {
    color: var(--warn);
  }

  .forced {
    color: var(--corona);
  }
</style>
