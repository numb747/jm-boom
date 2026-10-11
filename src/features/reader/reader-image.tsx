import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type UIEvent
} from 'react'

import { cn } from '@/lib/utils'
import type { ReaderPageDirection } from '@/stores/settings-store'
import type { ReaderWindowPage } from './types'

export function ReaderImageWindow({
  pages,
  currentIndex,
  pageCount,
  doublePageMode = false,
  pageDirection,
  zoom = 1,
  currentScrollRef
}: {
  pages: ReaderWindowPage[]
  currentIndex: number
  pageCount: number
  doublePageMode?: boolean
  pageDirection: ReaderPageDirection
  zoom?: number
  currentScrollRef?: RefObject<HTMLDivElement | null>
}) {
  if (doublePageMode) {
    return (
      <ReaderDoublePageWindow
        pages={pages}
        currentIndex={currentIndex}
        pageCount={pageCount}
        pageDirection={pageDirection}
        zoom={zoom}
        scrollRef={currentScrollRef}
      />
    )
  }

  return (
    <div className="pointer-events-none relative h-screen w-screen overflow-hidden">
      {pages.map(page => {
        const offset =
          pageDirection === 'rtl' ? currentIndex - page.index : page.index - currentIndex
        const isCurrent = offset === 0

        return (
          <div
            key={page.index}
            className={cn(
              'absolute inset-0 flex h-screen w-screen items-center justify-center transition-transform duration-200 ease-out will-change-transform',
              isCurrent ? 'z-10' : 'z-0'
            )}
            style={{ transform: `translate3d(${offset * 100}%, 0, 0)` }}
          >
            <ReaderSinglePage
              key={page.src}
              src={page.src}
              isCurrent={isCurrent}
              zoom={zoom}
              scrollRef={isCurrent ? currentScrollRef : undefined}
            />
          </div>
        )
      })}
    </div>
  )
}

function ReaderSinglePage({
  src,
  isCurrent,
  zoom,
  scrollRef
}: {
  src: string
  isCurrent: boolean
  zoom: number
  scrollRef?: RefObject<HTMLDivElement | null>
}) {
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const viewport = useViewportSize()
  const isZoomedIn = zoom > 1
  const fitScale = naturalSize
    ? Math.min(viewport.width / naturalSize.width, viewport.height / naturalSize.height)
    : null
  const imageSize =
    naturalSize && fitScale
      ? {
          width: `${naturalSize.width * fitScale * zoom}px`,
          height: `${naturalSize.height * fitScale * zoom}px`
        }
      : { width: `${100 * zoom}vw`, height: `${100 * zoom}vh` }
  const { containerRef, handleScroll } = useZoomScrollAnchor({
    contentKey: `${imageSize.width}x${imageSize.height}`,
    resetKey: isCurrent,
    scrollRef
  })

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex h-screen w-screen scrollbar-none',
        isZoomedIn ? 'pointer-events-auto overflow-auto' : 'overflow-hidden'
      )}
      onScroll={handleScroll}
    >
      <img
        src={src}
        alt=""
        className="m-auto max-w-none shrink-0 select-none object-contain"
        style={imageSize}
        draggable={false}
        loading="eager"
        decoding={isCurrent ? 'sync' : 'async'}
        ref={image => {
          if (image?.complete && image.naturalWidth > 0 && !naturalSize) {
            setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight })
          }
        }}
        onLoad={event => {
          const image = event.currentTarget
          setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight })
        }}
      />
    </div>
  )
}

/**
 * Keeps the viewport center on the same spot of a zoomable scroll container
 * while its content resizes, and returns to top-center when resetKey changes.
 */
function useZoomScrollAnchor({
  contentKey,
  resetKey,
  scrollRef
}: {
  contentKey: string
  resetKey: unknown
  scrollRef?: RefObject<HTMLDivElement | null>
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Viewport center as a fraction of the content; null means "top, centered".
  const anchorRef = useRef<{ x: number; y: number } | null>(null)
  const resetKeyRef = useRef(resetKey)

  useEffect(() => {
    if (scrollRef) {
      scrollRef.current = containerRef.current
    }
  }, [scrollRef])

  useLayoutEffect(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey
      anchorRef.current = null
    }

    const anchor = anchorRef.current
    container.scrollTo({
      left: anchor
        ? anchor.x * container.scrollWidth - container.clientWidth / 2
        : (container.scrollWidth - container.clientWidth) / 2,
      top: anchor ? anchor.y * container.scrollHeight - container.clientHeight / 2 : 0,
      behavior: 'instant'
    })
  }, [contentKey, resetKey])

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const container = event.currentTarget
    anchorRef.current = {
      x: (container.scrollLeft + container.clientWidth / 2) / Math.max(container.scrollWidth, 1),
      y: (container.scrollTop + container.clientHeight / 2) / Math.max(container.scrollHeight, 1)
    }
  }, [])

  return { containerRef, handleScroll }
}

