import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';
import { useMySettings } from './data/hooks.ts';
import { Onboarding } from './features/onboarding/Onboarding.tsx';
import { useSession } from './data/auth.ts';
import { GoogleGate } from './features/auth/GoogleGate.tsx';
import { InvitePage } from './features/auth/InvitePage.tsx';
import { ResetPage } from './features/auth/ResetPage.tsx';
import { SignInPage } from './features/auth/SignInPage.tsx';
import { AddEquipmentPage } from './features/equipment/AddEquipmentPage.tsx';
import { EditEquipmentPage } from './features/equipment/EditEquipmentPage.tsx';
import { EquipmentInventoryPage } from './features/equipment/EquipmentInventoryPage.tsx';
import { EquipmentTab } from './features/equipment/EquipmentTab.tsx';
import { ChatPage } from './features/chat/ChatPage.tsx';
import { HomePage } from './features/home/HomePage.tsx';
import { KitchenPage } from './features/kitchen/KitchenPage.tsx';
import { KitchenSettingsPage } from './features/kitchen/KitchenSettingsPage.tsx';
import { AddPage } from './features/pantry/AddPage.tsx';
import { EditPage } from './features/pantry/EditPage.tsx';
import { InventoryPage } from './features/pantry/InventoryPage.tsx';
import { DraftsPage } from './features/recipes/DraftsPage.tsx';
import { MyRecipesTab } from './features/recipes/MyRecipesTab.tsx';
import { RecipesPage } from './features/recipes/RecipesPage.tsx';
import { SavedTab } from './features/recipes/SavedTab.tsx';
import { NewRecipe } from './features/recipe/NewRecipe.tsx';
import { RecipeEditPage } from './features/recipe/RecipeEditPage.tsx';
import { RecipePage } from './features/recipe/RecipePage.tsx';
import { PantryTab } from './features/pantry/PantryTab.tsx';
import { TrashPage } from './features/me/TrashPage.tsx';
import { AppShell } from './features/shell/AppShell.tsx';
import { InnerLayout } from './features/shell/InnerLayout.tsx';
import { TastePage } from './features/taste/TastePage.tsx';
import { MePage } from './features/me/MePage.tsx';
import { DietPage } from './features/me/DietPage.tsx';
import { TasteMapPage } from './features/me/TasteMapPage.tsx';
import { Placeholder } from './features/shell/Placeholder.tsx';
import { PhotoSync } from './photos/PhotoSync.tsx';
import { OfflineBanner } from './pwa/OfflineBanner.tsx';
import { UpdatePrompt } from './pwa/UpdatePrompt.tsx';

// 開發用的 icon 總覽，正式建置會整段拿掉
const IconsPage = import.meta.env.DEV ? lazy(() => import('./features/dev/IconsPage.tsx').then((m) => ({ default: m.IconsPage }))) : null;

// 管理後台：獨立的區塊，只有進 /admin 才下載（不進預先快取）
const AdminApp = lazy(() => import('./features/admin/AdminApp.tsx'));

// 登入後 onboarding_completed_at 還是空的，就先走新手引導（12 第三節）
function OnboardingGate() {
  const settings = useMySettings();
  if (settings.isPending) return null;
  if (settings.data && !settings.data.onboarding_completed_at) return <Onboarding />;
  return <Outlet />;
}

export function App() {
  const session = useSession();

  return (
    <>
      {/* 還在讀取登入狀態時只顯示底色，避免登入頁閃一下 */}
      {session === undefined ? null : session ? (
        <GoogleGate userId={session.user.id}>
        <BrowserRouter>
          <PhotoSync />
          <Routes>
            {IconsPage && <Route path="dev/icons" element={<Suspense><IconsPage /></Suspense>} />}
            {/* 後台自己確認管理員與兩步驟驗證，不走新手引導 */}
            <Route path="admin/*" element={<Suspense fallback={null}><AdminApp /></Suspense>} />
            <Route element={<OnboardingGate />}>
            <Route path="onboarding" element={<Onboarding redo />} />
            {/* 和大廚聊聊：全螢幕，沒有分頁列 */}
            <Route path="chat" element={<ChatPage />} />
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route path="recipes" element={<RecipesPage />}>
                <Route index element={<MyRecipesTab />} />
                <Route path="saved" element={<SavedTab />} />
              </Route>
              <Route path="record" element={<NewRecipe />} />
              <Route path="me" element={<MePage />} />
              <Route path="kitchen" element={<KitchenPage />}>
                <Route index element={<PantryTab />} />
                <Route path="equipment" element={<EquipmentTab />} />
              </Route>
              <Route path="*" element={<Placeholder />} />
            </Route>
            {/* 內頁：沒有分頁列，由 SubPage 提供返回 */}
            <Route element={<InnerLayout />}>
              <Route path="recipes/new" element={<NewRecipe />} />
              <Route path="recipes/drafts" element={<DraftsPage />} />
              <Route path="me/trash" element={<TrashPage />} />
              <Route path="recipes/deleted" element={<Navigate to="/me/trash" replace />} />
              <Route path="recipes/:id" element={<RecipePage />} />
              <Route path="recipes/:id/edit" element={<RecipeEditPage />} />
              <Route path="taste" element={<TastePage />} />
              <Route path="me/taste" element={<TasteMapPage />} />
              <Route path="me/diet" element={<DietPage />} />
              <Route path="kitchen/settings" element={<KitchenSettingsPage />} />
              <Route path="kitchen/pantry/add" element={<AddPage />} />
              <Route path="kitchen/pantry/inventory" element={<InventoryPage />} />
              <Route path="kitchen/pantry/removed" element={<Navigate to="/me/trash" replace />} />
              <Route path="kitchen/pantry/:id" element={<EditPage />} />
              <Route path="kitchen/equipment/add" element={<AddEquipmentPage />} />
              <Route path="kitchen/equipment/inventory" element={<EquipmentInventoryPage />} />
              <Route path="kitchen/equipment/:id" element={<EditEquipmentPage />} />
            </Route>
            </Route>
            {/* 已經登入還點到邀請或重設連結：回首頁 */}
            <Route path="invite/*" element={<Navigate to="/" replace />} />
            <Route path="reset/*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        </GoogleGate>
      ) : (
        <BrowserRouter>
          <Routes>
            <Route path="invite/:token" element={<InvitePage />} />
            <Route path="reset/:token" element={<ResetPage />} />
            <Route path="*" element={<SignInPage />} />
          </Routes>
        </BrowserRouter>
      )}
      <OfflineBanner />
      <UpdatePrompt />
    </>
  );
}
