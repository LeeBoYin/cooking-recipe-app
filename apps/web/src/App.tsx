import { FormattedMessage } from 'react-intl';
import { UpdatePrompt } from './pwa/UpdatePrompt.tsx';

export function App() {
  return (
    <main className="mx-auto min-h-dvh max-w-[560px] px-4 pt-[calc(44px+env(safe-area-inset-top))]">
      <section className="rounded-chef border-2 border-bulb bg-chef-soft p-4">
        <h1 className="m-0 font-round text-body font-bold">
          <FormattedMessage id="chef.greeting" />
        </h1>
        <p className="m-0 mt-2 text-small text-ink-muted">
          <FormattedMessage id="skeleton.note" />
        </p>
      </section>
      <UpdatePrompt />
    </main>
  );
}
