import { Outlet } from 'react-router';

// 內頁的外殼：沒有底部分頁列，底部留給固定的動作列（17 第四節）
export function InnerLayout() {
  return (
    <div className="mx-auto min-h-dvh max-w-[560px] px-4 pt-[calc(16px+env(safe-area-inset-top))] pb-[calc(24px+env(safe-area-inset-bottom))]">
      <Outlet />
    </div>
  );
}
