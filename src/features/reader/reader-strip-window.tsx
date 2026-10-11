import { useQuery } from '@tanstack/react-query'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type WheelEvent
} from 'react'

import { Button } from '@/components/ui/button'
import { readerFileSrc } from '@/lib/api/reader'
import { CACHE } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { ReaderPageQueryKeyFactory, ReaderPageRequester } from './use-reader-page-query'

const STRIP_PAGE_PRELOAD_DISTANCE = 2
const STRIP_END_SCROLL_THRESHOLD_PX = 24
const STRIP_BASE_WIDTH = 'min(64rem, 100vw)'

export function ReaderStripWindow({
  containerRef,
  pageCount,
  currentIndex,
  navigationRequestId,
  zoom,
  pageQueryKey,
  requestPage,
  onCurrentIndexChange,
  onScrollPastEnd
}: {
  containerRef: RefObject<HTMLDivElement | null>
  pageCount: number
  currentIndex: number
  navigationRequestId: number
  zoom: number
  pageQueryKey: ReaderPageQueryKeyFactory
  requestPage: ReaderPageRequester
  onCurrentIndexChange: (index: number) => void
  onScrollPastEnd?: () => boolean
}) {
  const pageRefs = useRef<Array<HTMLElement | null>>([])
  const frameRef = useRef<number | null>(null)
  const hasInitialScrolledRef = useRef(false)
  const lastNavigationRequestRef = useRef(navigationRequestId)
  const currentIndexRef = useRef(currentIndex)
  // The page under the viewport center and how far down it the center sits,
  // so zooming keeps the same spot in view. Unloaded pages keep a fixed
  // placeholder height, so a fraction of the whole strip would drift.
  const scrollAnchorRef = useRef<{ x: number; index: number; offset: number } | null>(null)
  const lastZoomRef = useRef(zoom)

  useEffect(() => {
    currentIndexRef.current = currentIndex
  }, [currentIndex])

  useEffect(() => {
    pageRefs.current = pageRefs.current.slice(0, pageCount)
    hasInitialScrolledRef.current = false
  }, [pageCount])

  const setPageElement = useCallback((index: number, element: HTMLElement | null) => {
    pageRefs.current[index] = element
  }, [])

  const resolveCurrentIndex = useCallback(() => {
    const container = containerRef.current

    if (!container || pageCount <= 0) {
      return
    }

    const viewportCenter = container.scrollTop + container.clientHeight / 2
    let nextIndex = currentIndexRef.current
    let nearestDistance = Number.POSITIVE_INFINITY

    for (let index = 0; index < pageCount; index += 1) {
      const element = pageRefs.current[index]

      if (!element) {
        continue
      }

      const pageCenter = element.offsetTop + element.offsetHeight / 2
      const distance = Math.abs(pageCenter - viewportCenter)

      if (distance < nearestDistance) {
        nearestDistance = distance
        nextIndex = index
      }
    }

    if (nextIndex !== currentIndexRef.current) {
      onCurrentIndexChange(nextIndex)
    }
  }, [containerRef, onCurrentIndexChange, pageCount])

  const scheduleResolveCurrentIndex = useCallback(() => {
    if (frameRef.current !== null) {
      return
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      resolveCurrentIndex()
    })
  }, [resolveCurrentIndex])

  const handleScroll = useCallback(() => {
    const container = containerRef.current

    if (container) {
      const viewportCenter = container.scrollTop + container.clientHeight / 2
      const index = pageRefs.current.findIndex(
        element =>
          element !== null &&
          element.offsetTop <= viewportCenter &&
          element.offsetTop + element.offsetHeight > viewportCenter
      )
      const element = index >= 0 ? pageRefs.current[index] : null

      scrollAnchorRef.current = element
        ? {
            x:
              (container.scrollLeft + container.clientWidth / 2) /
              Math.max(container.scrollWidth, 1),
            index,
            offset: (viewportCenter - element.offsetTop) / Math.max(element.offsetHeight, 1)
          }
        : null
    }

    scheduleResolveCurrentIndex()
  }, [containerRef, scheduleResolveCurrentIndex])

  useLayoutEffect(() => {
    const container = containerRef.current

    if (!container || lastZoomRef.current === zoom) {
      return
    }

    lastZoomRef.current = zoom
    const anchor = scrollAnchorRef.current
    const element = anchor ? pageRefs.current[anchor.index] : null

    if (anchor && element) {
      container.scrollTo({
        left: anchor.x * container.scrollWidth - container.clientWidth / 2,
        top: element.offsetTop + anchor.offset * element.offsetHeight - container.clientHeight / 2,
        behavior: 'instant'
      })
    }

    scheduleResolveCurrentIndex()
  }, [containerRef, scheduleResolveCurrentIndex, zoom])

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (event.deltaY <= 0 || event.ctrlKey || event.metaKey) {
        return
      }

      const container = event.currentTarget
      const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0)

      if (maxScrollTop - container.scrollTop > STRIP_END_SCROLL_THRESHOLD_PX) {
        return
      }

      if (onScrollPastEnd?.()) {
        event.preventDefault()
      }
    },
    [onScrollPastEnd]
  )

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }
    },
    []
  )

  useEffect(() => {
    const container = containerRef.current
    const target = pageRefs.current[currentIndex]
    const shouldScroll =
      !hasInitialScrolledRef.current || lastNavigationRequestRef.current !== navigationRequestId

    if (!container || !target || !shouldScroll) {
      return
    }

    container.scrollTo({
      top: target.offsetTop,
      behavior: hasInitialScrolledRef.current ? 'smooth' : 'auto'
    })
    hasInitialScrolledRef.current = true
    lastNavigationRequestRef.current = navigationRequestId
  }, [containerRef, currentIndex, navigationRequestId, pageCount])

  return (
    <div
      ref={containerRef}
      className="h-screen w-screen scrollbar-none overflow-auto overscroll-contain scroll-smooth bg-neutral-950"
      onScroll={handleScroll}
      onWheel={handleWheel}
    >
      <div
        className="mx-auto flex min-h-screen flex-col items-center pb-32"
        style={{ width: `calc(${STRIP_BASE_WIDTH} * ${zoom})` }}
      >
        {Array.from({ length: pageCount }, (_, index) => (
          <ReaderStripImage
            key={index}
            index={index}
            currentIndex={currentIndex}
            containerRef={containerRef}
            pageQueryKey={pageQueryKey}
            requestPage={requestPage}
            setPageElement={setPageElement}
            onLayoutChange={scheduleResolveCurrentIndex}
          />
        ))}
      </div>
    </div>
  )
}

