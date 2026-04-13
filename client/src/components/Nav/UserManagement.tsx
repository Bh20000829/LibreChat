import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { Search, Users, Plus, Save, Trash2, Eye, EyeOff } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TDialogProps } from '~/common';
import { useLocalize } from '~/hooks';
import { useAuthContext } from '~/hooks/AuthContext';
import { cn } from '~/utils';

type ManagedUser = {
  id?: string;
  name: string;
  email: string;
  groupType?: number | null;
  providerApiKey?: string;
  password?: string;
};

type UsersResponse = {
  users: ManagedUser[];
};

const createNewUserRow = (): ManagedUser => ({
  name: '',
  email: '',
  groupType: null,
  providerApiKey: '',
  password: '',
});

const getUsers = async (token?: string): Promise<UsersResponse> => {
  const response = await fetch('/api/user-management/users', {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.message ?? 'Failed to fetch users');
  }
  return response.json();
};

export default function UserManagement({ open, onOpenChange }: TDialogProps) {
  const localize = useLocalize();
  const { token } = useAuthContext();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<ManagedUser[]>([]);
  const [query, setQuery] = useState('');
  const [statusText, setStatusText] = useState('');
  const [passwordVisibility, setPasswordVisibility] = useState<Record<string, boolean>>({});

  const usersQuery = useQuery<UsersResponse>({
    queryKey: ['managed-users'],
    queryFn: () => getUsers(token),
    enabled: open,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (usersQuery.data?.users) {
      setRows(usersQuery.data.users.map((user) => ({ ...user, password: '' })));
    }
  }, [usersQuery.data]);

  const filteredRows = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return rows.map((row, index) => ({ row, index }));
    }

    return rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => {
        return (
          row.name.toLowerCase().includes(trimmed) ||
          row.email.toLowerCase().includes(trimmed) ||
          String(row.groupType ?? '').includes(trimmed)
        );
      });
  }, [rows, query]);

  const updateRow = (index: number, updates: Partial<ManagedUser>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...updates } : row)));
  };

  const createMutation = useMutation({
    mutationFn: async (row: ManagedUser) => {
      const response = await fetch('/api/user-management/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: row.name,
          email: row.email,
          password: row.password,
          groupType: row.groupType,
          providerApiKey: row.providerApiKey,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message ?? 'Failed to create user');
      }

      return payload;
    },
    onSuccess: async (payload: { generatedPassword?: string; passwordGenerated?: boolean }) => {
      if (payload?.passwordGenerated && payload?.generatedPassword) {
        setStatusText(
          `${localize('com_user_mgmt_create_success')} ${localize('com_user_mgmt_generated_password')}: ${payload.generatedPassword}`,
        );
      } else {
        setStatusText(localize('com_user_mgmt_create_success'));
      }
      await queryClient.invalidateQueries({ queryKey: ['managed-users'] });
    },
    onError: (error: unknown) => {
      setStatusText(error instanceof Error ? error.message : localize('com_user_mgmt_operation_failed'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (row: ManagedUser) => {
      if (!row.id) {
        throw new Error('Missing user id');
      }
      const response = await fetch(`/api/user-management/users/${row.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: row.name,
          email: row.email,
          password: row.password,
          groupType: row.groupType,
          providerApiKey: row.providerApiKey,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message ?? 'Failed to update user');
      }
    },
    onSuccess: async () => {
      setStatusText(localize('com_user_mgmt_update_success'));
      await queryClient.invalidateQueries({ queryKey: ['managed-users'] });
    },
    onError: (error: unknown) => {
      setStatusText(error instanceof Error ? error.message : localize('com_user_mgmt_operation_failed'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(`/api/user-management/users/${userId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message ?? 'Failed to delete user');
      }
    },
    onSuccess: async () => {
      setStatusText(localize('com_user_mgmt_delete_success'));
      await queryClient.invalidateQueries({ queryKey: ['managed-users'] });
    },
    onError: (error: unknown) => {
      setStatusText(error instanceof Error ? error.message : localize('com_user_mgmt_operation_failed'));
    },
  });

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
                'w-full max-w-[98vw] xl:max-w-[92rem] overflow-hidden rounded-xl rounded-b-lg bg-background shadow-2xl backdrop-blur-2xl animate-in sm:rounded-2xl',
              )}
            >
              <DialogTitle className="flex items-center justify-between border-b border-border-light px-6 py-4" as="div">
                <div className="flex items-center gap-2 text-text-primary">
                  <Users className="h-5 w-5" />
                  <h2 className="text-lg font-medium leading-6">{localize('com_nav_user_management')}</h2>
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
                      placeholder={localize('com_user_mgmt_search_placeholder')}
                      className="h-10 w-full rounded-lg border border-border-light bg-surface-primary pl-9 pr-3 text-sm text-text-primary outline-none focus:border-border-xheavy"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setRows((prev) => [createNewUserRow(), ...prev])}
                    className="inline-flex items-center gap-2 rounded-md bg-surface-tertiary px-3 py-2 text-sm text-text-primary hover:bg-surface-hover"
                  >
                    <Plus className="h-4 w-4" />
                    {localize('com_user_mgmt_add')}
                  </button>
                </div>

                {usersQuery.error && (
                  <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
                    {usersQuery.error instanceof Error
                      ? usersQuery.error.message
                      : localize('com_user_mgmt_load_failed')}
                  </div>
                )}

                <div className="max-h-[520px] overflow-auto rounded-lg border border-border-light">
                  <table className="min-w-full divide-y divide-border-light text-sm">
                    <thead className="bg-surface-secondary text-left text-text-secondary">
                      <tr>
                        <th className="px-4 py-3 font-medium">{localize('com_quota_user')}</th>
                        <th className="px-4 py-3 font-medium">{localize('com_user_mgmt_email')}</th>
                        <th className="px-4 py-3 font-medium">{localize('com_user_mgmt_group_type')}</th>
                        <th className="px-4 py-3 font-medium">{localize('com_user_mgmt_provider_api_key')}</th>
                        <th className="px-4 py-3 font-medium">{localize('com_user_mgmt_password')}</th>
                        <th className="px-4 py-3 font-medium">{localize('com_user_mgmt_actions')}</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-border-light bg-background text-text-primary">
                      {usersQuery.isLoading && (
                        <tr>
                          <td className="px-4 py-8 text-center text-text-secondary" colSpan={6}>
                            {localize('com_ui_loading')}
                          </td>
                        </tr>
                      )}

                      {!usersQuery.isLoading && filteredRows.length === 0 && (
                        <tr>
                          <td className="px-4 py-8 text-center text-text-secondary" colSpan={6}>
                            {localize('com_user_mgmt_no_users')}
                          </td>
                        </tr>
                      )}

                      {filteredRows.map(({ row, index }) => {
                        const isNew = !row.id;
                        const rowKey = row.id ?? `new-${index}`;
                        const visible = passwordVisibility[rowKey] === true;
                        return (
                          <tr key={`${row.id ?? 'new'}-${index}`}>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                value={row.name}
                                onChange={(e) => updateRow(index, { name: e.target.value })}
                                className="h-9 w-44 rounded-md border border-border-light bg-surface-primary px-3 text-sm outline-none focus:border-border-xheavy"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="email"
                                value={row.email}
                                onChange={(e) => updateRow(index, { email: e.target.value })}
                                className="h-9 w-56 rounded-md border border-border-light bg-surface-primary px-3 text-sm outline-none focus:border-border-xheavy"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={row.groupType == null ? '' : String(row.groupType)}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  updateRow(index, { groupType: value === '' ? null : Number(value) });
                                }}
                                className="h-9 w-24 rounded-md border border-border-light bg-surface-primary px-2 text-sm outline-none focus:border-border-xheavy"
                              >
                                <option value="">-</option>
                                <option value="1">1</option>
                                <option value="2">2</option>
                                <option value="3">3</option>
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                value={row.providerApiKey ?? ''}
                                onChange={(e) => updateRow(index, { providerApiKey: e.target.value })}
                                className="h-9 w-64 rounded-md border border-border-light bg-surface-primary px-3 text-sm outline-none focus:border-border-xheavy"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="relative">
                                <input
                                  type={visible ? 'text' : 'password'}
                                  value={row.password ?? ''}
                                  placeholder={
                                    isNew
                                      ? localize('com_user_mgmt_password_required')
                                      : localize('com_user_mgmt_password_update_optional')
                                  }
                                  onChange={(e) => updateRow(index, { password: e.target.value })}
                                  className="h-9 w-56 rounded-md border border-border-light bg-surface-primary px-3 pr-9 text-sm outline-none focus:border-border-xheavy"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPasswordVisibility((prev) => ({
                                      ...prev,
                                      [rowKey]: !(prev[rowKey] === true),
                                    }))
                                  }
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
                                >
                                  {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isNew) {
                                      if (!row.password || row.password.trim().length < 8) {
                                        setStatusText(localize('com_user_mgmt_password_required_message'));
                                        return;
                                      }
                                      createMutation.mutate(row);
                                    } else {
                                      updateMutation.mutate(row);
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 rounded-md bg-surface-tertiary px-2 py-1 text-xs text-text-primary hover:bg-surface-hover"
                                >
                                  <Save className="h-3.5 w-3.5" />
                                  {isNew
                                    ? localize('com_user_mgmt_create')
                                    : localize('com_user_mgmt_update')}
                                </button>
                                {!isNew && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!row.id) {
                                        return;
                                      }
                                      if (!window.confirm(localize('com_user_mgmt_delete_confirm'))) {
                                        return;
                                      }
                                      deleteMutation.mutate(row.id);
                                    }}
                                    className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-600 hover:bg-red-500/20"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    {localize('com_ui_delete')}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-lg border border-border-light bg-surface-secondary px-4 py-3 text-sm text-text-secondary">
                  {statusText}
                </div>
              </div>
            </DialogPanel>
          </div>
        </TransitionChild>
      </Dialog>
    </Transition>
  );
}
