import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import { SubPage } from '../shell/SubPage.tsx';
import { DietaryEditor } from './DietaryEditor.tsx';

// 我的 → 飲食限制（02 M0 的「我的」）。和新手引導 ④ 共用 DietaryEditor。
export function DietPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  return (
    <SubPage srTitle={intl.formatMessage({ id: 'diet.title' })}>
      <div className="flex flex-col gap-4">
        <h2 className="m-0 font-round text-heading leading-[1.4]"><FormattedMessage id="diet.heading" /></h2>
        <p className="m-0 text-[15px] leading-relaxed text-ink-muted"><FormattedMessage id="diet.intro" /></p>
        <DietaryEditor onDone={() => void navigate(-1)} />
      </div>
    </SubPage>
  );
}
