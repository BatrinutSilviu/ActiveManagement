import { useBusiness } from '../business.js';
import { usePermissions } from '../hooks.js';
import { t } from '../i18n/index.js';
import { Business } from './settings/Business.jsx';
import { Accounts, Password } from './settings/Accounts.jsx';
import { Backups } from './settings/Backups.jsx';
import { Discounts } from './settings/Discounts.jsx';
import { ProfitSplit, StartingBalance } from './settings/Money.jsx';
import { People } from './settings/People.jsx';
import { Activities, PointsRates, TaskShares } from './settings/Points.jsx';
import { DevPoints } from './settings/DevPoints.jsx';
import { Categories, Sports } from './settings/Sports.jsx';
import { Conditions, Entities, PackageTypes, Services, Therapists, Venues } from './practice/Services.jsx';

export default function Settings({ user }) {
  const { canEdit, isAdmin } = usePermissions();
  const { on, term } = useBusiness();
  // Viewers only get their own password; the rest of the page is for changing things.
  if (!canEdit) {
    return (
      <div>
        <div className="page-head"><div><h1>{t('Settings')}</h1><p>{t('You have a view-only account. Ask an admin if you need to change data.')}</p></div></div>
        <Password />
      </div>
    );
  }
  return (
    <div>
      <div className="page-head"><div><h1>{t('Settings')}</h1><p>{[
        isAdmin && t('Business'), on('events') && t('people'), on('events') && t('discounts'),
        on('payouts') && t('points table'), on('payouts') && t('default split'), t(term('sports')), t('starting balance'), t('categories'),
        isAdmin && t('accounts and backups'),
      ].filter(Boolean).join(', ').replace(/^./, (c) => c.toUpperCase())}.</p></div></div>
      <div className="stack">
        {isAdmin && <Business />}
        {on('events') && <People />}
        {on('events') && <Discounts />}
        {on('payouts') && <>
          <div className="grid grid-2">
            <PointsRates />
            <TaskShares />
          </div>
          <Activities />
          {isAdmin && <DevPoints />}
        </>}
        {on('events') ? (
          <div className="grid grid-2">
            {on('payouts') && <ProfitSplit />}
            <Sports />
          </div>
        ) : <><Services /><PackageTypes /><Venues /><Entities /><Therapists /><Conditions /></>}
        <StartingBalance />
        <Categories />
        {isAdmin && <Accounts user={user} />}
        {isAdmin && <Backups />}
        <Password />
      </div>
    </div>
  );
}
