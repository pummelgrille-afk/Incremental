<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { MessageKey } from '../i18n/en'
  import type { MessageParams } from '../i18n/translate'
  import { parseMessage } from '../i18n/parts'
  import { raw } from '../stores/i18n.svelte'

  /**
   * A sentence with markup inside it.
   *
   * Most text is `{t('key')}` and needs nothing. This exists for the handful of
   * sentences that carry a keycap or an emphasised run *mid-clause*:
   *
   * ```svelte
   * <T key="hud.paused.next">
   *   {#snippet pause()}<Kbd>{key('pause')}</Kbd>{/snippet}
   *   {#snippet escape()}<Kbd>Esc</Kbd>{/snippet}
   * </T>
   * ```
   *
   * The alternative was cutting each of those into three keys and concatenating
   * them around the markup, which hands the translator two sentence fragments
   * and a word order they cannot change. Here the whole sentence is one string
   * with named holes, and a language that puts the verb last simply moves the
   * hole.
   *
   * A snippet named for the placeholder fills it; otherwise `values` does;
   * otherwise the hole is printed as written, which is a visible bug rather
   * than a silent blank.
   *
   * It lives in `ui/` rather than `ui/primitives/` for one reason: it reads the
   * current language from `stores/`, and a primitive may not read the store
   * (`ui-spec.md` §3). It is the seam between the catalogue and the markup, and
   * there is exactly one of it.
   */

  let {
    key,
    values,
    ...slots
  }: {
    key: MessageKey
    values?: MessageParams
    [name: string]: unknown
  } = $props()

  const parts = $derived(parseMessage(raw(key)))

  const snippetFor = (name: string): Snippet | undefined =>
    typeof slots[name] === 'function' ? (slots[name] as Snippet) : undefined
</script>

{#each parts as part, i (i)}{#if 'text' in part}{part.text}{:else if snippetFor(part.name)}{@render snippetFor(part.name)!()}{:else}{values?.[part.name] ?? `{${part.name}}`}{/if}{/each}