function ReaderStripImage({
  index,
  currentIndex,
  containerRef,
  pageQueryKey,
  requestPage,
  setPageElement,
  onLayoutChange
}: {
  index: number
  currentIndex: number
  containerRef: RefObject<HTMLDivElement | null>
  pageQueryKey: ReaderPageQueryKeyFactory
  requestPage: ReaderPageRequester
  setPageElement: (index: number, element: HTMLElement | null) => void
  onLayoutChange: () => void
}) {
  const [element, setElement] = useState<HTMLElement | null>(null)
  const [isNearViewport, setIsNearViewport] = useState(false)
  const shouldPreload = Math.abs(index - currentIndex) <= STRIP_PAGE_PRELOAD_DISTANCE
  const shouldLoad = isNearViewport || shouldPreload
  const page = useQuery({
    queryKey: pageQueryKey(index),
    queryFn: () => requestPage(index, 'visible'),
    enabled: shouldLoad,
    staleTime: CACHE.READER_STALE_TIME,
    gcTime: CACHE.READER_GC_TIME,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  })
  const src = page.data?.index === index ? readerFileSrc(page.data.path) : ''

  const registerElement = useCallback(
    (node: HTMLElement | null) => {
      setElement(node)
      setPageElement(index, node)
    },
    [index, setPageElement]
  )

  useEffect(() => {
    if (shouldPreload) {
      setIsNearViewport(true)
    }
  }, [shouldPreload])

  useEffect(() => {
    if (!element) {
      return
    }

    const root = containerRef.current

    if (!root || typeof IntersectionObserver === 'undefined') {
      setIsNearViewport(true)
      return
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setIsNearViewport(true)
        }
      },
      {
        root,
        rootMargin: '1400px 0px'
      }
    )

    observer.observe(element)

    return () => observer.disconnect()
  }, [containerRef, element])

  return (
    <article
      ref={registerElement}
      className={cn('flex w-full justify-center bg-neutral-950', src ? 'min-h-0' : 'min-h-[64vh]')}
      data-reader-page-index={index}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="block w-full object-contain select-none"
          draggable={false}
          loading="eager"
          decoding={Math.abs(index - currentIndex) <= 1 ? 'sync' : 'async'}
          onLoad={onLayoutChange}
        />
      ) : page.isError ? (
        <div className="flex min-h-[64vh] w-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-neutral-300">
          <div>
            <div className="font-medium text-neutral-100">第 {index + 1} 张加载失败</div>
            <div className="mt-1 text-xs text-neutral-500">{page.error.message}</div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/15 bg-white/5 text-neutral-100 hover:bg-white/10 hover:text-neutral-50"
            onClick={event => {
              event.stopPropagation()
              void page.refetch()
            }}
          >
            重试
          </Button>
        </div>
      ) : (
        <div className="flex min-h-[64vh] w-full items-center justify-center text-xs text-neutral-500">
          正在准备第 {index + 1} 张
        </div>
      )}
    </article>
  )
}
