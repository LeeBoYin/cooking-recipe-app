import { BrowserRouter, Route, Routes } from 'react-router';
import { useSession } from './data/auth.ts';
import { SignInPage } from './features/auth/SignInPage.tsx';
import { HomePage } from './features/home/HomePage.tsx';
import { KitchenPage } from './features/kitchen/KitchenPage.tsx';
import { AddPage } from './features/pantry/AddPage.tsx';
import { EditPage } from './features/pantry/EditPage.tsx';
import { InventoryPage } from './features/pantry/InventoryPage.tsx';
import { PantryTab } from './features/pantry/PantryTab.tsx';
import { RemovedPage } from './features/pantry/RemovedPage.tsx';
import { AppShell } from './features/shell/AppShell.tsx';
import { InnerLayout } from './features/shell/InnerLayout.tsx';
import { Placeholder } from './features/shell/Placeholder.tsx';
import { UpdatePrompt } from './pwa/UpdatePrompt.tsx';

export function App() {
  const session = useSession();

  return (
    <>
      {/* 還在讀取登入狀態時只顯示底色，避免登入頁閃一下 */}
      {session === undefined ? null : session ? (
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route path="recipes" element={<Placeholder />} />
              <Route path="record" element={<Placeholder />} />
              <Route path="me" element={<Placeholder />} />
              <Route path="kitchen" element={<KitchenPage />}>
                <Route index element={<PantryTab />} />
                <Route path="equipment" element={<Placeholder />} />
              </Route>
              <Route path="*" element={<Placeholder />} />
            </Route>
            {/* 內頁：沒有分頁列，由 SubPage 提供返回 */}
            <Route element={<InnerLayout />}>
              <Route path="kitchen/pantry/add" element={<AddPage />} />
              <Route path="kitchen/pantry/inventory" element={<InventoryPage />} />
              <Route path="kitchen/pantry/removed" element={<RemovedPage />} />
              <Route path="kitchen/pantry/:id" element={<EditPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      ) : (
        <SignInPage />
      )}
      <UpdatePrompt />
    </>
  );
}
