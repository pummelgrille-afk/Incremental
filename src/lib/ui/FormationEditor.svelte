<script lang="ts">
  import { game, type RosterView } from '../stores/game.svelte'
  import { RIM_MOUNTS, RIM_RADIUS, RINGS } from '../content/field'
  import Overlay from './primitives/Overlay.svelte'
  import Button from './primitives/Button.svelte'
  import Kbd from './primitives/Kbd.svelte'
  import Tooltip from './primitives/Tooltip.svelte'

  /**
   * The formation editor.
   *
   * Phase 18 built the read-only half of this file — the synergy preview
   * combat-spec.md §3 calls a hard requirement. Phase 24 adds the editing half
   * around it, which is the right place for it: the preview *is* the planning
   * information you want while arranging, not a separate readout.
   *
   * The slot ring is **HTML, not SVG**, unlike the Almanac. Drag and
   * drop, focus and keyboard handling all come free on real elements, and the
   * layout is thirty positioned circles rather than a graph — none of the
   * reasons the tree needed SVG apply.
   *
   * Slots are drawn at their **formation** angle, not their live rotated one.
   * A slot is a fixed address in the machine; showing it spinning would make
   * the thing you are editing a moving target.
   */

  let { open = false }: { open?: boolean } = $props()

  const CENTRE = 250
  const MOUNT_RADIUS = 232

  /*
   * Editor radii are the field's own radii, scaled to fit the box — not a
   * second table. The hand-written `{ 1: 78, 2: 132, 3: 186 }` this replaces
   * had no entry for a fourth orbit, so adding one put every slot on it at
   * NaN. A layout table that has to be kept in step with content/field.ts is a
   * table that will eventually fall out of step with it.
   */
  const editorRadius = (radius: number) => (radius / RIM_RADIUS) * MOUNT_RADIUS

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
        x: CENTRE + Math.cos(angle) * editorRadius(ring.radius),
        y: CENTRE + Math.sin(angle) * editorRadius(ring.radius),
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
      if (held.unit.kind === 'array') return
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

    if (held.kind === 'roster' && held.unit.kind === 'array') {
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
    'not-unlocked': 'Not unlocked yet — buy it with Clearance first.',
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

  // --- The unit card. ------------------------------------------------------
  //
  // A roster row says a name, a level and a price, none of which answers "what
  // does this one *do*". The card does, on hover and on keyboard focus.
  //
  // Positioned by measurement rather than by CSS: the panel it lives in scrolls
  // and clips its overflow, so a card anchored inside a row would be cut off at
  // the top and bottom of the list. Fixed positioning takes it out of that box.

  const CARD_WIDTH = 260

  let inspecting = $state<{ unit: RosterView; anchor: DOMRect } | null>(null)

  function inspect(event: { currentTarget: EventTarget | null }, unit: RosterView) {
    const row = event.currentTarget as HTMLElement | null
    if (!row) return
    // Only the rectangle. Where a card fits beside it is the primitive's
    // problem, and it is the half this file used to get wrong: it clamped
    // against a hardcoded 250px guess at its own height, which was right for a
    // fielded unit and short for a locked one, whose extra paragraph ran off
    // the bottom of the window.
    inspecting = { unit, anchor: row.getBoundingClientRect() }
  }

  const ROLE_COPY: Record<string, string> = {
    tank: 'Tank — soaks hits and blocks the widest arc.',
    damage: 'Damage — its whole case is the number it puts out.',
    support: 'Support — improves what the rest of the formation does.',
    control: 'Control — slows, disables and buys the line time.',
  }

  const TARGETING_COPY: Record<string, string> = {
    nearest: 'shoots whatever is closest',
    lowestHp: 'finishes the most wounded',
    highestThreat: 'answers the biggest threat',
    deepest: 'takes whatever is furthest in',
    none: 'never attacks',
  }

  const CONJUNCTION_COPY: Record<string, string> = {
    damagePulse: 'a damage pulse across the field',
    shield: 'a shield on itself',
    haste: 'attack speed on itself',
    repair: 'repairs on every participant',
  }

  /** One decimal for the small numbers, none for the large ones. */
  const stat = (value: number) => (value >= 10 ? Math.round(value) : value.toFixed(1))

  const PAIRING_COPY = {
    matched: 'One damage type throughout. Conjunction effects are amplified.',
    interference: 'Opposed types aligned. Effects are weaker but reach further.',
    mixed: 'No amplification either way. Conjunction effects are unmodified.',
  } as const

  const countdown = $derived(
    game.secondsToConjunction === null ? null : game.secondsToConjunction.toFixed(1),
  )
</script>

<Overlay
  {open}
  title="Formation"
  balances={[
    { label: 'Salvage', value: game.salvage },
    { label: 'Clearance', value: game.clearance },
  ]}
  ondragover={(e) => e.preventDefault()}
  ondrop={(e) => {
    e.preventDefault()
    dropOutside()
  }}
>
  {#snippet hint()}
    <Kbd>F</Kbd> to close · drag a unit onto a slot
  {/snippet}

    <section class="field">
      <div class="ring-plan" style:width="{CENTRE * 2}px" style:height="{CENTRE * 2}px">
        {#each RINGS as ring (ring.index)}
          <div
            class="ring-guide"
            style:width="{editorRadius(ring.radius) * 2}px"
            style:height="{editorRadius(ring.radius) * 2}px"
          ></div>
        {/each}
        <div class="sun">Sun</div>

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
          {@const array = mounts.get(pos.mount)}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div
            class="slot mount"
            class:filled={array !== undefined}
            class:hovered={hovered === `m${pos.mount}`}
            style:left="{pos.x}px"
            style:top="{pos.y}px"
            role="button"
            tabindex="0"
            draggable={array !== undefined}
            title="Rim mount {pos.mount}{array ? ` — ${array.name}` : ''}"
            ondragstart={() => {
              if (array) carried = { kind: 'mount', mount: pos.mount, defId: array.defId }
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
            {#if array}<span class="initial">{array.name.slice(0, 2)}</span>{/if}
          </div>
        {/each}
      </div>

      <p class="costs">
        Next Platform slot <strong>{game.nextSlotCost}</strong> ·
        next Array mount <strong>{game.nextMountCost}</strong> Salvage.
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
          <p class="note">Needs two Platforms on <em>different</em> rings.</p>
        {:else}
          <span class="value">{countdown}s</span>
          <p class="note">{PAIRING_COPY[game.pairing]}</p>
        {/if}
      </div>

      <h3>Roster</h3>
      <ul class="roster">
        {#each [...game.platformRoster, ...game.arrayRoster] as unit (unit.kind + unit.id)}
          {@const fieldCost = unit.kind === 'array' ? game.nextMountCost : game.nextSlotCost}
          <li
            class:locked={!unit.unlocked}
            draggable={unit.unlocked}
            ondragstart={() => {
              carried = { kind: 'roster', unit }
              inspecting = null
            }}
            ondragend={() => (carried = null)}
            onmouseenter={(e) => inspect(e, unit)}
            onmouseleave={() => (inspecting = null)}
            onfocusin={(e) => inspect(e, unit)}
            onfocusout={() => (inspecting = null)}
          >
            <span class="name">
              {unit.name}
              {#if unit.kind === 'array'}<span class="kind">array</span>{/if}
            </span>

            {#if unit.unlocked}
              <!-- What fielding it costs, where the decision is made. The
                   price is the formation's next slot rather than the unit —
                   the summary under the ring says so — but a player reading a
                   roster wants the number beside the thing they are about to
                   drag, not underneath the diagram. -->
              <span
                class="fieldcost"
                class:short={game.salvage < fieldCost}
                title="Fielding this costs {fieldCost} Salvage — the price of your next {unit.kind ===
                'array'
                  ? 'rim mount'
                  : 'ring slot'}. Moving a fielded unit is free."
              >
                {fieldCost}
              </span>
              <span class="level">lv {unit.level}</span>
              {#if unit.atMaxLevel}
                <span class="maxed">max</span>
              {:else}
                <Button
                  small
                  disabled={!unit.canLevel}
                  title="Level up for {unit.levelCost} Clearance"
                  onclick={() => game.formationActions?.levelUp(unit.kind, unit.id)}
                >
                  +{unit.levelCost}
                </Button>
              {/if}
            {:else}
              <Button
                small
                disabled={!unit.canUnlock}
                title="Unlock for {unit.unlockCost} Clearance"
                onclick={() => game.formationActions?.unlock(unit.kind, unit.id)}
              >
                {unit.unlockCost} Clearance
              </Button>
            {/if}
          </li>
        {/each}
      </ul>

      <h3>Arrays</h3>
      <!-- Arrays are *shaped*, not levelled: burst, sustain or punch, pulling
           against each other for the same Clearance. combat-spec.md §4. -->
      <ul class="support">
        {#each game.supportRoster as array (array.id)}
          <li class="unit" class:locked={!array.unlocked}>
            <span class="name">{array.name}</span>
            {#if array.unlocked}
              <span class="stats">
                {array.stats.maxCharge} charge · {array.stats.chargeInterval}s
              </span>
            {:else}
              <span class="stats">locked</span>
            {/if}
          </li>
          {#if array.unlocked}
            {#each array.tracks as track (track.track)}
              <li class="track">
                <span class="name">
                  {track.name}
                  <span class="kind">{track.effect}</span>
                </span>
                <span class="level">{track.level}/{track.maxLevel}</span>
                {#if track.atMax}
                  <span class="maxed">max</span>
                {:else}
                  <Button
                    small
                    disabled={!track.affordable}
                    title="{track.cost} Clearance"
                    onclick={() => game.formationActions?.buyTrack(array.id, track.track)}
                  >
                    +{track.cost}
                  </Button>
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
        <Button small onclick={commitPreset} disabled={presetName.trim().length === 0}>
          Save
        </Button>
      </div>
      <ul class="presets">
        {#each game.presetNames as name (name)}
          <li>
            <span class="name">{name}</span>
            <Button small onclick={() => game.formationActions?.loadPreset(name)}>Field</Button>
            <Button
              variant="ghost"
              small
              aria-label="Delete {name}"
              onclick={() => game.formationActions?.deletePreset(name)}
            >
              ✕
            </Button>
          </li>
        {:else}
          <li class="empty">Saved arrangements survive a Rewind.</li>
        {/each}
      </ul>
    </aside>

    {#if inspecting}
      {@const unit = inspecting.unit}
      <Tooltip anchor={inspecting.anchor} width={CARD_WIDTH}>
        <span class="card-kind">
          {unit.kind === 'array' ? 'Array · rim mount' : 'Platform · ring slot'} ·
          {unit.profile.damageType}
        </span>
        <h4>{unit.name}{#if unit.unlocked}<span class="level">lv {unit.level}</span>{/if}</h4>
        <p class="card-role">{ROLE_COPY[unit.profile.role] ?? unit.profile.role}</p>
        <p class="card-voice">{unit.profile.description}</p>

        <ul class="statline">
          <li><span>Attack</span><span>{stat(unit.profile.attack)}</span></li>
          <li><span>Every</span><span>{unit.profile.interval.toFixed(1)}s</span></li>
          <li><span>Integrity</span><span>{stat(unit.profile.maxHp)}</span></li>
          <li><span>Defence</span><span>{stat(unit.profile.defence)}</span></li>
        </ul>

        <p class="card-note">
          It {TARGETING_COPY[unit.profile.targeting] ?? unit.profile.targeting}.
          {#if unit.profile.conjunction}
            In a conjunction it contributes {CONJUNCTION_COPY[unit.profile.conjunction.kind] ??
              unit.profile.conjunction.kind}.
          {:else}
            Arrays never join a conjunction.
          {/if}
        </p>

        {#if !unit.unlocked}
          <p class="card-note card-locked">
            Locked. {unit.unlockCost} Clearance to add it to the roster; the stats above
            are what it opens at.
          </p>
        {/if}
      </Tooltip>
    {/if}
</Overlay>

<style>
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
  .sun {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    border-radius: 50%;
  }

  .ring-guide {
    border: 1px dashed var(--inert);
  }

  .sun {
    width: 54px;
    height: 54px;
    display: grid;
    place-items: center;
    font-size: 0.55rem;
    color: var(--muted);
    border: 1px solid var(--corona-dim);
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
    border-color: var(--corona);
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
    background: var(--corona);
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
    color: var(--warn);
  }

  .side {
    padding: 1rem 1.1rem;
    border-left: 1px solid var(--corona-dim);
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
    color: var(--corona);
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
    color: var(--corona-dim);
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

  .fieldcost {
    font-variant-numeric: tabular-nums;
    color: var(--corona);
  }

  .fieldcost::after {
    content: ' slv';
    font-size: 0.6rem;
    color: var(--muted);
  }

  /* Dimmed rather than hidden when it cannot be paid: the price is the thing
     the player is deciding against, so it has to stay readable. */
  .fieldcost.short {
    color: #7a6a48;
  }

  .card-kind {
    display: block;
    font-size: 0.6rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }

  h4 {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    margin: 0.2rem 0 0.35rem;
    font-size: 0.9rem;
    color: var(--text);
  }

  .card-role {
    margin: 0 0 0.4rem;
    color: var(--corona);
    line-height: 1.4;
  }

  .card-voice {
    margin: 0 0 0.6rem;
    color: var(--muted);
    font-style: italic;
    line-height: 1.45;
  }

  .statline {
    margin: 0 0 0.5rem;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.1rem 0.8rem;
  }

  .statline li {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0;
    border: none;
  }

  .statline span:first-child {
    color: var(--muted);
    font-size: 0.68rem;
  }

  .statline span:last-child {
    font-variant-numeric: tabular-nums;
    color: var(--text);
  }

  .card-note {
    margin: 0;
    color: var(--muted);
    line-height: 1.45;
  }

  .card-locked {
    margin-top: 0.5rem;
    color: var(--warn);
  }

  .level {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .maxed {
    color: var(--corona);
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
    border: 1px solid var(--corona-dim);
    border-radius: 0.2rem;
  }

</style>
