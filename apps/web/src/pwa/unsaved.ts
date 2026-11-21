// 已發佈的食譜改了還沒儲存：編輯頁登記，更新提示重新整理前看這裡（草稿自動存，不算）。
let unsaved = false;

export function setUnsavedEdits(value: boolean): void {
  unsaved = value;
}

export function hasUnsavedEdits(): boolean {
  return unsaved;
}
