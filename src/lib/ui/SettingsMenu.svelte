<script lang="ts">
  import { game } from '../stores/game.svelte'
  import { ACTIONS } from '../content/keybindings'
  import { PALETTE_NAMES, type ColourblindPalette } from '../content/palettes'
  import { bindingLabel, conflictsWith } from '../core/keybindings'
  import { content, locale, t } from '../stores/i18n.svelte'
  import Modal from './primitives/Modal.svelte'
  import Button from './primitives/Button.svelte'
  import Field from './primitives/Field.svelte'
  import Toggle from './primitives/Toggle.svelte'
  import Slider from './primitives/Slider.svelte'
  import Choice from './primitives/Choice.svelte'
  import Kbd from './primitives/Kbd.svelte'

  let { open = false }: { open?: boolean } = $props()

  const actions = $derived(game.settingsActions)
  const s = $derived(game.settings)

  function close() {
    game.settingsActions?.beginRebind(null)
    game.showSettings = false
  }

  const PALETTE_OPTIONS = $derived(
    (['none', 'deuteranopia', 'protanopia', 'tritanopia'] as ColourblindPalette[]).map(
      (value) => ({ value, label: content('palette', value, 'name', PALETTE_NAMES[value]) }),
    ),
  )

  const TEXT_SCALES = $derived([
    { value: '0.875', label: t('settings.text-size.small') },
    { value: '1', label: t('settings.text-size.normal') },
    { value: '1.25', label: t('settings.text-size.large') },
    { value: '1.5', label: t('settings.text-size.largest') },
  ])

  const LANGUAGES = locale.all.map((l) => ({ value: l.code, label: l.endonym }))

  const GROUPS = [
    { id: 'Play', label: 'settings.keys.group.play' },
    { id: 'Panels', label: 'settings.keys.group.panels' },
    { id: 'System', label: 'settings.keys.group.system' },
  ] as const
  const bindable = ACTIONS.filter((a) => !a.fixed)

  let importing = $state(false)
  let importText = $state('')
  let importProblem = $state<string | null>(null)
  let exported = $state<string | null>(null)

  function doImport() {
    const problem = game.settingsActions?.importSave(importText.trim()) ?? t('save.error.unavailable')

    importProblem = problem
  }
</script>

<Modal {open} title={t('term.settings')} width="38rem" onclose={close}>
  <section>
    <h3>{t('settings.sound')}</h3>

    <Field label={t('settings.master')} for="vol-master" hint={t('settings.master.hint')}>
      <Slider
        id="vol-master"
        label={t('settings.master.label')}
        value={s.masterVolume}
        onchange={(v) => actions?.set('masterVolume', v)}
      />
    </Field>

    <Field label={t('settings.music')} for="vol-music" hint={t('settings.music.hint')}>
      <Slider
        id="vol-music"
        label={t('settings.music.label')}
        value={s.musicVolume}
        onchange={(v) => actions?.set('musicVolume', v)}
      />
    </Field>

    <Field label={t('settings.effects')} for="vol-sfx" hint={t('settings.effects.hint')}>
      <Slider
        id="vol-sfx"
        label={t('settings.effects.label')}
        value={s.sfxVolume}
        onchange={(v) => actions?.set('sfxVolume', v)}
      />
    </Field>
  </section>

  <section>
    <h3>{t('settings.legibility')}</h3>

    <Field label={t('settings.language')} for="language" hint={t('settings.language.hint')}>
      <Choice
        id="language"
        label={t('settings.language')}
        value={locale.code}
        options={LANGUAGES}
        onchange={(v) => actions?.set('locale', v)}
      />
    </Field>

    <Field
      label={t('settings.palette')}
      for="palette"
      hint={t('settings.palette.hint')}
    >
      <Choice
        id="palette"
        label={t('settings.palette')}
        value={s.colourblindPalette}
        options={PALETTE_OPTIONS}
        onchange={(v) => actions?.set('colourblindPalette', v as ColourblindPalette)}
      />
    </Field>

    <Field
      label={t('settings.text-size')}
      for="text-scale"
      hint={t('settings.text-size.hint')}
    >
      <Choice
        id="text-scale"
        label={t('settings.text-size')}
        value={String(s.textScale)}
        options={TEXT_SCALES}
        onchange={(v) => actions?.set('textScale', Number(v))}
      />
    </Field>

    <Field label={t('settings.shake')} for="shake" hint={t('settings.shake.hint')}>
      <Toggle
        id="shake"
        label={t('settings.shake')}
        checked={s.screenShake}
        onchange={(v) => actions?.set('screenShake', v)}
      />
    </Field>

    <Field
      label={t('settings.reduced-motion')}
      for="reduced-motion"
      hint={t('settings.reduced-motion.hint')}
    >
      {#snippet note()}
        {#if game.systemReducedMotion}

          <span class="forced">{t('settings.reduced-motion.forced')}</span>
        {/if}
      {/snippet}
      <Toggle
        id="reduced-motion"
        label={t('settings.reduced-motion')}
        checked={s.reducedMotion || game.systemReducedMotion}
        onchange={(v) => actions?.set('reducedMotion', v)}
      />
    </Field>

    <Field
      label={t('settings.diagnostics')}
      for="show-fps"
      hint={t('settings.diagnostics.hint')}
    >
      <Toggle
        id="show-fps"
        label={t('settings.diagnostics')}
        checked={s.showFps}
        onchange={(v) => actions?.set('showFps', v)}
      />
    </Field>
  </section>

  <section>
    <h3>{t('settings.keys')}</h3>
    <p class="aside">{t('settings.keys.aside')}</p>

    {#each GROUPS as group (group.id)}
      {@const rows = bindable.filter((a) => a.group === group.id)}
      {#if rows.length > 0}
        <h4>{t(group.label)}</h4>
        {#each rows as action (action.id)}
          {@const clashes = conflictsWith(action.id, game.keybindings)}
          <Field label={content('action', action.id, 'name', action.name)} for="bind-{action.id}">
            {#snippet note()}
              {#if clashes.length > 0}

                <span class="clash">
                  {t('settings.keys.clash', {
                    actions: clashes
                      .map((id) => {
                        const clash = ACTIONS.find((a) => a.id === id)
                        return clash ? content('action', clash.id, 'name', clash.name) : id
                      })
                      .join(', '),
                  })}
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
                {t('settings.keys.rebinding')}
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
        {t('settings.keys.reset')}
      </Button>
    </div>
  </section>

  <section>
    <h3>{t('settings.save')}</h3>
    <p class="aside">{t('settings.save.aside')}</p>

    <div class="row">
      <Button variant="ghost" small onclick={() => (exported = actions?.exportSave() ?? null)}>
        {t('settings.save.export')}
      </Button>
      <Button variant="ghost" small onclick={() => (importing = !importing)}>
        {t('settings.save.import')}
      </Button>
    </div>

    {#if exported}

      <label class="save-box" for="export-text">
        <span>{t('settings.save.exported')}</span>
        <textarea id="export-text" readonly rows="3" value={exported}></textarea>
      </label>
    {/if}

    {#if importing}
      <label class="save-box" for="import-text">
        <span>{t('settings.save.paste')}</span>
        <textarea
          id="import-text"
          rows="3"
          bind:value={importText}
          placeholder={t('settings.save.placeholder')}
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
          {t('settings.save.replace')}
        </Button>
      </div>
    {/if}
  </section>

  {#snippet footer()}
    <Button variant="ghost" onclick={close}>{t('common.back-to-it')}</Button>
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
