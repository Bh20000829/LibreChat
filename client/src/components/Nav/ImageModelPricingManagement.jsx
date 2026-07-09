import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { useToastContext } from '@librechat/client';
import { Search, BadgeDollarSign, Save, Plus, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalize } from '~/hooks';
import { useAuthContext } from '~/hooks/AuthContext';
import { cn } from '~/utils';

const getImageModelPricing = async (token) => {
  const response = await fetch('/api/image-model-pricing', {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.message ?? 'Failed to fetch image model pricing');
  }
  return response.json();
};

const createEmptyRow = (billingMode) => ({
  modelName: '',
  billingMode,
  requestPrice: '0',
  textInputPrice: '0',
  cachePrice: '0',
  textOutputPrice: '0',
  imageInputPrice: '0',
  imageOutputPrice: '0',
  multiplier: '1',
});

const decimalInputPattern = /^\d*\.?\d*$/;
const IMAGE_MODEL_PRICING_TITLE = 'image模型计费管理';
const TOKEN_HEADERS = [
  '模型名称',
  '文本输入单价（美元 / 100万 tokens）',
  '缓存单价（美元 / 100万 tokens）',
  '文本输出单价（美元 / 100万 tokens）',
  '图片输入单价（美元 / 100万 tokens）',
  '图片输出单价（美元 / 100万 tokens）',
  '倍率',
  '操作',
];
const REQUEST_HEADERS = ['模型名称', '按次单价（人民币 / 次）', '倍率', '操作'];

