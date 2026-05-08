import { useCallback } from 'react';
import { useSetRecoilState } from 'recoil';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, Constants, dataService, getEndpointField } from 'librechat-data-provider';
import type {
  TEndpointsConfig,
  TStartupConfig,
  TModelsConfig,
  TConversation,
} from 'librechat-data-provider';
import { getDefaultEndpoint, clearMessagesCache, buildDefaultConvo, logger } from '~/utils';
import { useApplyModelSpecEffects } from '~/hooks/Agents';
import store from '~/store';
import { normalizeConversationMode, withModeSearchParams } from '~/utils/conversationMode';

const useNavigateToConvo = (index = 0) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clearAllConversations = store.useClearConvoState();
  const applyModelSpecEffects = useApplyModelSpecEffects();
  const setSubmission = useSetRecoilState(store.submissionByIndex(index));
  const clearAllLatestMessages = store.useClearLatestMessages(`useNavigateToConvo ${index}`);
  const { hasSetConversation, setConversation: setConvo } = store.useCreateConversationAtom(index);

  const setConversation = useCallback(
    (conversation: TConversation) => {
      setConvo(conversation);
      if (!conversation.spec) {
        return;
      }

      const startupConfig = queryClient.getQueryData<TStartupConfig>([QueryKeys.startupConfig]);
      applyModelSpecEffects({
        startupConfig,
        specName: conversation?.spec,
        convoId: conversation.conversationId,
      });
    },
    [setConvo, queryClient, applyModelSpecEffects],
  );

  const fetchFreshData = async (conversation?: Partial<TConversation>) => {
    const conversationId = conversation?.conversationId;
    if (!conversationId) {
      return;
    }
    try {
      const data = await queryClient.fetchQuery([QueryKeys.conversation, conversationId], () =>
        dataService.getConversationById(conversationId),
      );
      logger.log('conversation', 'Fetched fresh conversation data', data);
      setConversation(data);
      const params = withModeSearchParams('', data.mode);
      navigate(`/c/${conversationId ?? Constants.NEW_CONVO}?${params.toString()}`, {
        state: { focusChat: true },
      });
    } catch (error) {
      console.error('Error fetching conversation data on navigation', error);
      if (conversation) {
        setConversation(conversation as TConversation);
        const params = withModeSearchParams('', conversation.mode);
        navigate(`/c/${conversationId}?${params.toString()}`, { state: { focusChat: true } });
      }
    }
  };

  const navigateToConvo = (
    conversation?: TConversation | null,
    options?: {
      resetLatestMessage?: boolean;
      currentConvoId?: string;
    },
  ) => {
    if (!conversation) {
      logger.warn('conversation', 'Conversation not provided to `navigateToConvo`');
      return;
    }
    const { resetLatestMessage = true, currentConvoId } = options || {};
    logger.log('conversation', 'Navigating to conversation', conversation);
    hasSetConversation.current = true;
    setSubmission(null);
    if (resetLatestMessage) {
      logger.log('latest_message', 'Clearing all latest messages');
      clearAllLatestMessages();
    }

    let convo = { ...conversation };
    const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
    if (!convo.endpoint || !endpointsConfig?.[convo.endpoint]) {
      /* undefined/removed endpoint edge case */
      const modelsConfig = queryClient.getQueryData<TModelsConfig>([
        QueryKeys.models,
        { mode: normalizeConversationMode(conversation.mode) },
      ]);
      const defaultEndpoint = getDefaultEndpoint({
        convoSetup: conversation,
        endpointsConfig,
      });

      const endpointType = getEndpointField(endpointsConfig, defaultEndpoint, 'type');
      if (!conversation.endpointType && endpointType) {
        conversation.endpointType = endpointType;
      }

      const models = modelsConfig?.[defaultEndpoint ?? ''] ?? [];

      convo = buildDefaultConvo({
        models,
        conversation,
        endpoint: defaultEndpoint,
        lastConversationSetup: conversation,
      });
    }
    clearAllConversations(true);
    clearMessagesCache(queryClient, currentConvoId);
    if (convo.conversationId !== Constants.NEW_CONVO && convo.conversationId) {
      queryClient.invalidateQueries([QueryKeys.conversation, convo.conversationId]);
      fetchFreshData(convo);
    } else {
      setConversation(convo);
      const params = withModeSearchParams('', normalizeConversationMode(convo.mode));
      navigate(`/c/${convo.conversationId ?? Constants.NEW_CONVO}?${params.toString()}`, {
        state: { focusChat: true },
      });
    }
  };

  return {
    navigateToConvo,
  };
};

export default useNavigateToConvo;
