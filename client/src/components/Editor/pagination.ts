import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { useStore } from '../../store/useStore'

/** A4 at 96dpi: 210mm × 297mm. */
export const PAGE_WIDTH = 794
export const PAGE_HEIGHT = 1123
/** Printable margin at the top and bottom of every sheet. */
export const PAGE_MARGIN = 96
/** Visible gutter drawn between two sheets. */
export const PAGE_GAP = 28
/** Distance from one sheet's top edge to the next sheet's top edge. */
export const PAGE_PITCH = PAGE_HEIGHT + PAGE_GAP
/** Vertical space a single sheet offers to content. */
export const PAGE_CONTENT_HEIGHT = PAGE_HEIGHT - PAGE_MARGIN * 2

/** Number of sheets needed to hold content ending `bottom`px below the canvas top. */
export function pageCountFor(bottom: number): number {
  let count = 1
  // Guard against a runaway loop if a measurement ever comes back absurd.
  while (bottom > (count - 1) * PAGE_PITCH + PAGE_HEIGHT - PAGE_MARGIN && count < 500) {
    count++
  }
  return count
}

export interface FrameScheduler {
  (): void
  cancel: () => void
}

/**
 * Runs `fn` once, off the next animation frame. A pending run is never
 * cancelled and rescheduled — that would starve the callback while someone
 * types continuously. The timer is a fallback for hidden tabs, where the
 * browser stops serving animation frames altogether.
 */
export function createFrameScheduler(fn: () => void): FrameScheduler {
  let frame = 0
  let timer = 0

  const clear = () => {
    if (frame) cancelAnimationFrame(frame)
    if (timer) clearTimeout(timer)
    frame = 0
    timer = 0
  }

  const schedule = (() => {
    if (frame || timer) return
    const run = () => {
      clear()
      fn()
    }
    frame = requestAnimationFrame(run)
    timer = window.setTimeout(run, 100)
  }) as FrameScheduler

  schedule.cancel = clear
  return schedule
}

export const paginationKey = new PluginKey<DecorationSet>('pagination')

const SPACER_CLASS = 'page-spacer'

interface Gap {
  pos: number
  height: number
}

/**
 * Real pagination for a continuously-flowing editor.
 *
 * The A4 sheets behind the text are only a backdrop — on their own they let a
 * paragraph run straight through the seam between two pages. This plugin
 * measures every top-level block after each layout and, when a block would
 * cross the bottom margin of the sheet it sits on, inserts a widget spacer that
 * pushes it to the top of the next sheet. The result is that no block is ever
 * cut in half by a page boundary.
 *
 * Blocks taller than a whole page (a big image or table) can't be made to fit;
 * those are only moved so that they *start* at the top of a sheet.
 */
export const Pagination = Extension.create({
  name: 'pagination',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: paginationKey,

        state: {
          init: () => DecorationSet.empty,
          apply(tr, value) {
            const next = tr.getMeta(paginationKey) as DecorationSet | undefined
            if (next) return next
            // Keep the spacers anchored to their blocks until the next measure.
            return tr.docChanged ? value.map(tr.mapping, tr.doc) : value
          },
        },

        props: {
          decorations(state) {
            return paginationKey.getState(state)
          },
        },

        view(view) {
          let signature = ''

          /** Measure the laid-out document and re-place the page spacers. */
          const measure = () => {
            const dom = view.dom as HTMLElement
            if (!dom.isConnected) return

            const canvas = dom.closest('[data-page-canvas]')
            if (!canvas) return

            const domRect = dom.getBoundingClientRect()
            const canvasTop = canvas.getBoundingClientRect().top
            // Where the text column starts inside the first sheet.
            const origin = domRect.top - canvasTop

            // Publish how many sheets the text now covers. Measuring it here,
            // rather than from a second observer, keeps the sheets and the page
            // breaks from ever disagreeing about the layout.
            const pages = pageCountFor(domRect.bottom - canvasTop)
            if (useStore.getState().pageCount !== pages) useStore.getState().setPageCount(pages)

            // Top-level DOM blocks, in document order. Spacers are our own
            // widgets, so skipping them lines the list up with the doc's children.
            const blocks = (Array.from(dom.children) as HTMLElement[]).filter(
              (el) => !el.classList.contains(SPACER_CLASS)
            )

            const positions: number[] = []
            view.state.doc.forEach((_node, offset) => positions.push(offset))
            if (positions.length !== blocks.length) return // mid-render; measure again later

            const domTop = domRect.top
            const gaps: Gap[] = []
            let applied = 0 // spacer height inserted above the current block
            let shift = 0 // spacer height we are inserting on this pass

            for (let i = 0; i < blocks.length; i++) {
              const el = blocks[i]
              const previous = el.previousElementSibling
              if (previous?.classList.contains(SPACER_CLASS)) {
                applied += (previous as HTMLElement).offsetHeight
              }

              const rect = el.getBoundingClientRect()
              // Position this block would sit at with the *current* spacers
              // removed and the *new* ones applied.
              const top = origin + (rect.top - domTop) - applied + shift
              const height = rect.height

              const page = Math.max(0, Math.floor(top / PAGE_PITCH))
              const contentTop = page * PAGE_PITCH + PAGE_MARGIN
              const contentBottom = page * PAGE_PITCH + PAGE_HEIGHT - PAGE_MARGIN
              const startsBelowTop = top > contentTop + 1

              const needsBreak =
                height > PAGE_CONTENT_HEIGHT
                  ? startsBelowTop // too tall for any page — just start it on a fresh one
                  : top + height > contentBottom + 1

              if (needsBreak) {
                const nextContentTop = (page + 1) * PAGE_PITCH + PAGE_MARGIN
                const add = Math.round(nextContentTop - top)
                if (add > 0) {
                  gaps.push({ pos: positions[i], height: add })
                  shift += add
                }
              }
            }

            // Skip the dispatch only when the computation is unchanged *and*
            // the DOM already shows those spacers, so a decoration set that got
            // dropped along the way is always re-applied.
            const next = gaps.map((g) => `${g.pos}:${g.height}`).join('|')
            const rendered = Array.from(dom.children)
              .filter((el) => el.classList.contains(SPACER_CLASS))
              .map((el) => (el as HTMLElement).offsetHeight)
              .join('|')
            if (next === signature && gaps.map((g) => g.height).join('|') === rendered) return
            signature = next

            const decorations = gaps.map((gap) =>
              Decoration.widget(
                gap.pos,
                () => {
                  const el = document.createElement('div')
                  el.className = SPACER_CLASS
                  el.style.height = `${gap.height}px`
                  el.setAttribute('aria-hidden', 'true')
                  el.setAttribute('contenteditable', 'false')
                  return el
                },
                { side: -1, key: `${SPACER_CLASS}-${gap.height}`, ignoreSelection: true }
              )
            )

            view.dispatch(
              view.state.tr
                .setMeta(paginationKey, DecorationSet.create(view.state.doc, decorations))
                .setMeta('addToHistory', false)
            )
          }

          // Measuring reads layout, so it runs off the next frame; the dispatch
          // re-enters here and settles once the spacers stop moving.
          const schedule = createFrameScheduler(measure)

          // Catches reflows that don't arrive as transactions: image loads,
          // font swaps, window resizes, the sidebar opening.
          const observer = new ResizeObserver(schedule)
          observer.observe(view.dom)

          schedule()

          return {
            update: schedule,
            destroy() {
              schedule.cancel()
              observer.disconnect()
              // Don't leave the next document showing this one's sheet count.
              useStore.getState().setPageCount(1)
            },
          }
        },
      }),
    ]
  },
})
