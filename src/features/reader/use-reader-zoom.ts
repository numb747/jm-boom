import { useCallback, useEffect, useRef, useState } from 'react'

import {
  READER_ZOOM_PERCENT_RANGE,
  useSettingsStore,
  type ReaderReadMode
} from '@/stores/settings-store'

export const READER_ZOOM_STEP = 1.1

const WHEEL_ZOOM_SPEED = 0.0015
const WHEEL_LINE_HEIGHT_PX = 33
const ZOOM_HINT_DURATION_MS = 900

type GestureEventLike = Event & { scale?: number }

export function clampReaderZoomPercent(percent: number) {
  return Math.min(Math.max(percent, READER_ZOOM_PERCENT_RANGE[0]), READER_ZOOM_PERCENT_RANGE[1])
}

export function useReaderZoom(readMode: ReaderReadMode) {
  const isStripMode = readMode === 'strip'
  const zoomPercent = useSettingsStore(state =>
    isStripMode ? state.readerStripZoomPercent : state.readerSingleZoomPercent
  )
  const setZoomPercent = useSettingsStore(state =>
    isStripMode ? state.setReaderStripZoomPercent : state.setReaderSingleZoomPercent
  )
  // Pinch gestures emit tiny deltas; keep the unrounded value here so they
  // accumulate instead of being lost to the store's integer rounding.
  const zoomRef = useRef(zoomPercent)
  const gestureStartRef = useRef(zoomPercent)
  const hintTimerRef = useRef<number | null>(null)
  const [isHintVisible, setIsHintVisible] = useState(false)

  useEffect(() => {
    if (Math.round(zoomRef.current) !== zoomPercent) {
      zoomRef.current = zoomPercent
    }
  }, [zoomPercent])

  const applyZoom = useCallback(
    (nextPercent: number) => {
      const clamped = clampReaderZoomPercent(nextPercent)

      zoomRef.current = clamped
      setZoomPercent(clamped)
      setIsHintVisible(true)

      if (hintTimerRef.current !== null) {
        window.clearTimeout(hintTimerRef.current)
      }

      hintTimerRef.current = window.setTimeout(() => {
        hintTimerRef.current = null
        setIsHintVisible(false)
      }, ZOOM_HINT_DURATION_MS)
    },
    [setZoomPercent]
  )

  useEffect(
    () => () => {
      if (hintTimerRef.current !== null) {
        window.clearTimeout(hintTimerRef.current)
      }
    },
    []
  )

  useEffect(() => {
    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) {
        return
      }

      event.preventDefault()
      const deltaY =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? event.deltaY * WHEEL_LINE_HEIGHT_PX
          : event.deltaY
      applyZoom(zoomRef.current * Math.exp(-deltaY * WHEEL_ZOOM_SPEED))
    }

    function handleGestureStart(event: GestureEventLike) {
      event.preventDefault()
      gestureStartRef.current = zoomRef.current
    }

    function handleGestureChange(event: GestureEventLike) {
      event.preventDefault()

      if (typeof event.scale === 'number' && Number.isFinite(event.scale)) {
        applyZoom(gestureStartRef.current * event.scale)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey && !event.metaKey) {
        return
      }

      if (event.key === '=' || event.key === '+') {
        event.preventDefault()
        applyZoom(zoomRef.current * READER_ZOOM_STEP)
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        applyZoom(zoomRef.current / READER_ZOOM_STEP)
      } else if (event.key === '0') {
        event.preventDefault()
        applyZoom(100)
      }
    }

    window.addEventListener('wheel', handleWheel, { passive: false })
    window.addEventListener('gesturestart', handleGestureStart, { passive: false })
    window.addEventListener('gesturechange', handleGestureChange, { passive: false })
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('wheel', handleWheel)
      window.removeEventListener('gesturestart', handleGestureStart)
      window.removeEventListener('gesturechange', handleGestureChange)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [applyZoom])

  return {
    zoom: zoomPercent / 100,
    zoomPercent,
    isHintVisible
  }
}
