import { useQueryClient } from '@tanstack/react-query';
import { FormattedMessage } from 'react-intl';
import { Chef } from '../../chef/Chef.tsx';
import { signOut } from '../../data/auth.ts';
import { useCurrentKitchen } from '../../data/hooks.ts';

// 登入後的首頁。目前只有大廚區塊，其他區塊照 17〈首頁〉一個一個做。
export function HomePage() {
  const queryClient = useQueryClient();
  const { kitchen, isPending, error } = useCurrentKitchen();

  async function onSignOut() {
    await signOut();
    queryClient.clear();
  }

  return (
    <main className="mx-auto min-h-dvh max-w-[560px] px-4 pt-[calc(44px+env(safe-area-inset-top))]">
      <section className="relative rounded-chef border-2 border-bulb bg-chef-soft px-4 pt-12 pb-4">
        <Chef size={56} className="absolute -top-[30px] left-3" />
        <h1 className="absolute top-2 left-[76px] m-0 font-round text-body font-bold">
          <FormattedMessage id="chef.greeting" />
        </h1>
        <p className="m-0 text-caption text-ink-muted">
          {isPending ? (
            <FormattedMessage id="common.loading" />
          ) : error || !kitchen ? (
            <FormattedMessage id="home.loadError" />
          ) : (
            <FormattedMessage id="home.placeholder" values={{ kitchen: kitchen.name }} />
          )}
        </p>
      </section>

      <button
        type="button"
        onClick={() => void onSignOut()}
        className="mt-6 min-h-11 border-0 bg-transparent px-0 text-caption font-bold text-ink underline underline-offset-4"
      >
        <FormattedMessage id="signOut" />
      </button>
    </main>
  );
}
