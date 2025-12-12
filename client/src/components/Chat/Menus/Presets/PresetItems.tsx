// 1. 引入图标
import { Download, FileDown } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { Close } from '@radix-ui/react-popover';
import { Flipper, Flipped } from 'react-flip-toolkit';
import { getEndpointField } from 'librechat-data-provider';
import {
  Dialog,
  Label,
  PinIcon,
  EditIcon,
  TrashIcon,
  DialogTrigger,
  DialogTemplate,
} from '@librechat/client';
import type { TPreset } from 'librechat-data-provider';
import type { FC } from 'react';
import FileUpload from '~/components/Chat/Input/Files/FileUpload';
import { useGetEndpointsQuery } from '~/data-provider';
import { getPresetTitle, getIconKey } from '~/utils';
import { MenuSeparator, MenuItem } from '../UI';
import { icons } from '~/hooks/Endpoint/Icons';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const PresetItems: FC<{
  presets?: Array<TPreset | undefined>;
  onSetDefaultPreset: (preset: TPreset, remove?: boolean) => void;
  onSelectPreset: (preset: TPreset) => void;
  onChangePreset: (preset: TPreset) => void;
  onDeletePreset: (preset: TPreset) => void;
  clearAllPresets: () => void;
  onFileSelected: (jsonData: Record<string, unknown>) => void;
}> = ({
  presets,
  onSetDefaultPreset,
  onSelectPreset,
  onChangePreset,
  onDeletePreset,
  clearAllPresets,
  onFileSelected,
}) => {
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const defaultPreset = useRecoilValue(store.defaultPreset);
  const localize = useLocalize();

  // 2. 导出函数 (放在组件内部)
  const exportPreset = (e: React.MouseEvent, preset: TPreset) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const jsonString = JSON.stringify(preset, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // 安全的文件名处理
      const safeTitle = (preset.title || 'preset').replace(/[^a-z0-9\u4e00-\u9fa5_.-]/gi, '_');
      link.download = `${safeTitle}.json`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  // --- 新增：下载模版逻辑 ---
  const handleDownloadTemplate = (e: React.MouseEvent) => {
    e.preventDefault();
    // 这里定义你想要的“标准模版”内容
    const templateData = {
      title: '新的角色预设 (预设列表显示的名称)',
      chatGptLabel: 'AI 的显示昵称 (聊天显示的昵称)',
      endpoint:
        '指定使用哪一个服务商的接口（只能选择以下内容：openAI、google、anthropic、deepseek），区分大小写',
      endpointType:
        '跟上面的 endpoint 值一一对应，openAI->openAI，google->google、anthropic->anthropic、deepseek->custom',
      model: '上面 endpoint 指定的服务商对应的模型',
      promptPrefix: '核心角色设定，系统提示词',
      // 高级参数 (可选)
      modelConfig: {
        temperature: 0.7, // 范围：0.0 ~ 2.0，控制回答的随机性和创造力
        top_p: 1, // 另一种控制随机性的方法。通常建议和 temperature 只调其中一个，另一个保持默认。
        presence_penalty: 0, // 范围：-2.0 ~ 2.0，作用：数值越高，AI 越倾向于谈论新话题。
        frequency_penalty: 0, // 范围：-2.0 ~ 2.0，数值越高，AI 越会避免使用已经出现过的词。如果你觉得 AI 像复读机，调高它。
      },
    };

    const jsonString = JSON.stringify(templateData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'preset_template.json'; // 下载的文件名
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  // --- 新增结束 ---

  return (
    <>
      <div
        role="menuitem"
        className="pointer-none group m-1.5 flex h-8 min-w-[170px] gap-2 rounded px-5 py-2.5 !pr-3 text-sm !opacity-100 focus:ring-0 radix-disabled:pointer-events-none radix-disabled:opacity-50 md:min-w-[240px]"
        tabIndex={-1}
      >
        <div className="flex h-full grow items-center justify-end gap-2">
          <label
            htmlFor="default-preset"
            className="w-40 truncate rounded bg-transparent py-1 text-xs font-medium text-gray-600 transition-colors dark:bg-transparent dark:text-gray-300 sm:w-72"
          >
            {defaultPreset
              ? `${localize('com_endpoint_preset_default_item')} ${defaultPreset.title}`
              : localize('com_endpoint_preset_default_none')}
          </label>
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="mr-1 flex h-[32px] cursor-pointer items-center rounded bg-transparent px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-red-700 focus:ring-ring dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-red-700"
                aria-label={localize('com_ui_clear') + ' ' + localize('com_ui_all')}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                  className="mr-1 flex w-[22px] items-center"
                  aria-hidden="true"
                >
                  <path d="M9.293 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.707A1 1 0 0 0 13.707 4L10 .293A1 1 0 0 0 9.293 0M9.5 3.5v-2l3 3h-2a1 1 0 0 1-1-1M6.854 7.146 8 8.293l1.146-1.147a.5.5 0 1 1 .708.708L8.707 9l1.147 1.146a.5.5 0 0 1-.708.708L8 9.707l-1.146 1.147a.5.5 0 0 1-.708-.708L7.293 9 6.146 7.854a.5.5 0 1 1 .708-.708"></path>
                </svg>
                {localize('com_ui_clear')} {localize('com_ui_all')}
              </button>
            </DialogTrigger>
            <DialogTemplate
              showCloseButton={false}
              title={`${localize('com_ui_clear')} ${localize('com_endpoint_presets')}`}
              className="max-w-[450px]"
              main={
                <>
                  <div className="flex w-full flex-col items-center gap-2">
                    <div className="grid w-full items-center gap-2">
                      <Label
                        htmlFor="preset-item-clear-all"
                        className="text-left text-sm font-medium"
                      >
                        {localize('com_endpoint_presets_clear_warning')}
                      </Label>
                    </div>
                  </div>
                </>
              }
              selection={{
                selectHandler: clearAllPresets,
                selectClasses: 'bg-red-600 hover:bg-red-700 dark:hover:bg-red-600 text-white',
                selectText: localize('com_ui_clear'),
              }}
            />

            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="mr-1 flex h-[32px] cursor-pointer items-center rounded bg-transparent px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-blue-700 focus:ring-ring dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-blue-500"
              title="下载预设模版"
            >
              <FileDown className="mr-1 h-4 w-4" />
              模版
            </button>

            <FileUpload onFileSelected={onFileSelected} />
          </Dialog>
        </div>
      </div>
      {presets && presets.length === 0 && (
        <div
          role="menuitem"
          className="pointer-none group m-1.5 flex h-8 min-w-[170px] gap-2 rounded px-5 py-2.5 !pr-3 text-sm !opacity-100 focus:ring-0 radix-disabled:pointer-events-none radix-disabled:opacity-50 md:min-w-[240px]"
          tabIndex={-1}
        >
          <div className="flex h-full grow items-center justify-end gap-2 text-gray-600 dark:text-gray-300">
            {/* TODO: Create Preset from here */}
            {localize('com_endpoint_no_presets')}
          </div>
        </div>
      )}
      <Flipper
        flipKey={presets
          ?.map((preset) => preset?.presetId)
          .filter((p) => p)
          .join('.')}
      >
        {presets &&
          presets.length > 0 &&
          presets.map((preset, i) => {
            const presetId = preset?.presetId ?? '';
            if (!preset || !presetId) {
              return null;
            }

            const iconKey = getIconKey({ endpoint: preset.endpoint, endpointsConfig });
            const Icon = icons[iconKey];

            return (
              <Close asChild key={`preset-${presetId}`}>
                <div key={`preset-${presetId}`}>
                  <Flipped flipId={presetId}>
                    <MenuItem
                      key={`preset-item-${presetId}`}
                      textClassName="text-xs max-w-[150px] sm:max-w-[200px] truncate md:max-w-full "
                      title={getPresetTitle(preset)}
                      onClick={() => onSelectPreset(preset)}
                      icon={
                        Icon != null && (
                          <Icon
                            context="menu-item"
                            iconURL={getEndpointField(endpointsConfig, preset.endpoint, 'iconURL')}
                            className="icon-md mr-1 dark:text-white"
                            endpoint={preset.endpoint}
                          />
                        )
                      }
                      selected={false}
                      data-testid={`preset-item-${preset}`}
                    >
                      <div className="flex h-full items-center justify-end gap-1">
                        <button
                          className={cn(
                            'm-0 h-full rounded-md bg-transparent p-2 text-gray-400 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
                            defaultPreset?.presetId === presetId
                              ? ''
                              : 'sm:invisible sm:group-hover:visible',
                          )}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onSetDefaultPreset(preset, defaultPreset?.presetId === presetId);
                          }}
                        >
                          <PinIcon unpin={defaultPreset?.presetId === presetId} />
                        </button>
                        <button
                          className="m-0 h-full rounded-md p-2 text-gray-400 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 sm:invisible sm:group-hover:visible"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onChangePreset(preset);
                          }}
                        >
                          <EditIcon />
                        </button>
                        <button
                          className="m-0 h-full rounded-md p-2 text-gray-400 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 sm:invisible sm:group-hover:visible"
                          onClick={(e) => exportPreset(e, preset)}
                          title="Export JSON"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        <button
                          className="m-0 h-full rounded-md p-2 text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-200 sm:invisible sm:group-hover:visible"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDeletePreset(preset);
                          }}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </MenuItem>
                  </Flipped>
                  {i !== presets.length - 1 && <MenuSeparator />}
                </div>
              </Close>
            );
          })}
      </Flipper>
    </>
  );
};

export default PresetItems;