const parseNonNegativeDecimal = (value, fieldName) => {
  const normalized = String(value ?? '').trim() === '' ? '0' : String(value).trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a non-negative number`);
  }
  return parsed;
};

export default function ImageModelPricingManagement({ open, onOpenChange }) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { token } = useAuthContext();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [statusText, setStatusText] = useState('');
  const [busyRowKey, setBusyRowKey] = useState(null);
  const [billingMode, setBillingMode] = useState('request');

  const pricingQuery = useQuery({
    queryKey: ['image-model-pricing'],
    queryFn: () => getImageModelPricing(token),
    enabled: open,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!pricingQuery.data?.records) {
      return;
    }

    const mappedRows = pricingQuery.data.records.map((row) => ({
      ...row,
      billingMode: 'request',
      requestPrice: String(row.requestPrice ?? 0),
      textInputPrice: String(row.textInputPrice ?? 0),
      cachePrice: String(row.cachePrice ?? 0),
      textOutputPrice: String(row.textOutputPrice ?? 0),
      imageInputPrice: String(row.imageInputPrice ?? 0),
      imageOutputPrice: String(row.imageOutputPrice ?? 0),
      multiplier: String(row.multiplier ?? 1),
    }));

    const inferredMode = 'request';

    setBillingMode(inferredMode);
    setRows(mappedRows.map((row) => ({ ...row, billingMode: inferredMode })));
  }, [pricingQuery.data]);

  const saveRowMutation = useMutation({
    mutationFn: async (row) => {
      const endpoint = row.id ? `/api/image-model-pricing/${row.id}` : '/api/image-model-pricing';
      const method = row.id ? 'PUT' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          modelName: row.modelName.trim(),
          billingMode,
          requestPrice: parseNonNegativeDecimal(row.requestPrice ?? '0', 'requestPrice'),
          textInputPrice: parseNonNegativeDecimal(row.textInputPrice, 'textInputPrice'),
          cachePrice: parseNonNegativeDecimal(row.cachePrice, 'cachePrice'),
          textOutputPrice: parseNonNegativeDecimal(row.textOutputPrice, 'textOutputPrice'),
          imageInputPrice: parseNonNegativeDecimal(row.imageInputPrice, 'imageInputPrice'),
          imageOutputPrice: parseNonNegativeDecimal(row.imageOutputPrice, 'imageOutputPrice'),
          multiplier: parseNonNegativeDecimal(row.multiplier, 'multiplier'),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message ?? 'Failed to save image model pricing');
      }

      return response.json();
    },
    onSuccess: async () => {
      setStatusText(localize('com_model_pricing_save_success'));
      showToast({
        message: localize('com_model_pricing_save_success'),
        status: 'success',
        duration: 1600,
      });
      await queryClient.invalidateQueries({ queryKey: ['image-model-pricing'] });
    },
    onError: (error) => {
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
    mutationFn: async (rowId) => {
      const response = await fetch(`/api/image-model-pricing/${rowId}`, {
        method: 'DELETE',
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : undefined,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message ?? 'Failed to delete image model pricing');
      }
    },
    onSuccess: async () => {
      setStatusText(localize('com_ui_delete_success'));
      showToast({
        message: localize('com_ui_delete_success'),
        status: 'success',
        duration: 1600,
      });
      await queryClient.invalidateQueries({ queryKey: ['image-model-pricing'] });
    },
    onError: (error) => {
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

  const updateRow = (index, updates) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...updates } : row)));
  };

  const handleModeChange = (nextMode) => {
    setBillingMode(nextMode);
    setRows((prev) => prev.map((row) => ({ ...row, billingMode: nextMode })));
  };

  const handleSaveRow = (row) => {
    if (row.modelName.trim().length === 0) {
      setStatusText('modelName is required');
      return;
    }
    const rowKey = row.id ?? `new:${row.modelName}`;
    setBusyRowKey(rowKey);
    saveRowMutation.mutate(row);
  };

  const handleDeleteRow = (row, rowIndex) => {
    if (!row.id) {
      setRows((prev) => prev.filter((_, i) => i !== rowIndex));
      setStatusText(localize('com_ui_delete_success'));
      showToast({
        message: localize('com_ui_delete_success'),
        status: 'success',
        duration: 1600,
      });
      return;
    }

    setBusyRowKey(row.id);
    deleteRowMutation.mutate(row.id);
  };

  const handleAddRow = () => {
    setRows((prev) => [createEmptyRow(billingMode), ...prev]);
  };

  const isRequestMode = billingMode === 'request';

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
                'w-full max-w-[98vw] overflow-hidden rounded-xl rounded-b-lg bg-background shadow-2xl backdrop-blur-2xl animate-in sm:rounded-2xl xl:max-w-[92rem]',
              )}
            >
              <DialogTitle
                className="flex items-center justify-between border-b border-border-light px-6 py-4"
                as="div"
              >
                <div className="flex items-center gap-2 text-text-primary">
                  <BadgeDollarSign className="h-5 w-5" />
                  <h2 className="text-lg font-medium leading-6">{IMAGE_MODEL_PRICING_TITLE}</h2>
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

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleModeChange('request')}
                      className={cn(
                        'rounded-md px-3 py-2 text-sm transition-colors',
                        isRequestMode
                          ? 'bg-surface-tertiary text-text-primary'
                          : 'border border-border-light text-text-secondary hover:bg-surface-hover',
                      )}
                    >
                      按次计费
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModeChange('token')}
                      className={cn(
                        'rounded-md px-3 py-2 text-sm transition-colors',
                        !isRequestMode
                          ? 'bg-surface-tertiary text-text-primary'
                          : 'border border-border-light text-text-secondary hover:bg-surface-hover',
                      )}
                    >
                      按量计费
                    </button>
                    <button
                      type="button"
                      onClick={handleAddRow}
                      className="inline-flex items-center gap-2 rounded-md bg-surface-tertiary px-3 py-2 text-sm text-text-primary hover:bg-surface-hover"
                    >
                      <Plus className="h-4 w-4" />
                      {localize('com_model_pricing_add')}
                    </button>
                  </div>
                </div>

                <div className="rounded-md border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-secondary">
                  这里配置生图模型价格；实际生效模式由环境变量 IMAGE_BILLING_MODE 决定。
                </div>

                {Boolean(pricingQuery.error) && (
                  <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
                    {pricingQuery.error instanceof Error
                      ? pricingQuery.error.message
                      : localize('com_model_pricing_load_failed')}
                  </div>
                )}

                {statusText ? (
                  <div className="rounded-md border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-secondary">
                    {statusText}
                  </div>
                ) : null}

                <div className="max-h-[520px] overflow-y-auto rounded-lg border border-border-light">
                  <table className="w-full table-fixed divide-y divide-border-light text-sm">
                    <thead className="bg-surface-secondary text-left text-text-secondary">
                      {!isRequestMode ? (
                        <tr>
                          <th className="w-[17%] px-3 py-3 font-medium">{TOKEN_HEADERS[0]}</th>
                          <th className="w-[13%] px-3 py-3 font-medium">{TOKEN_HEADERS[1]}</th>
                          <th className="w-[12%] px-3 py-3 font-medium">{TOKEN_HEADERS[2]}</th>
                          <th className="w-[13%] px-3 py-3 font-medium">{TOKEN_HEADERS[3]}</th>
                          <th className="w-[13%] px-3 py-3 font-medium">{TOKEN_HEADERS[4]}</th>
                          <th className="w-[13%] px-3 py-3 font-medium">{TOKEN_HEADERS[5]}</th>
                          <th className="w-[7%] px-3 py-3 font-medium">{TOKEN_HEADERS[6]}</th>
                          <th className="w-[12%] px-3 py-3 font-medium">{TOKEN_HEADERS[7]}</th>
                        </tr>
                      ) : (
                        <tr>
                          <th className="w-[40%] px-3 py-3 font-medium">{REQUEST_HEADERS[0]}</th>
                          <th className="w-[24%] px-3 py-3 font-medium">{REQUEST_HEADERS[1]}</th>
                          <th className="w-[16%] px-3 py-3 font-medium">{REQUEST_HEADERS[2]}</th>
                          <th className="w-[20%] px-3 py-3 font-medium">{REQUEST_HEADERS[3]}</th>
                        </tr>
                      )}
                    </thead>

                    <tbody className="divide-y divide-border-light bg-background text-text-primary">
                      {pricingQuery.isLoading && (
                        <tr>
                          <td
                            className="px-3 py-8 text-center text-text-secondary"
                            colSpan={isRequestMode ? 4 : 8}
                          >
                            {localize('com_ui_loading')}
                          </td>
                        </tr>
                      )}

                      {!pricingQuery.isLoading && filteredRows.length === 0 && (
                        <tr>
                          <td
                            className="px-3 py-8 text-center text-text-secondary"
                            colSpan={isRequestMode ? 4 : 8}
                          >
                            {localize('com_model_pricing_no_rows')}
                          </td>
                        </tr>
                      )}

                      {filteredRows.map(({ row, index: rowIndex }) => {
                        return !isRequestMode ? (
                          <tr key={`${row.id ?? 'new'}-${row.modelName}-${rowIndex}`}>
                            <td className="px-3 py-3">
                              <input
                                type="text"
                                value={row.modelName}
                                onChange={(e) => updateRow(rowIndex, { modelName: e.target.value })}
                                className="h-9 w-full rounded-md border border-border-light bg-surface-primary px-3 text-sm outline-none focus:border-border-xheavy"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={row.textInputPrice}
                                onChange={(e) => {
                                  const nextValue = e.target.value.trim();
                                  if (!decimalInputPattern.test(nextValue)) {
                                    return;
                                  }
                                  updateRow(rowIndex, { textInputPrice: nextValue });
                                }}
                                className="h-9 w-full rounded-md border border-border-light bg-surface-primary px-3 text-sm outline-none focus:border-border-xheavy"
                              />
                            </td>
                            <td className="px-3 py-3">
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
                                className="h-9 w-full rounded-md border border-border-light bg-surface-primary px-3 text-sm outline-none focus:border-border-xheavy"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={row.textOutputPrice}
                                onChange={(e) => {
                                  const nextValue = e.target.value.trim();
                                  if (!decimalInputPattern.test(nextValue)) {
                                    return;
                                  }
                                  updateRow(rowIndex, { textOutputPrice: nextValue });
                                }}
                                className="h-9 w-full rounded-md border border-border-light bg-surface-primary px-3 text-sm outline-none focus:border-border-xheavy"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={row.imageInputPrice}
                                onChange={(e) => {
                                  const nextValue = e.target.value.trim();
                                  if (!decimalInputPattern.test(nextValue)) {
                                    return;
                                  }
                                  updateRow(rowIndex, { imageInputPrice: nextValue });
                                }}
                                className="h-9 w-full rounded-md border border-border-light bg-surface-primary px-3 text-sm outline-none focus:border-border-xheavy"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={row.imageOutputPrice}
                                onChange={(e) => {
                                  const nextValue = e.target.value.trim();
                                  if (!decimalInputPattern.test(nextValue)) {
                                    return;
                                  }
                                  updateRow(rowIndex, { imageOutputPrice: nextValue });
                                }}
                                className="h-9 w-full rounded-md border border-border-light bg-surface-primary px-3 text-sm outline-none focus:border-border-xheavy"
                              />
                            </td>
                            <td className="px-3 py-3">
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
                                className="h-9 w-full rounded-md border border-border-light bg-surface-primary px-3 text-sm outline-none focus:border-border-xheavy"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center justify-start gap-1.5 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => handleSaveRow(row)}
                                  disabled={
                                    saveRowMutation.isLoading ||
                                    deleteRowMutation.isLoading ||
                                    busyRowKey === (row.id ?? `new:${row.modelName}`)
                                  }
                                  className="inline-flex min-w-[64px] items-center justify-center gap-1 rounded-md bg-surface-tertiary px-2 py-1 text-xs text-text-primary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Save className="h-3.5 w-3.5" />
                                  {row.id
                                    ? localize('com_user_mgmt_update')
                                    : localize('com_model_pricing_add')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRow(row, rowIndex)}
                                  disabled={
                                    saveRowMutation.isLoading ||
                                    deleteRowMutation.isLoading ||
                                    busyRowKey === (row.id ?? `new:${row.modelName}`)
                                  }
                                  className="inline-flex min-w-[64px] items-center justify-center gap-1 rounded-md border border-border-light px-2 py-1 text-xs text-text-primary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  {localize('com_ui_delete')}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <tr key={`${row.id ?? 'new'}-${row.modelName}-${rowIndex}-request`}>
                            <td className="px-3 py-3">
                              <input
                                type="text"
                                value={row.modelName}
                                onChange={(e) => updateRow(rowIndex, { modelName: e.target.value })}
                                className="h-9 w-full rounded-md border border-border-light bg-surface-primary px-3 text-sm outline-none focus:border-border-xheavy"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={row.requestPrice ?? '0'}
                                onChange={(e) => {
                                  const nextValue = e.target.value.trim();
                                  if (!decimalInputPattern.test(nextValue)) {
                                    return;
                                  }
                                  updateRow(rowIndex, { requestPrice: nextValue });
                                }}
                                className="h-9 w-full rounded-md border border-border-light bg-surface-primary px-3 text-sm outline-none focus:border-border-xheavy"
                              />
                            </td>
                            <td className="px-3 py-3">
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
                                className="h-9 w-full rounded-md border border-border-light bg-surface-primary px-3 text-sm outline-none focus:border-border-xheavy"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center justify-start gap-1.5 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => handleSaveRow(row)}
                                  disabled={
                                    saveRowMutation.isLoading ||
                                    deleteRowMutation.isLoading ||
                                    busyRowKey === (row.id ?? `new:${row.modelName}`)
                                  }
                                  className="inline-flex min-w-[64px] items-center justify-center gap-1 rounded-md bg-surface-tertiary px-2 py-1 text-xs text-text-primary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Save className="h-3.5 w-3.5" />
                                  {row.id
                                    ? localize('com_user_mgmt_update')
                                    : localize('com_model_pricing_add')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRow(row, rowIndex)}
                                  disabled={
                                    saveRowMutation.isLoading ||
                                    deleteRowMutation.isLoading ||
                                    busyRowKey === (row.id ?? `new:${row.modelName}`)
                                  }
                                  className="inline-flex min-w-[64px] items-center justify-center gap-1 rounded-md border border-border-light px-2 py-1 text-xs text-text-primary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
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
              </div>
            </DialogPanel>
          </div>
        </TransitionChild>
      </Dialog>
    </Transition>
  );
}
