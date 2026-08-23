import type { MessageKey } from './en'
import type { ContentKey } from './content'

/**
 * Slots that cannot grow, and how many characters each of them holds.
 *
 * PLAN.md Phase 44 asks for QA of text overflow. Most of this game's chrome
 * wraps — a paragraph in a dialog can be twice as long and simply be taller —
 * and a budget on a slot that wraps is a rule with no failure mode. So this
 * table covers only the places where the CSS genuinely refuses to reflow:
 * `white-space: nowrap`, `text-overflow: ellipsis`, or a fixed-width tile.
 *
 * ## Where the numbers come from
 *
 * Each budget is the slot's usable width, at that slot's own font size, over an
 * average glyph advance of **0.55em** — a serviceable figure for Latin text in
 * this project's UI stack, and one that errs narrow, which is the safe
 * direction. Worked example, the sidebar tab:
 *
 *     tab width the field can spare      ~200px
 *     − horizontal padding (0.7rem × 2)  ~22px
 *     − keycap and gap                   ~34px
 *     = text                             ~144px
 *     ÷ (0.72rem × 0.55 = 6.3px/char)    ≈ 22 characters
 *
 * ## What the test does with them
 *
 * `tests/i18n.test.ts` checks the English **and its pseudolocale expansion**
 * against each budget. English fitting proves nothing about German; the
 * pseudolocale is what asserts the slot has room for a *translation*, at the
 * tiered expansion `pseudo.ts` models.
 *
 * A budget that fails is a question, not an answer. The three ways out, in
 * order of preference: let the slot wrap (what `Choice` did in this phase),
 * shorten the English, or widen the slot. Raising the number to make the test
 * pass is the one move that is never right — it does not move any pixels.
 */
export const BUDGETS: Partial<Record<MessageKey | ContentKey, number>> = {
  /*
   * Sidebar tabs. `.label` is nowrap, and the tab grows leftward over the
   * playing field — nothing clips, but a wide tab covers the thing it is a
   * shortcut to.
   */
  'sidebar.formation': 22,
  'sidebar.map': 22,
  'sidebar.tree': 22,
  'sidebar.rewind': 22,
  'sidebar.manual': 22,
  'sidebar.menu': 22,
  'sidebar.stand-down': 22,
  'sidebar.held': 22,

  /*
   * `Choice` options. The group wraps as of this phase, so the constraint is no
   * longer the row — it is the single option, which is still nowrap and must
   * fit the control column of a `Field` inside a 38rem dialog:
   *
   *     dialog 38rem − padding ≈ 518px, less a 12rem label column ≈ 326px
   *     less the option's own padding and border ≈ 20px
   *     ÷ (0.72rem × 0.55) ≈ 48 characters, taken at 28 to keep two per line
   */
  'settings.text-size.small': 28,
  'settings.text-size.normal': 28,
  'settings.text-size.large': 28,
  'settings.text-size.largest': 28,
  'palette.none.name': 28,
  'palette.deuteranopia.name': 28,
  'palette.protanopia.name': 28,
  'palette.tritanopia.name': 28,

  /*
   * The pause control, under the Output bar: a button and a keycap in the
   * HUD's top-left corner, which must not reach the Salvage readout beside it.
   */
  'hud.pause': 18,
  'hud.resume': 18,

  /*
   * Inline tags in a roster row. Each sits between the unit's name and its
   * price, and every character it takes comes out of the name.
   */
  'common.max': 16,
  'formation.kind.array': 16,
  'formation.array.locked': 16,

  /*
   * The boss marker on a stage tile. The tile is `minmax(11rem, 1fr)` and the
   * stage name beside it already ellipsises, so this one degrades rather than
   * breaking — but it degrades by eating a name the player is choosing from.
   */
  'map.encounter': 20,
}
