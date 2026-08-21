<script lang="ts">
  import { game, type RosterView } from '../stores/game.svelte'
  import { RIM_MOUNTS, RINGS } from '../content/field'

  /**
   * The formation editor.
   *
   * Phase 18 built the read-only half of this file — the synergy preview
   * combat-spec.md §3 calls a hard requirement. Phase 24 adds the editing half
   * around it, which is the right place for it: the preview *is* the planning
   * information you want while arranging, not a separate readout.
   *
   * The slot ring is **HTML, not SVG**, unlike the Escapement Tree. Drag and
   * drop, focus and keyboard handling all come free on real elements, and the
   * layout is thirty positioned circles rather than a graph — none of the
   * reasons the tree needed SVG apply.
   *
   * Slots are drawn at their **formation** angle, not their live rotated one.
   * A slot is a fixed address in the machine; showing it spinning would make
   * the thing you are editing a moving target.
   */

  let { open = false }: { open?: boolean } = $props()

  const RADIUS = { 1: 78, 2: 132, 3: 186 } as const
  const MOUNT_RADIUS = 232
  const CENTRE = 250

  interface SlotPosition {
    ring: number
    slot: number
    x: number
    y: number
  }

  /** Every ring slot, positioned the way the field lays them out. */
  const slotPositions: SlotPosition[] = RINGS.flatMap((ring) =>
    Array.from({ length: ring.slots }, (_, slot) => {
      const angle = (slot / ring.slots) * Math.PI * 2 - Math.PI / 2
      return {
        ring: ring.index,
        slot,
        x: CENTRE + Math.cos(angle) * RADIUS[ring.index as 1 | 2 | 3],
        y: CENTRE + Math.sin(angle) * RADIUS[ring.index as 1 | 2 | 3],
      }
    }),
  )

  const mountPositions = Array.from({ length: RIM_MOUNTS }, (_, mount) => {
    const angle = (mount / RIM_MOUNTS) * Math.PI * 2 - Math.PI / 2
    return {
      mount,
      x: CENTRE + Math.cos(angle) * MOUNT_RADIUS,
      y: CENTRE + Math.sin(angle) * MOUNT_RADIUS,
    }
  })

  const occupied = $derived(new Map(game.fielded.map((f) => [`${f.ring}:${f.slot}`, f])))
  const mounts = $derived(new Map(game.mounted.map((m) => [m.slot, m])))

  // --- Dragging. -----------------------------------------------------------

  type Carried =
    | { kind: 'roster'; unit: RosterView }
    | { kind: 'slot'; ring: number; slot: number; defId: string }
    | { kind: 'mount'; mount: number; defId: string }

  let carried = $state<Carried | null>(null)
  let hovered = $state<string | null>(null)

  function dropOnSlot(ring: number, slot: number) {
    const held = carried
    carried = null
    hovered = null
    if (!held) return

    if (held.kind === 'roster') {
      if (held.unit.kind === 'chime') return
      game.formationActions?.place(held.unit.id, ring, slot)
    } else if (held.kind === 'slot') {
      game.formationActions?.place(held.defId, ring, slot, { ring: held.ring, slot: held.slot })
    }
  }

  function dropOnMount(mount: number) {
    const held = carried
    carried = null
    hovered = null
    if (!held) return

    if (held.kind === 'roster' && held.unit.kind === 'chime') {
      game.formationActions?.mount(held.unit.id, mount)
    }
  }

  /** Dropping a fielded unit outside any slot takes it off the field. */
  function dropOutside() {
    const held = carried
    carried = null
    hovered = null
    if (!held) return

    if (held.kind === 'slot') game.formationActions?.remove(held.ring, held.slot)
    else if (held.kind === 'mount') game.formationActions?.unmount(held.mount)
  }

  const REFUSAL_TEXT: Record<string, string> = {
    occupied: 'That slot is taken.',
    'not-unlocked': 'Not unlocked yet — buy it with Keys first.',
    unaffordable: 'Not enough to pay for that.',
    'invalid-slot': 'No such slot.',
    'preset-limit': 'No preset slots left. Delete one first.',
    partial: 'Some of that preset could not be fielded.',
  }

  // --- Presets. ------------------------------------------------------------

  let presetName = $state('')

  function commitPreset() {
    const name = presetName.trim()
    if (!name) return
    game.formationActions?.savePreset(name)
    presetName = ''
  }

  const PAIRING_COPY = {
    matched: 'One damage type throughout. Conjunction effects are amplified.',
    interference: 'Opposed types aligned. Effects are weaker but reach further.',
    mixed: 'No amplification either way. Conjunction effects are unmodified.',
  } as const

  const countdown = $derived(
    game.secondsToConjunction === null ? null : game.secondsToConjunction.toFixed(1),
  )
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="overlay"
    ondragover={(e) => e.preventDefault()}
    ondrop={(e) => {
      e.preventDefault()
      dropOutside()
    }}
  >
    <header>
      <h2>Formation</h2>
      <span class="balance">{Math.floor(game.filings)} Filings</span>
      <span class="balance">{game.keys} Keys</span>
      <span class="hint"><kbd>F</kbd> to close · drag a unit onto a slot</span>
    </header>

    <section class="field">
      <div class="ring-plan" style:width="{CENTRE * 2}px" style:height="{CENTRE * 2}px">
        {#each RINGS as ring (ring.index)}
          <div
            class="ring-guide"
            style:width="{RADIUS[ring.index as 1 | 2 | 3] * 2}px"
            style:height="{RADIUS[ring.index as 1 | 2 | 3] * 2}px"
          ></div>
        {/each}
        <div class="mainspring">Mainspring</div>

        {#each slotPositions as pos (pos.ring + ':' + pos.slot)}
          {@const unit = occupied.get(`${pos.ring}:${pos.slot}`)}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div
            class="slot"
            class:filled={unit !== undefined}
            class:hovered={hovered === `${pos.ring}:${pos.slot}`}
            style:left="{pos.x}px"
            style:top="{pos.y}px"
            role="button"
            tabindex="0"
            draggable={unit !== undefined}
            title="Ring {pos.ring}, slot {pos.slot}{unit ? ` — ${unit.name}` : ''}"
            ondragstart={() => {
              if (unit) carried = { kind: 'slot', ring: pos.ring, slot: pos.slot, defId: unit.defId }
            }}
            ondragover={(e) => {
              e.preventDefault()
              hovered = `${pos.ring}:${pos.slot}`
            }}
            ondragleave={() => (hovered = null)}
            ondrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              dropOnSlot(pos.ring, pos.slot)
            }}
            onkeydown={(e) => {
              if (e.key === 'Delete' || e.key === 'Backspace') {
                game.formationActions?.remove(pos.ring, pos.slot)
              }
            }}
          >
            {#if unit}
              <span class="initial">{unit.name.slice(0, 2)}</span>
              {#if unit.level > 1}<span class="lvl">{unit.level}</span>{/if}
            {/if}
          </div>
        {/each}

        {#each mountPositions as pos (pos.mount)}
          {@const chime = mounts.get(pos.mount)}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div
            class="slot mount"
            class:filled={chime !== undefined}
            class:hovered={hovered === `m${pos.mount}`}
            style:left="{pos.x}px"
            style:top="{pos.y}px"
            role="button"
            tabindex="0"
            draggable={chime !== undefined}
            title="Rim mount {pos.mount}{chime ? ` — ${chime.name}` : ''}"
            ondragstart={() => {
              if (chime) carried = { kind: 'mount', mount: pos.mount, defId: chime.defId }
            }}
            ondragover={(e) => {
              e.preventDefault()
              hovered = `m${pos.mount}`
            }}
            ondragleave={() => (hovered = null)}
            ondrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              dropOnMount(pos.mount)
            }}
            onkeydown={(e) => {
              if (e.key === 'Delete' || e.key === 'Backspace') {
                game.formationActions?.unmount(pos.mount)
              }
            }}
          >
            {#if chime}<span class="initial">{chime.name.slice(0, 2)}</span>{/if}
          </div>
        {/each}
      </div>

      <p class="costs">
        Next Movement slot <strong>{game.nextSlotCost}</strong> ·
        next Chime mount <strong>{game.nextMountCost}</strong> Filings.
        Moving a unit is free; taking one off refunds in full.
      </p>
      {#if game.lastRefusal}
        <p class="refusal">{REFUSAL_TEXT[game.lastRefusal] ?? game.lastRefusal}</p>
      {/if}
    </section>

    <aside class="side">
      <!-- The synergy preview, kept from Phase 18. It belongs beside the
           editor: this is the information you plan an arrangement with. -->
      <div class="synergy">
        <span class="label">Next conjunction</span>
        {#if countdown === null}
          <span class="value none">none scheduled</span>
          <p class="note">Needs two Movements on <em>different</em> rings.</p>
        {:else}
          <span class="value">{countdown}s</span>
          <p class="note">{PAIRING_COPY[game.pairing]}</p>
        {/if}
      </div>

      <h3>Roster</h3>
      <ul class="roster">
        {#each [...game.movementRoster, ...game.chimeRoster] as unit (unit.kind + unit.id)}
          <li
            class:locked={!unit.unlocked}
            draggable={unit.unlocked}
            ondragstart={() => (carried = { kind: 'roster', unit })}
            ondragend={() => (carried = null)}
          >
            <span class="name">
              {unit.name}
              {#if unit.kind === 'chime'}<span class="kind">chime</span>{/if}
            </span>

            {#if unit.unlocked}
              <span class="level">lv {unit.level}</span>
              {#if unit.atMaxLevel}
                <span class="maxed">max</span>
              {:else}
                <button
                  disabled={!unit.canLevel}
                  title="Level up for {unit.levelCost} Keys"
                  onclick={() => game.formationActions?.levelUp(unit.kind, unit.id)}
                >
                  +{unit.levelCost}
                </button>
              {/if}
            {:else}
              <button
                disabled={!unit.canUnlock}
                title="Unlock for {unit.unlockCost} Keys"
                onclick={() => game.formationActions?.unlock(unit.kind, unit.id)}
              >
                {unit.unlockCost} Keys
              </button>
            {/if}
          </li>
        {/each}
      </ul>

      <h3>Chimes</h3>
      <!-- Chimes are *shaped*, not levelled: burst, sustain or punch, pulling
           against each other for the same Keys. combat-spec.md §4. -->
      <ul class="support">
        {#each game.supportRoster as chime (chime.id)}
          <li class="unit" class:locked={!chime.unlocked}>
            <span class="name">{chime.name}</span>
            {#if chime.unlocked}
              <span class="stats">
                {chime.stats.maxCharge} charge · {chime.stats.chargeInterval}s
              </span>
            {:else}
              <span class="stats">locked</span>
            {/if}
          </li>
          {#if chime.unlocked}
            {#each chime.tracks as track (track.track)}
              <li class="track">
                <span class="name">
                  {track.name}
                  <span class="kind">{track.effect}</span>
                </span>
                <span class="level">{track.level}/{track.maxLevel}</span>
                {#if track.atMax}
                  <span class="maxed">max</span>
                {:else}
                  <button
                    disabled={!track.affordable}
                    title="{track.cost} Keys"
                    onclick={() => game.formationActions?.buyTrack(chime.id, track.track)}
                  >
                    +{track.cost}
                  </button>
                {/if}
              </li>
            {/each}
          {/if}
        {/each}
      </ul>

      <h3>Presets</h3>
      <div class="preset-new">
        <input
          bind:value={presetName}
          placeholder="Name this arrangement"
          maxlength="24"
          onkeydown={(e) => {
            if (e.key === 'Enter') commitPreset()
          }}
        />
        <button onclick={commitPreset} disabled={presetName.trim().length === 0}>Save</button>
      </div>
      <ul class="presets">
        {#each game.presetNames as name (name)}
          <li>
            <span class="name">{name}</span>
            <button onclick={() => game.formationActions?.loadPreset(name)}>Field</button>
            <button class="ghost" onclick={() => game.formationActions?.deletePreset(name)}>
              ✕
            </button>
          </li>
        {:else}
          <li class="empty">Saved arrangements survive a Rewind.</li>
        {/each}
      </ul>
    </aside>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(6, 6, 5, 0.94);
    display: grid;
    grid-template-columns: 1fr 20rem;
    grid-template-rows: auto 1fr;
    pointer-events: auto;
    z-index: 10;
    font-size: 0.78rem;
  }

  header {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.9rem 1.25rem;
    border-bottom: 1px solid var(--brass-dim);
  }

  h2 {
    margin: 0;
    font-size: 0.85rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--brass);
  }

  .balance {
    font-variant-numeric: tabular-nums;
  }

  .hint {
    margin-left: auto;
    font-size: 0.7rem;
    color: var(--muted);
  }

  .field {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    overflow: auto;
    padding: 1rem;
  }

  .ring-plan {
    position: relative;
    flex: none;
  }

  .ring-guide,
  .mainspring {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    border-radius: 50%;
  }

  .ring-guide {
    border: 1px dashed #2a2620;
  }

  .mainspring {
    width: 54px;
    height: 54px;
    display: grid;
    place-items: center;
    font-size: 0.55rem;
    color: var(--muted);
    border: 1px solid var(--brass-dim);
  }

  .slot {
    position: absolute;
    width: 30px;
    height: 30px;
    margin: -15px 0 0 -15px;
    border-radius: 50%;
    border: 1px dashed #3a352a;
    background: #14120e;
    display: grid;
    place-items: center;
    cursor: pointer;
  }

  .slot.mount {
    border-radius: 4px;
  }

  .slot.filled {
    border-style: solid;
    border-color: var(--brass);
    background: #241f14;
    cursor: grab;
  }

  .slot.hovered {
    border-color: #f0e6c8;
    background: #2e2818;
  }

  .initial {
    font-size: 0.62rem;
    color: var(--text);
    text-transform: uppercase;
  }

  .lvl {
    position: absolute;
    right: -3px;
    bottom: -3px;
    font-size: 0.5rem;
    color: var(--bg);
    background: var(--brass);
    border-radius: 50%;
    padding: 0 3px;
  }

  .costs {
    margin: 0;
    max-width: 30rem;
    text-align: center;
    color: var(--muted);
    line-height: 1.5;
  }

  .refusal {
    margin: 0;
    color: #f0b06c;
  }

  .side {
    padding: 1rem 1.1rem;
    border-left: 1px solid var(--brass-dim);
    overflow-y: auto;
  }

  .synergy {
    padding-bottom: 0.8rem;
    border-bottom: 1px solid rgba(122, 100, 24, 0.35);
  }

  .label {
    display: block;
    font-size: 0.62rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .value {
    font-size: 1.4rem;
    font-variant-numeric: tabular-nums;
    color: var(--brass);
  }

  .value.none {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .note {
    margin: 0.25rem 0 0;
    color: var(--muted);
    line-height: 1.45;
  }

  h3 {
    margin: 1rem 0 0.4rem;
    font-size: 0.62rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .roster li,
  .support li,
  .presets li {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0;
    border-bottom: 1px solid rgba(122, 100, 24, 0.18);
  }

  .roster li {
    cursor: grab;
  }

  .roster li.locked {
    cursor: default;
    color: var(--muted);
  }

  .roster .name,
  .support .name,
  .presets .name {
    flex: 1;
  }

  .support .track {
    padding-left: 0.7rem;
    border-bottom: none;
  }

  .support .track .name {
    color: var(--muted);
  }

  .support .stats {
    color: var(--brass-dim);
    font-size: 0.68rem;
    font-variant-numeric: tabular-nums;
  }

  .support .unit .name {
    color: var(--text);
  }

  .kind {
    color: var(--muted);
    font-size: 0.62rem;
  }

  .level {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .maxed {
    color: var(--brass);
    font-size: 0.62rem;
  }

  .empty {
    color: var(--muted);
    border: none;
  }

  .preset-new {
    display: flex;
    gap: 0.35rem;
  }

  input {
    flex: 1;
    min-width: 0;
    padding: 0.3rem 0.4rem;
    font: inherit;
    color: var(--text);
    background: #14120e;
    border: 1px solid var(--brass-dim);
    border-radius: 0.2rem;
  }

  button {
    padding: 0.25rem 0.5rem;
    font: inherit;
    font-size: 0.72rem;
    color: var(--bg);
    background: var(--brass);
    border: none;
    border-radius: 0.2rem;
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

  kbd {
    display: inline-block;
    padding: 0 0.25rem;
    border: 1px solid var(--brass-dim);
    border-radius: 0.2rem;
  }
</style>
