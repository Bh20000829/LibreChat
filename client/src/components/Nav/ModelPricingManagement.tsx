import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { Search, BadgeDollarSign, Save, Plus, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TDialogProps } from '~/common';
import { useLocalize } from '~/hooks';
import { useAuthContext } from '~/hooks/AuthContext';
import { cn } from '~/utils';

type ModelPricingRow = {
  id?: string;
  modelName: string;
  inputPrice: string;
  cachePrice: string;
  outputPrice: string;
  multiplier: string;
};

type ModelPricingResponse = {
  records: ModelPricingRow[];
};

const getModelPricing = async (token?: string): Promise<ModelPricingResponse> => {
  const response = await fetch('/api/model-pricing', {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.message ?? 'Failed to fetch model pricing');
  }
  return response.json();
};

const createEmptyRow = (): ModelPricingRow => ({
  modelName: '',
  inputPrice: '0',
  cachePrice: '0',
  outputPrice: '0',
  multiplier: '1',
});

const decimalInputPattern = /^\d*\.?\d*$/;

const parseNonNegativeDecimal = (value: string, fieldName: string) => {
  const normalized = value.trim() === '' ? '0' : value.trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a non-negative number`);
  }
  return parsed;
};

export default function ModelPricingManagement({ open, onOpenChange }: TDialogProps) {
  const localize = useLocalize();
  const { token } = useAuthContext();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<ModelPricingRow[]>([]);
  const [query, setQuery] = useState('');
  const [statusText, setStatusText] = useState('');
  const [busyRowKey, setBusyRowKey] = useState<string | null>(null);

  const pricingQuery = useQuery<ModelPricingResponse>({
    queryKey: ['model-pricing'],
    queryFn: () => getModelPricing(token),
    enabled: open,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (pricingQuery.data?.records) {
      setRows(
        pricingQuery.data.records.map((row) => ({
          ...row,
          inputPrice: String(row.inputPrice ?? 0),
          cachePrice: String(row.cachePrice ?? 0),
          outputPrice: String(row.outputPrice ?? 0),
          multiplier: String(row.multiplier ?? 1),
        })),
      );
    }
  }, [pricingQuery.data]);

  const saveRowMutation = useMutation({
    mutationFn: async (row: ModelPricingRow) => {
      const endpoint = row.id ? `/api/model-pricing/${row.id}` : '/api/model-pricing';
      const method = row.id ? 'PUT' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          modelName: row.modelName.trim(),
          inputPrice: parseNonNegativeDecimal(row.inputPrice, 'inputPrice'),
          cachePrice: parseNonNegativeDecimal(row.cachePrice, 'cachePrice'),
          outputPrice: parseNonNegativeDecimal(row.outputPrice, 'outputPrice'),
          multiplier: parseNonNegativeDecimal(row.multiplier, 'multiplier'),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message ?? 'Failed to save model pricing');
      }

      return response.json();
    },
    onSuccess: async () => {
      setStatusText(localize('com_model_pricing_save_success'));
      await queryClient.invalidateQueries({ queryKey: ['model-pricing'] });
    },
    onError: (error: unknown) => {
      if (error instanceof Error) {
        setStatusText(error.message);
        return;
      }
      setStatusText(localize('com_model_pricing_save_failed'));
    },
    onSettled: () => {
      setBusyRowKey(null);
    },
  });

  const deleteRowMutation = useMutation({
    mutationFn: async (rowId: string) => {
      const response = await fetch(`/api/model-pricing/${rowId}`, {
        method: 'DELETE',
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : undefined,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message ?? 'Failed to delete model pricing');
      }
    },
    onSuccess: async () => {
      setStatusText(localize('com_ui_delete_success'));
      await queryClient.invalidateQueries({ queryKey: ['model-pricing'] });
    },
    onError: (error: unknown) => {
      if (error instanceof Error) {
        setStatusText(error.message);
        return;
      }
      setStatusText(localize('com_ui_delete_not_allowed'));
    },
    onSettled: () => {
      setBusyRowKey(null);
    },
  });

  const filteredRows = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return rows.map((row, index) => ({ row, index }));
    }

    return rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.modelName.toLowerCase().includes(trimmed));
  }, [rows, query]);

  const updateRow = (index: number, updates: Partial<ModelPricingRow>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...updates } : row)));
  };

  const handleSaveRow = (row: ModelPricingRow) => {
    if (row.modelName.trim().length === 0) {
      setStatusText('modelName is required');
      return;
    }
    const rowKey = row.id ?? `new:${row.modelName}`;
    setBusyRowKey(rowKey);
    saveRowMutation.mutate(row);
  };

  const handleDeleteRow = (row: ModelPricingRow, rowIndex: number) => {
    if (!row.id) {
      setRows((prev) => prev.filter((_, i) => i !== rowIndex));
      setStatusText(localize('com_ui_delete_success'));
      return;
    }

    setBusyRowKey(row.id);
    deleteRowMutation.mutate(row.id);
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
                'w-full max-w-[88vw] xl:max-w-[84rem] overflow-hidden rounded-xl rounded-b-lg bg-background shadow-2xl backdrop-blur-2xl animate-in sm:rounded-2xl',
              )}
            >
              <DialogTitle className="flex items-center justify-between border-b border-border-light px-6 py-4" as="div">
                <div className="flex items-center gap-2 text-text-primary">
                  <BadgeDollarSign className="h-5 w-5" />
                  <h2 className="text-lg font-medium leading-6">
                    {localize('com_nav_model_pricing_management')}
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
                      placeholder={localize('com_model_pricing_search_placeholder')}
                      className="h-10 w-full rounded-lg border border-border-light bg-surface-primary pl-9 pr-3 text-sm text-text-primary outline-none focus:border-border-xheavy"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setRows((prev) => [createEmptyRow(), ...prev])}
                    className="inline-flex items-center gap-2 rounded-md bg-surface-tertiary px-3 py-2 text-sm text-text-primary hover:bg-surface-hover"
                  >
                    <Plus className="h-4 w-4" />
                    {localize('com_model_pricing_add')}
                  </button>
                </div>

                {pricingQuery.error && (
                  <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
                    {pricingQuery.error instanceof Error
                      ? pricingQuery.error.message
                      : localize('com_model_pricing_load_failed')}
                  </div>
                )}

                <div className="max-h-[520px] overflow-auto rounded-lg border border-border-light">
                  <table className="min-w-[1180px] divide-y divide-border-light text-sm">
                    <thead className="bg-surface-secondary text-left text-text-secondary">
                      <tr>
                        <th className="px-4 py-3 font-medium">{localize('com_model_pricing_model_name')}</th>
                        <th className="px-4 py-3 font-medium">{localize('com_model_pricing_input_price')}</th>
                        <th className="px-4 py-3 font-medium">缓存单价 (USD/1M Tokens)</th>
                        <th className="px-4 py-3 font-medium">{localize('com_model_pricing_output_price')}</th>
                        <th className="px-4 py-3 font-medium">{localize('com_model_pricing_multiplier')}</th>
                        <th className="px-4 py-3 font-medium">{localize('com_user_mgmt_actions')}</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-border-light bg-background text-text-primary">
                      {pricingQuery.isLoading && (
                        <tr>
                          <td className="px-4 py-8 text-center text-text-secondary" colSpan={6}>
                            {localize('com_ui_loading')}
                          </td>
                        </tr>
                      )}

                      {!pricingQuery.isLoading && filteredRows.length === 0 && (
                        <tr>
                          <td className="px-4 py-8 text-center text-text-secondary" colSpan={6}>
                            {localize('com_model_pricing_no_rows')}
                          </td>
                        </tr>
                      )}

                      {filteredRows.map(({ row, index: rowIndex }) => {
                        return (
                          <tr key={`${row.id ?? 'new'}-${row.modelName}-${rowIndex}`}>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                value={row.modelName}
                                onChange={(e) => updateRow(rowIndex, { modelName: e.target.value })}
                                className="h-9 w-56 rounded-md border border-border-light bg-surface-primary px-3 text-sm outline-none focus:border-border-xheavy"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={row.inputPrice}
                                onChange={(e) => {
                                  const nextValue = e.target.value.trim();
                                  if (!decimalInputPattern.test(nextValue)) {
                                    return;
                                  }
                                  updateRow(rowIndex, { inputPrice: nextValue });
                                }}
                                className="h-9 w-40 rounded-md border border-border-light bg-surface-primary px-3 text-sm outline-none focus:border-border-xheavy"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={row.cachePrice}
                                onChange={(e) => {
                                  const nextValue = e.target.value.trim();
                                  if (!decimalInputPattern.test(nextValue)) {
                                    return;
                                  }
                                  updateRow(rowIndex, { cachePrice: nextValue });
                                }}
                                className="h-9 w-40 rounded-md border border-border-light bg-surface-primary px-3 text-sm outline-none focus:border-border-xheavy"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={row.outputPrice}
                                onChange={(e) => {
                                  const nextValue = e.target.value.trim();
                                  if (!decimalInputPattern.test(nextValue)) {
                                    return;
                                  }
                                  updateRow(rowIndex, { outputPrice: nextValue });
                                }}
                                className="h-9 w-40 rounded-md border border-border-light bg-surface-primary px-3 text-sm outline-none focus:border-border-xheavy"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={row.multiplier}
                                onChange={(e) => {
                                  const nextValue = e.target.value.trim();
                                  if (!decimalInputPattern.test(nextValue)) {
                                    return;
                                  }
                                  updateRow(rowIndex, { multiplier: nextValue });
                                }}
                                className="h-9 w-32 rounded-md border border-border-light bg-surface-primary px-3 text-sm outline-none focus:border-border-xheavy"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleSaveRow(row)}
                                  disabled={
                                    saveRowMutation.isLoading ||
                                    deleteRowMutation.isLoading ||
                                    busyRowKey === (row.id ?? `new:${row.modelName}`)
                                  }
                                  className="inline-flex items-center gap-1 rounded-md bg-surface-tertiary px-2 py-1 text-xs text-text-primary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Save className="h-3.5 w-3.5" />
                                  {row.id ? localize('com_user_mgmt_update') : localize('com_model_pricing_add')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRow(row, rowIndex)}
                                  disabled={
                                    saveRowMutation.isLoading ||
                                    deleteRowMutation.isLoading ||
                                    busyRowKey === (row.id ?? `new:${row.modelName}`)
                                  }
                                  className="inline-flex items-center gap-1 rounded-md border border-border-light px-2 py-1 text-xs text-text-primary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  {localize('com_ui_delete')}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border-light bg-surface-secondary px-4 py-3 text-sm">
                  <span className="text-text-secondary">{statusText}</span>
                  <span className="text-text-secondary text-xs">按行保存/删除生效</span>
                </div>
              </div>
            </DialogPanel>
          </div>
        </TransitionChild>
      </Dialog>
    </Transition>
  );
}