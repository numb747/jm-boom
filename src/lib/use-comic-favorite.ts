import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { toggleComicFavorite, type ComicDetailResult } from '@/lib/api/comic'
import { queryKeys } from '@/lib/query-keys'
import { useSettingsStore } from '@/stores/settings-store'

export function useComicFavorite(comicId: string) {
  const endpoint = useSettingsStore(state => state.api)
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (currentFavorite: boolean) =>
      toggleComicFavorite({
        comicId,
        currentFavorite,
        endpoint
      }),
    onSuccess: result => {
      queryClient.setQueryData<ComicDetailResult | undefined>(
        queryKeys.comicDetail(endpoint, comicId),
        current => {
          if (current == null) {
            return current
          }

          return {
            ...current,
            comic: {
              ...current.comic,
              isFavorite: result.favorited
            }
          }
        }
      )
      toast.success(result.favorited ? '已添加收藏' : '已取消收藏')
    },
    onError: error => {
      toast.error(error instanceof Error ? error.message : '收藏操作失败')
    }
  })

  return {
    toggle: mutation.mutate,
    isPending: mutation.isPending
  }
}
