import { useSession } from './data/auth.ts';
import { SignInPage } from './features/auth/SignInPage.tsx';
import { HomePage } from './features/home/HomePage.tsx';
import { UpdatePrompt } from './pwa/UpdatePrompt.tsx';

export function App() {
  const session = useSession();

  return (
    <>
      {/* 還在讀取登入狀態時只顯示底色，避免登入頁閃一下 */}
      {session === undefined ? null : session ? <HomePage /> : <SignInPage />}
      <UpdatePrompt />
    </>
  );
}
