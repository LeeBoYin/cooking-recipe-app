import { BrowserRouter, Route, Routes } from 'react-router';
import { useSession } from './data/auth.ts';
import { SignInPage } from './features/auth/SignInPage.tsx';
import { AddEquipmentPage } from './features/equipment/AddEquipmentPage.tsx';
import { EditEquipmentPage } from './features/equipment/EditEquipmentPage.tsx';
import { EquipmentInventoryPage } from './features/equipment/EquipmentInventoryPage.tsx';
import { EquipmentTab } from './features/equipment/EquipmentTab.tsx';
import { HomePage } from './features/home/HomePage.tsx';
import { KitchenPage } from './features/kitchen/KitchenPage.tsx';
import { AddPage } from './features/pantry/AddPage.tsx';
import { EditPage } from './features/pantry/EditPage.tsx';
import { InventoryPage } from './features/pantry/InventoryPage.tsx';
import { DeletedPage } from './features/recipes/DeletedPage.tsx';
import { DraftsPage } from './features/recipes/DraftsPage.tsx';
import { MyRecipesTab } from './features/recipes/MyRecipesTab.tsx';
import { RecipesPage } from './features/recipes/RecipesPage.tsx';
import { SavedTab } from './features/recipes/SavedTab.tsx';
import { NewRecipe } from './features/recipe/NewRecipe.tsx';
import { RecipeEditPage } from './features/recipe/RecipeEditPage.tsx';
import { RecipePage } from './features/recipe/RecipePage.tsx';
import { PantryTab } from './features/pantry/PantryTab.tsx';
import { RemovedPage } from './features/pantry/RemovedPage.tsx';
import { AppShell } from './features/shell/AppShell.tsx';
import { InnerLayout } from './features/shell/InnerLayout.tsx';
import { TastePage } from './features/taste/TastePage.tsx';
import { Placeholder } from './features/shell/Placeholder.tsx';
import { PhotoSync } from './photos/PhotoSync.tsx';
import { UpdatePrompt } from './pwa/UpdatePrompt.tsx';

export function App() {
  const session = useSession();

  return (
    <>
      {/* 還在讀取登入狀態時只顯示底色，避免登入頁閃一下 */}
      {session === undefined ? null : session ? (
        <BrowserRouter>
          <PhotoSync />
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route path="recipes" element={<RecipesPage />}>
                <Route index element={<MyRecipesTab />} />
                <Route path="saved" element={<SavedTab />} />
              </Route>
              <Route path="record" element={<NewRecipe />} />
              <Route path="me" element={<Placeholder />} />
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
              <Route path="recipes/deleted" element={<DeletedPage />} />
              <Route path="recipes/:id" element={<RecipePage />} />
              <Route path="recipes/:id/edit" element={<RecipeEditPage />} />
              <Route path="taste" element={<TastePage />} />
              <Route path="kitchen/pantry/add" element={<AddPage />} />
              <Route path="kitchen/pantry/inventory" element={<InventoryPage />} />
              <Route path="kitchen/pantry/removed" element={<RemovedPage />} />
              <Route path="kitchen/pantry/:id" element={<EditPage />} />
              <Route path="kitchen/equipment/add" element={<AddEquipmentPage />} />
              <Route path="kitchen/equipment/inventory" element={<EquipmentInventoryPage />} />
              <Route path="kitchen/equipment/:id" element={<EditEquipmentPage />} />
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
