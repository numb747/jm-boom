import type { QueryObserverResult } from '@tanstack/react-query'

import type { ComicDetailResult } from '@/lib/api/comic'

export type ReaderSearch = {
  title: string
  chapter: string
  albumId: string
  fromDetail: string
  pageIndex: string
  nextId: string
  nextChapter: string
}

export type ReaderChapterItem = {
  id: string
  title: string
}

export type ReaderWindowPage = {
  index: number
  src: string
}

export type ReaderAlbumDetailRefetch = () => Promise<QueryObserverResult<ComicDetailResult>>
