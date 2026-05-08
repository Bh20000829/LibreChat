import { excludedKeys } from 'librechat-data-provider';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import type {
  TEndpointsConfig,
  TModelsConfig,
  TConversation,
  TPreset,
} from 'librechat-data-provider';
import { getDefaultEndpoint, buildDefaultConvo } from '~/utils';
import { useGetEndpointsQuery } from '~/data-provider';
import useConversationMode from './useConversationMode';
import { normalizeConversationMode } from '~/utils/conversationMode';

type TDefaultConvo = {
  conversation: Partial<TConversation>;
  preset?: Partial<TPreset> | null;
  cleanInput?: boolean;
  cleanOutput?: boolean;
};

const exceptions = new Set(['spec', 'iconURL']);

const useDefaultConvo = () => {
  const { mode } = useConversationMode();
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();
  const { data: modelsConfig = {} as TModelsConfig } = useGetModelsQuery(undefined, { mode });

  const getDefaultConversation = ({
    conversation: _convo,
    preset,
    cleanInput,
    cleanOutput,
  }: TDefaultConvo) => {
    const convoMode = normalizeConversationMode(preset?.mode ?? _convo.mode ?? mode);
    const endpoint = getDefaultEndpoint({
      convoSetup: { ...(preset as TPreset), mode: convoMode },
      endpointsConfig,
    });

    const models = modelsConfig[endpoint ?? ''] || [];
    const conversation = { ..._convo, mode: convoMode };
    if (cleanInput === true) {
      for (const key in conversation) {
        if (excludedKeys.has(key) && !exceptions.has(key)) {
          continue;
        }
        if (conversation[key] == null) {
          continue;
        }
        conversation[key] = undefined;
      }
    }

    const defaultConvo = buildDefaultConvo({
      conversation: conversation as TConversation,
      endpoint,
      lastConversationSetup: { ...(preset as TConversation), mode: convoMode },
      models,
    });

    if (!cleanOutput) {
      return defaultConvo;
    }

    for (const key in defaultConvo) {
      if (excludedKeys.has(key) && !exceptions.has(key)) {
        continue;
      }
      if (defaultConvo[key] == null) {
        continue;
      }
      defaultConvo[key] = undefined;
    }

    return defaultConvo;
  };

  return getDefaultConversation;
};

export default useDefaultConvo;
