import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { Search, Users, ShieldCheck, Save } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TDialogProps } from '~/common';
import { useLocalize } from '~/hooks';
import { useAuthContext } from '~/hooks/AuthContext';
import { cn } from '~/utils';

type QuotaUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  dailyQuotaCny: number;
  usedTodayCny: number;
  cycleQuotaCny?: number;
  usedCycleCny?: number;
  quotaStartDate?: string;
  quotaCycleDays?: number;
  usedMonthCny: number;
  lastMonthCny: number;
  remainingBalanceCny: number;
  usedInputTokens: number;
  usedOutputTokens: number;
};

type QuotaUsersResponse = {
  users: QuotaUser[];
};

const formatNumber = (value: number) => new Intl.NumberFormat().format(value);
const formatMoney4 = (value: number) =>
  new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(Number.isFinite(value) ? value : 0);

const normalizeDateInput = (value?: string) => {
  if (!value || typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  const matched = trimmed.match(/^(\d{4})[-\/](\d{2})[-\/](\d{2})$/);
  if (!matched) {
    return undefined;
  }

  const [, year, month, day] = matched;
  return `${year}-${month}-${day}`;
};

const getQuotaUsers = async (token?: string): Promise<QuotaUsersResponse> => {
  const response = await fetch('/api/quota/users', {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.message ?? 'Failed to fetch quota users');
  }
  return response.json();
};

export default function QuotaManagement({ open, onOpenChange }: TDialogProps) {
  const localize = useLocalize();
  const { token } = useAuthContext();
  const queryClient = useQueryClient();
  const [users, setUsers] = useState<QuotaUser[]>([]);
  const [query, setQuery] = useState('');
  const [statusText, setStatusText] = useState('');

  const usersQuery = useQuery<QuotaUsersResponse>({
    queryKey: ['quota-users'],
    queryFn: () => getQuotaUsers(token),
    enabled: open,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (usersQuery.data?.users) {
      setUsers(usersQuery.data.users);
    }
  }, [usersQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (payload: QuotaUser[]) => {
      await Promise.all(
        payload.map((user) =>
          fetch(`/api/quota/users/${user.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              cycleQuotaCny: user.cycleQuotaCny ?? user.dailyQuotaCny,
              quotaStartDate: normalizeDateInput(user.quotaStartDate),
              quotaCycleDays: Math.max(1, Math.floor(Number(user.quotaCycleDays ?? 1))),
            }),
          }).then(async (res) => {
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data?.message ?? 'Failed to update quota');
            }
          }),
        ),
      );
    },
    onSuccess: async () => {
      setStatusText(localize('com_quota_save_success'));
      await queryClient.invalidateQueries({ queryKey: ['quota-users'] });
    },
    onError: (error: unknown) => {
      if (error instanceof Error) {
        setStatusText(error.message);
        return;
      }
      setStatusText(localize('com_quota_save_failed'));
    },
  });

  const filteredUsers = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return users;
    }

    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(trimmed) ||
        user.email.toLowerCase().includes(trimmed) ||
        user.role.toLowerCase().includes(trimmed),
    );
  }, [users, query]);

  const updateUser = (id: string, updates: Partial<QuotaUser>) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...updates } : u)));
  };

  return (
    <Transition appear show={open}>
      <Dialog as="div" className="relative z-50" onClose={onOpenChange}>
        <TransitionChild
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black opacity-50 dark:opacity-80" aria-hidden="true" />
        </TransitionChild>

        <TransitionChild
          enter="ease-out duration-200"
          enterFrom="opacity-0 scale-95"
          enterTo="opacity-100 scale-100"
          leave="ease-in duration-100"
          leaveFrom="opacity-100 scale-100"
          leaveTo="opacity-0 scale-95"
        >
          <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
            <DialogPanel
              className={cn(
                'w-full max-w-[96vw] xl:max-w-6xl overflow-hidden rounded-xl rounded-b-lg bg-background shadow-2xl backdrop-blur-2xl animate-in sm:rounded-2xl',
              )}
            >
              <DialogTitle className="flex items-center justify-between border-b border-border-light px-6 py-4" as="div">
                <div className="flex items-center gap-2 text-text-primary">
                  <ShieldCheck className="h-5 w-5" />
                  <h2 className="text-lg font-medium leading-6">
                    {localize('com_nav_quota_management')}
                  </h2>
                </div>
                <button
                  type="button"
                  className="rounded-sm opacity-70 transition-opacity hover:opacity-100"
                  onClick={() => onOpenChange(false)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5 text-text-primary"
                  >
                    <line x1="18" x2="6" y1="6" y2="18"></line>
                    <line x1="6" x2="18" y1="6" y2="18"></line>
                  </svg>
                </button>
              </DialogTitle>

              <div className="space-y-4 p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="relative w-full md:max-w-sm">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={localize('com_quota_search_placeholder')}
                      className="h-10 w-full rounded-lg border border-border-light bg-surface-primary pl-9 pr-3 text-sm text-text-primary outline-none focus:border-border-xheavy"
                    />
                  </div>

                  <div className="flex items-center gap-2 text-sm text-text-secondary">
                    <Users className="h-4 w-4" />
                    <span>{localize('com_quota_users_count', { 0: filteredUsers.length })}</span>
                  </div>
                </div>

                {usersQuery.error && (
                  <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
                    {usersQuery.error instanceof Error
                      ? usersQuery.error.message
                      : localize('com_quota_load_failed')}
                  </div>
                )}

                <div className="max-h-[520px] overflow-auto rounded-lg border border-border-light">
                  <table className="min-w-full divide-y divide-border-light text-sm">
                    <thead className="sticky top-0 z-10 bg-surface-secondary text-left text-text-secondary">
                      <tr>
                        <th className="px-4 py-3 font-medium">{localize('com_quota_user')}</th>
                        <th className="px-4 py-3 font-medium">{localize('com_quota_role')}</th>
                        <th className="min-w-[120px] px-4 py-3 font-medium">{localize('com_quota_used_input_tokens')}</th>
                        <th className="min-w-[120px] px-4 py-3 font-medium">{localize('com_quota_used_output_tokens')}</th>
                        <th className="px-4 py-3 font-medium">{localize('com_quota_used_today_rmb')}</th>
                        <th className="px-4 py-3 font-medium">{localize('com_quota_used_month_rmb')}</th>
                        <th className="px-4 py-3 font-medium">{localize('com_quota_used_last_month_rmb')}</th>
                        <th className="px-4 py-3 font-medium">{localize('com_quota_start_date')}</th>
                        <th className="px-4 py-3 font-medium">{localize('com_quota_cycle_days')}</th>
                        <th className="px-4 py-3 font-medium">{localize('com_quota_daily_quota_rmb')}</th>
                        <th className="px-4 py-3 font-medium">{localize('com_quota_remaining_rmb')}</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-border-light bg-background text-text-primary">
                      {usersQuery.isLoading && (
                        <tr>
                          <td className="px-4 py-8 text-center text-text-secondary" colSpan={11}>
                            {localize('com_ui_loading')}
                          </td>
                        </tr>
                      )}

                      {!usersQuery.isLoading && filteredUsers.length === 0 && (
                        <tr>
                          <td className="px-4 py-8 text-center text-text-secondary" colSpan={11}>
                            {localize('com_quota_no_users')}
                          </td>
                        </tr>
                      )}

                      {filteredUsers.map((user) => {
                        const cycleQuotaCny = Number(user.cycleQuotaCny ?? user.dailyQuotaCny ?? 0);
                        const usedCycleCny = Number(user.usedCycleCny ?? user.usedTodayCny ?? 0);
                        const remaining = Math.max(cycleQuotaCny - usedCycleCny, 0);
                        return (
                          <tr key={user.id} className="hover:bg-surface-secondary/40">
                            <td className="px-4 py-3">
                              <div className="max-w-36 truncate font-medium" title={user.name}>
                                {user.name}
                              </div>
                            </td>
                            <td className="px-4 py-3">{user.role}</td>
                            <td className="min-w-[120px] px-4 py-3">{formatNumber(user.usedInputTokens)}</td>
                            <td className="min-w-[120px] px-4 py-3">{formatNumber(user.usedOutputTokens)}</td>
                            <td className="px-4 py-3">{formatMoney4(usedCycleCny)}</td>
                            <td className="px-4 py-3">{formatMoney4(user.usedMonthCny ?? 0)}</td>
                            <td className="px-4 py-3">{formatMoney4(user.lastMonthCny ?? 0)}</td>
                            <td className="px-4 py-3">
                              <input
                                type="date"
                                value={normalizeDateInput(user.quotaStartDate) ?? ''}
                                onChange={(e) => {
                                  updateUser(user.id, {
                                    quotaStartDate: normalizeDateInput(e.target.value),
                                  });
                                }}
                                className="h-9 w-40 rounded-md border border-border-light bg-surface-primary px-3 text-sm outline-none focus:border-border-xheavy"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={Math.max(1, Math.floor(Number(user.quotaCycleDays ?? 1)))}
                                onChange={(e) => {
                                  const value = Number(e.target.value);
                                  updateUser(user.id, {
                                    quotaCycleDays: Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1,
                                  });
                                }}
                                className="h-9 w-16 rounded-md border border-border-light bg-surface-primary px-2 text-sm outline-none focus:border-border-xheavy"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={cycleQuotaCny}
                                onChange={(e) => {
                                  const value = Number(e.target.value);
                                  updateUser(user.id, {
                                    dailyQuotaCny: Number.isFinite(value) && value >= 0 ? value : 0,
                                    cycleQuotaCny: Number.isFinite(value) && value >= 0 ? value : 0,
                                  });
                                }}
                                className="h-9 w-20 rounded-md border border-border-light bg-surface-primary px-2 text-sm outline-none focus:border-border-xheavy"
                              />
                            </td>
                            <td className="px-4 py-3">
                              {formatMoney4(
                                Number.isFinite(user.remainingBalanceCny)
                                  ? user.remainingBalanceCny
                                  : remaining,
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border-light bg-surface-secondary px-4 py-3 text-sm">
                  <span className="text-text-secondary">{statusText}</span>
                  <button
                    type="button"
                    onClick={() => saveMutation.mutate(users)}
                    disabled={saveMutation.isLoading || usersQuery.isLoading}
                    className="inline-flex items-center gap-2 rounded-md bg-surface-tertiary px-3 py-2 text-text-primary hover:bg-surface-hover"
                  >
                    <Save className="h-4 w-4" />
                    {saveMutation.isLoading
                      ? localize('com_ui_loading')
                      : localize('com_quota_save_changes')}
                  </button>
                </div>
              </div>
            </DialogPanel>
          </div>
        </TransitionChild>
      </Dialog>
    </Transition>
  );
}