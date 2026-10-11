import type { RefObject, WheelEvent } from 'react'

import type { ReaderPageDirection } from '@/stores/settings-store'

export function ReaderHotZones({
  pageDirection,
  onPrevious,
  onNext,
  scrollTargetRef
}: {
  pageDirection: ReaderPageDirection
  onPrevious: () => void
  onNext: () => void
  scrollTargetRef?: RefObject<HTMLElement | null>
}) {
  const leftAction = pageDirection === 'rtl' ? onNext : onPrevious
  const rightAction = pageDirection === 'rtl' ? onPrevious : onNext
  // The zones sit above the page, so pass wheel scrolling through to a
  // zoomed-in page underneath.
  const forwardWheel = (event: WheelEvent<HTMLButtonElement>) => {
    if (!event.ctrlKey && !event.metaKey) {
      scrollTargetRef?.current?.scrollBy({ left: event.deltaX, top: event.deltaY })
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={pageDirection === 'rtl' ? '下一页' : '上一页'}
        className="absolute top-20 bottom-20 left-0 z-20 w-[12vw] min-w-20 max-w-36 cursor-pointer border-0 bg-transparent p-0"
        onClick={event => {
          event.stopPropagation()
          leftAction()
        }}
        onWheel={forwardWheel}
      />
      <button
        type="button"
        aria-label={pageDirection === 'rtl' ? '上一页' : '下一页'}
        className="absolute top-20 right-0 bottom-20 z-20 w-[12vw] min-w-20 max-w-36 cursor-pointer border-0 bg-transparent p-0"
        onClick={event => {
          event.stopPropagation()
          rightAction()
        }}
        onWheel={forwardWheel}
      />
    </>
  )
}
