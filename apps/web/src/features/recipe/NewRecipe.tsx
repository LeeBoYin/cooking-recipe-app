import { useState } from 'react';
import { Navigate } from 'react-router';
import { newId } from '@zhusha/core';

// 「＋記錄 → 記錄一道菜」：直接打開編輯頁，不先選照片。ID 由手機產生；內容寫了才會存成草稿
export function NewRecipe() {
  const [id] = useState(newId);
  return <Navigate to={`/recipes/${id}/edit`} replace />;
}