function useViewportSize() {
  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }))

  useEffect(() => {
    function handleResize() {
      setSize({ width: window.innerWidth, height: window.innerHeight })
    }

    window.addEventListener('resize', handleResize)

    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return size
}

function ReaderDoublePageWindow({
  pages,
  currentIndex,
  pageCount,
  pageDirection,
  zoom,
  scrollRef
}: {
  pages: ReaderWindowPage[]
  currentIndex: number
  pageCount: number
  pageDirection: ReaderPageDirection
  zoom: number
  scrollRef?: RefObject<HTMLDivElement | null>
}) {
  const pageByIndex = new Map(pages.map(page => [page.index, page]))
  const currentPage = pageByIndex.get(currentIndex) ?? null
  const nextIndex = currentIndex + 1
  const nextPage = nextIndex < pageCount ? (pageByIndex.get(nextIndex) ?? null) : null
  const showNextSlot = nextIndex < pageCount
  const leftPage = pageDirection === 'rtl' && showNextSlot ? nextPage : currentPage
  const rightPage = pageDirection === 'rtl' ? currentPage : nextPage
  const leftIndex = pageDirection === 'rtl' && showNextSlot ? nextIndex : currentIndex
  const rightIndex = pageDirection === 'rtl' ? currentIndex : nextIndex
  const visibleIndexes = showNextSlot ? [leftIndex, rightIndex] : [currentIndex]
  const isZoomedIn = zoom > 1
  const { containerRef, handleScroll } = useZoomScrollAnchor({
    contentKey: String(zoom),
    resetKey: currentIndex,
    scrollRef
  })

  return (
    <div className="pointer-events-none relative h-screen w-screen overflow-hidden">
      <div
        ref={containerRef}
        className={cn(
          'flex h-screen w-screen scrollbar-none p-6',
          isZoomedIn ? 'pointer-events-auto overflow-auto' : 'overflow-hidden'
        )}
        onScroll={handleScroll}
      >
        {/* The spread fits the padded viewport at 100% and scales as one unit; the
            two pages meet at the spine so zooming in does not center on a gap. */}
        <div
          className="m-auto flex shrink-0 items-center justify-center gap-2"
          style={{
            width: `calc(min(100vw - 3rem, ${showNextSlot ? 1800 : 900}px) * ${zoom})`,
            height: `calc((100vh - 3rem) * ${zoom})`
          }}
        >
          <ReaderDoublePageSlot
            page={leftPage}
            isCurrent={leftIndex === currentIndex}
            label={`第 ${leftIndex + 1} 张`}
            align={showNextSlot ? 'end' : 'center'}
          />
          {showNextSlot ? (
            <ReaderDoublePageSlot
              page={rightPage}
              isCurrent={rightIndex === currentIndex}
              label={`第 ${rightIndex + 1} 张`}
              align="start"
            />
          ) : null}
        </div>
      </div>
      <ReaderHiddenImagePreloads pages={pages} visibleIndexes={visibleIndexes} />
    </div>
  )
}

function ReaderHiddenImagePreloads({
  pages,
  visibleIndexes
}: {
  pages: ReaderWindowPage[]
  visibleIndexes: number[]
}) {
  const visibleIndexSet = new Set(visibleIndexes)
  const preloadPages = pages.filter(page => !visibleIndexSet.has(page.index))

  if (preloadPages.length === 0) {
    return null
  }

  return (
    <div className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0">
      {preloadPages.map(page => (
        <img
          key={page.index}
          src={page.src}
          alt=""
          className="h-px w-px"
          draggable={false}
          loading="eager"
          decoding="async"
        />
      ))}
    </div>
  )
}

function ReaderDoublePageSlot({
  page,
  isCurrent,
  label,
  align
}: {
  page: ReaderWindowPage | null
  isCurrent: boolean
  label: string
  align: 'start' | 'center' | 'end'
}) {
  return (
    <div
      className={cn(
        'flex h-full min-w-0 flex-1 items-center bg-neutral-950',
        align === 'start' && 'justify-start',
        align === 'center' && 'justify-center',
        align === 'end' && 'justify-end'
      )}
    >
      {page ? (
        <img
          src={page.src}
          alt=""
          className="max-h-full max-w-full select-none object-contain"
          draggable={false}
          loading="eager"
          decoding={isCurrent ? 'sync' : 'async'}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-neutral-500">
          正在准备{label}
        </div>
      )}
    </div>
  )
}
