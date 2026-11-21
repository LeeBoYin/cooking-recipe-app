import { useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { newId } from '@zhusha/core';

// 「＋記錄 → 記錄一道菜」：直接打開編輯頁，不先選照片。ID 由手機產生；內容寫了才會存成草稿。
// 從大廚的點子「已經做了？記錄一篇」進來時，state 帶著菜名，編輯頁會先填好；從收藏進來的還帶收藏的 ID，發佈後連回那筆收藏
export function NewRecipe() {
  const [id] = useState(newId);
  const state = useLocation().state as { title?: string; bookmarkId?: string } | null;
  return (
    <Navigate
      to={`/recipes/${id}/edit`}
      replace
      state={state?.title ? { title: state.title, bookmarkId: state.bookmarkId } : undefined}
    />
  );
}
