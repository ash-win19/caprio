import { useAppStore } from './store';
import { clearDateDrafts } from './dateDrafts';

const ACTIVE_ACCOUNT_KEY = 'caprio_active_account';

export function activateAccount(accountId: string) {
  if (localStorage.getItem(ACTIVE_ACCOUNT_KEY) === accountId) return;

  useAppStore.getState().resetAccountState();
  clearDateDrafts();
  localStorage.removeItem('onboarding_complete');
  localStorage.setItem(ACTIVE_ACCOUNT_KEY, accountId);
}

export function clearActiveAccount() {
  clearDateDrafts();
  localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
}
