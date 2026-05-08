import { LocalStorageKeys } from 'librechat-data-provider';

export type ConversationMode = 'chat' | 'image';

export const normalizeConversationMode = (mode?: string | null): ConversationMode =>
  mode === 'image' ? 'image' : 'chat';

export const getModeLastConvoSetupKey = (index = 0, mode?: string | null) => {
  const normalizedMode = normalizeConversationMode(mode);
  return normalizedMode === 'image'
    ? `${LocalStorageKeys.LAST_CONVO_SETUP}_${index}_image`
    : `${LocalStorageKeys.LAST_CONVO_SETUP}_${index}`;
};

export const getModeLastModelKey = (mode?: string | null) => {
  const normalizedMode = normalizeConversationMode(mode);
  return normalizedMode === 'image'
    ? `${LocalStorageKeys.LAST_MODEL}_image`
    : LocalStorageKeys.LAST_MODEL;
};

export const getModeLastToolsKey = (mode?: string | null) => {
  const normalizedMode = normalizeConversationMode(mode);
  return normalizedMode === 'image'
    ? `${LocalStorageKeys.LAST_TOOLS}_image`
    : LocalStorageKeys.LAST_TOOLS;
};

export const getModeLastSpecKey = (mode?: string | null) => {
  const normalizedMode = normalizeConversationMode(mode);
  return normalizedMode === 'image'
    ? `${LocalStorageKeys.LAST_SPEC}_image`
    : LocalStorageKeys.LAST_SPEC;
};

export const withModeSearchParams = (
  searchParams: URLSearchParams | string | undefined,
  mode?: string | null,
) => {
  const params = new URLSearchParams(searchParams ?? '');
  params.set('mode', normalizeConversationMode(mode));
  return params;
};