import { useEffect } from 'react'

import type { ReaderPageDirection, ReaderReadMode } from '@/stores/settings-store'

export function useReaderKeyboardNavigation({
  readMode,
  pageDirection,
  onPrevious,
  onNext,
  onScrollPrevious,
  onScrollNext,
  onBack,
  onNavigate
}: {
  readMode: ReaderReadMode
  pageDirection: ReaderPageDirection
  onPrevious: () => void
  onNext: () => void
  onScrollPrevious: () => void
  onScrollNext: () => void
  onBack: () => void
  onNavigate: () => void
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // 弹窗 / 菜单已处理（如 Radix 按 Esc 关闭时会 preventDefault）或正在输入时，不翻页也不退出
      if (event.defaultPrevented || isEditableTarget(event.target)) {
        return
      }

      if (readMode === 'strip' && isStripPreviousKey(event)) {
        event.preventDefault()
        onNavigate()
        onScrollPrevious()
        return
      }

      if (readMode === 'strip' && isStripNextKey(event)) {
        event.preventDefault()
        onNavigate()
        onScrollNext()
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        onNavigate()
        if (pageDirection === 'rtl') {
          onNext()
        } else {
          onPrevious()
        }
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        onNavigate()
        if (pageDirection === 'rtl') {
          onPrevious()
        } else {
          onNext()
        }
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        onNavigate()
        onBack()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    onBack,
    onNavigate,
    onNext,
    onPrevious,
    onScrollNext,
    onScrollPrevious,
    pageDirection,
    readMode
  ])
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

function isStripNextKey(event: KeyboardEvent) {
  return ['ArrowDown', 'ArrowRight', 's', 'S', 'd', 'D'].includes(event.key)
}

function isStripPreviousKey(event: KeyboardEvent) {
  return ['ArrowUp', 'ArrowLeft', 'w', 'W', 'a', 'A'].includes(event.key)
}
