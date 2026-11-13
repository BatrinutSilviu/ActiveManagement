import { usePermissions } from '../hooks.js';
import { Accounts, Password } from './settings/Accounts.jsx';
import { Backups } from './settings/Backups.jsx';
import { Discounts } from './settings/Discounts.jsx';
import { ProfitSplit, StartingBalance } from './settings/Money.jsx';
import { People } from './settings/People.jsx';
import { Activities, PointsRates, TaskShares } from './settings/Points.jsx';
import { Categories, Sports } from './settings/Sports.jsx';

export default function Settings({ user }) {
  const { canEdit, isAdmin } = usePermissions();
  // Viewers only get their own password; the rest of the page is for changing things.
  if (!canEdit) {
    return (
      <div>
        <div className="page-head"><div><h1>Settings</h1><p>You have a view-only account. Ask an admin if you need to change data.</p></div></div>
        <Password />
      </div>
    );
  }
  return (
    <div>
      <div className="page-head"><div><h1>Settings</h1><p>People, discounts, points table, default split, sports, starting balance, categories{isAdmin ? ', accounts and backups' : ''}.</p></div></div>
      <div className="stack">
        <People />
        <Discounts />
        <div className="grid grid-2">
          <PointsRates />
          <TaskShares />
        </div>
        <Activities />
        <div className="grid grid-2">
          <ProfitSplit />
          <Sports />
        </div>
        <StartingBalance />
        <Categories />
        {isAdmin && <Accounts user={user} />}
        {isAdmin && <Backups />}
        <Password />
      </div>
    </div>
  );
}
