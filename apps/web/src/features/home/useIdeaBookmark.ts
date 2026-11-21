// 點子卡片右上角的收藏（首頁與對話共用）：家常菜用 baseDishId 判斷重複，AI 想的點子用 suggestionId＋菜名。
// 自己的食譜不收藏（打開食譜就好）。
import { ideaOf, type Bookmark } from '../../data/bookmarks.ts';
import { useBookmarkAiIdea, useBookmarkIdea, useMyBookmarks, useUnbookmark } from '../../data/hooks.ts';
import type { IdeaView } from './ideaView.ts';

export function findBookmark(list: Bookmark[] | undefined, view: IdeaView): Bookmark | undefined {
  return (list ?? []).find((b) => {
    const i = ideaOf(b);
    if (view.baseDishId) return i.baseDishId === view.baseDishId;
    return !!view.suggestionId && i.suggestionId === view.suggestionId && i.title === view.title;
  });
}

export function useIdeaBookmark(view: IdeaView) {
  const bookmarks = useMyBookmarks();
  const addDish = useBookmarkIdea();
  const addAi = useBookmarkAiIdea();
  const remove = useUnbookmark();
  const bookmark = findBookmark(bookmarks.data, view);
  const can = !!view.baseDishId || (view.source === 'ai' && !!view.suggestionId);

  function toggle() {
    if (bookmark) remove.mutate(bookmark.id);
    else if (view.baseDishId) addDish.mutate({ title: view.title, why: view.why, baseDishId: view.baseDishId });
    else if (view.suggestionId) addAi.mutate({ suggestionId: view.suggestionId, title: view.title });
  }
  return {
    can,
    bookmark,
    toggle,
    busy: addDish.isPending || addAi.isPending || remove.isPending,
    failed: addDish.isError || addAi.isError || remove.isError,
  };
}
