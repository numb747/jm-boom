import { BookmarkCheckIcon, BookmarkIcon, LoaderCircleIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { LoginDialog } from '@/features/user/login-dialog'
import { useComicFavorite } from '@/lib/use-comic-favorite'
import { useUserStore } from '@/stores/user-store'
import type { ReaderAlbumDetailRefetch } from './types'

const READER_FAVORITE_BUTTON_CLASS =
  'h-7 rounded-md px-2 text-xs text-neutral-200 hover:bg-white/10 hover:text-neutral-50 focus-visible:text-neutral-50 disabled:text-neutral-500'

export function ReaderFavoriteButton({
  albumId,
  isFavorite,
  refetchAlbumDetail
}: {
  albumId: string
  isFavorite: boolean | null
  refetchAlbumDetail: ReaderAlbumDetailRefetch
}) {
  const user = useUserStore(state => state.user)
  const isUserInitializing = useUserStore(state => state.isInitializing)
  const favorite = useComicFavorite(albumId)
  const [loginOpen, setLoginOpen] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const isBusy = favorite.isPending || isSyncing
  const disabled = albumId.length === 0 || isFavorite == null || isUserInitializing || isBusy

  function handleClick() {
    if (isFavorite == null) {
      return
    }

    if (!user) {
      setLoginOpen(true)
      return
    }

    favorite.toggle(isFavorite)
  }

  // 未登录时拿到的详情 isFavorite 恒为 false，而 /favorite 是服务端切换，必须先按登录后的真实状态决定
  async function handleLoginSuccess() {
    setIsSyncing(true)
    const result = await refetchAlbumDetail()
    setIsSyncing(false)

    if (result.isError || result.data == null) {
      toast.error(result.error instanceof Error ? result.error.message : '收藏操作失败')
      return
    }

    if (result.data.comic.isFavorite) {
      toast.success('已在收藏中')
      return
    }

    favorite.toggle(false)
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        disabled={disabled}
        className={READER_FAVORITE_BUTTON_CLASS}
        onClick={handleClick}
      >
        {isBusy ? (
          <LoaderCircleIcon className="size-3.5 animate-spin" />
        ) : isFavorite ? (
          <BookmarkCheckIcon className="size-3.5" />
        ) : (
          <BookmarkIcon className="size-3.5" />
        )}
        {isFavorite ? '已收藏' : '收藏'}
      </Button>

      <LoginDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onLoginSuccess={() => void handleLoginSuccess()}
      />
    </>
  )
}
