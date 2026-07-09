import { useRecoilValue, useResetRecoilState } from 'recoil';
import { useCallback, useMemo, useState } from 'react';
import { useUpdateFeedbackMutation } from 'librechat-data-provider/react-query';
import {
  isAssistantsEndpoint,
  isAgentsEndpoint,
  TUpdateFeedbackRequest,
  getTagByKey,
  TFeedback,
  toMinimalFeedback,
  SearchResultData,
} from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { TMessageProps } from '~/common';
import {
  useChatContext,
  useAddedChatContext,
  useAssistantsMapContext,
  useAgentsMapContext,
} from '~/Providers';
import useCopyToClipboard from './useCopyToClipboard';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';
import store from '~/store';

export type TMessageActions = Pick<
  TMessageProps,
  'message' | 'currentEditId' | 'setCurrentEditId'
> & {
  isMultiMessage?: boolean;
  searchResults?: { [key: string]: SearchResultData };
};

const pruneSiblingBranches = (
  messages: TMessage[],
  parentMessageId: string | null | undefined,
  selectedMessageId: string | null | undefined,
) => {
  if (!parentMessageId || !selectedMessageId) {
    return messages;
  }

  const childrenByParent = new Map<string, TMessage[]>();
  for (const currentMessage of messages) {
    if (!currentMessage.parentMessageId) {
      continue;
    }
    const children = childrenByParent.get(currentMessage.parentMessageId) ?? [];
    children.push(currentMessage);
    childrenByParent.set(currentMessage.parentMessageId, children);
  }

  const idsToRemove = new Set<string>();
  const queue = (childrenByParent.get(parentMessageId) ?? [])
    .filter((currentMessage) => currentMessage.messageId !== selectedMessageId)
    .map((currentMessage) => currentMessage.messageId)
    .filter((messageId): messageId is string => !!messageId);

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || idsToRemove.has(currentId)) {
      continue;
    }
    idsToRemove.add(currentId);
    for (const child of childrenByParent.get(currentId) ?? []) {
      if (child.messageId) {
        queue.push(child.messageId);
      }
    }
  }

  return messages.filter((currentMessage) => !idsToRemove.has(currentMessage.messageId ?? ''));
};

export default function useMessageActions(props: TMessageActions) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const UsernameDisplay = useRecoilValue<boolean>(store.UsernameDisplay);
  const { message, currentEditId, setCurrentEditId, isMultiMessage, searchResults } = props;

  const {
    ask,
    index,
    regenerate,
    getMessages,
    setMessages,
    latestMessage,
    handleContinue,
    setLatestMessage,
    setConversation: setRootConversation,
    conversation: rootConvo,
    isSubmitting: isSubmittingRoot,
  } = useChatContext();
  const {
    conversation: addedConvo,
    getMessages: getAddedMessages,
    setMessages: setAddedMessages,
    setConversation: setAddedConversation,
    isSubmitting: isSubmittingAdditional,
  } = useAddedChatContext();
  const conversation = useMemo(
    () => (isMultiMessage === true ? addedConvo : rootConvo),
    [isMultiMessage, addedConvo, rootConvo],
  );

  const agentsMap = useAgentsMapContext();
  const assistantMap = useAssistantsMapContext();
  const resetLatestMultiMessage = useResetRecoilState(store.latestMessageFamily(index + 1));

  const { text, content, messageId = null, isCreatedByUser } = message ?? {};
  const edit = useMemo(() => messageId === currentEditId, [messageId, currentEditId]);

  const [feedback, setFeedback] = useState<TFeedback | undefined>(() => {
    if (message?.feedback) {
      const tag = getTagByKey(message.feedback?.tag?.key);
      return {
        rating: message.feedback.rating,
        tag,
        text: message.feedback.text,
      };
    }
    return undefined;
  });

  const enterEdit = useCallback(
    (cancel?: boolean) => setCurrentEditId && setCurrentEditId(cancel === true ? -1 : messageId),
    [messageId, setCurrentEditId],
  );

  const assistant = useMemo(() => {
    if (!isAssistantsEndpoint(conversation?.endpoint)) {
      return undefined;
    }

    const endpointKey = conversation?.endpoint ?? '';
    const modelKey = message?.model ?? '';

    return assistantMap?.[endpointKey] ? assistantMap[endpointKey][modelKey] : undefined;
  }, [conversation?.endpoint, message?.model, assistantMap]);

  const agent = useMemo(() => {
    if (!isAgentsEndpoint(conversation?.endpoint)) {
      return undefined;
    }

    if (!agentsMap) {
      return undefined;
    }

    const modelKey = message?.model ?? '';
    if (modelKey) {
      return agentsMap[modelKey];
    }

    const agentId = conversation?.agent_id ?? '';
    if (agentId) {
      return agentsMap[agentId];
    }
  }, [agentsMap, conversation?.agent_id, conversation?.endpoint, message?.model]);

  const isSubmitting = useMemo(
    () => (isMultiMessage === true ? isSubmittingAdditional : isSubmittingRoot),
    [isMultiMessage, isSubmittingAdditional, isSubmittingRoot],
  );

  const regenerateMessage = useCallback(() => {
    if ((isSubmitting && isCreatedByUser === true) || !message) {
      return;
    }

    regenerate(message);
  }, [isSubmitting, isCreatedByUser, message, regenerate]);

  const selectMessageAsMainBranch = useCallback(() => {
    if (!message || message.isCreatedByUser === true) {
      return;
    }

    const rootConversationId = rootConvo?.conversationId ?? message.conversationId;
    const addedMessages = getAddedMessages?.() ?? [];
    const addedSourceMessage = addedMessages.find(
      (currentMessage) => currentMessage.messageId === message.messageId,
    );
    const sourceMessage = isMultiMessage === true ? (addedSourceMessage ?? message) : message;
    const parentMessageId =
      isMultiMessage === true
        ? (message.parentMessageId ?? latestMessage?.parentMessageId)
        : sourceMessage.parentMessageId;
    const selectedMessage = {
      ...sourceMessage,
      conversationId: rootConversationId,
      parentMessageId,
    };
    const currentMessages = getMessages() ?? [];
    let nextMessages = pruneSiblingBranches(
      currentMessages,
      parentMessageId,
      selectedMessage.messageId,
    );

    if (
      !nextMessages.some((currentMessage) => currentMessage.messageId === selectedMessage.messageId)
    ) {
      nextMessages = [...nextMessages, selectedMessage];
    }

    setMessages(nextMessages);
    setLatestMessage({ ...selectedMessage });
    resetLatestMultiMessage();
    setAddedMessages([]);

    if (isMultiMessage === true && addedConvo) {
      setRootConversation((prevState) => {
        const {
          conversationId: _addedConversationId,
          title: _addedTitle,
          messages: _addedMessages,
          ...addedOptions
        } = addedConvo;

        return {
          ...prevState,
          ...addedOptions,
          conversationId: prevState?.conversationId ?? rootConvo?.conversationId ?? null,
          title: prevState?.title ?? rootConvo?.title ?? '',
          messages: prevState?.messages ?? rootConvo?.messages,
        };
      });
    }

    setAddedConversation(null);
  }, [
    message,
    latestMessage,
    getMessages,
    getAddedMessages,
    setMessages,
    setAddedMessages,
    addedConvo,
    rootConvo,
    isMultiMessage,
    setLatestMessage,
    setRootConversation,
    resetLatestMultiMessage,
    setAddedConversation,
  ]);

  const copyToClipboard = useCopyToClipboard({ text, content, searchResults });

  // const messageLabel = useMemo(() => {
  //   if (message?.isCreatedByUser === true) {
  //     return UsernameDisplay ? (user?.name ?? '') || user?.username : localize('com_user_message');
  //   } else if (agent) {
  //     return agent.name ?? 'Assistant';
  //   } else if (assistant) {
  //     return assistant.name ?? 'Assistant';
  //   } else {
  //     return message?.sender;
  //   }
  // }, [message, agent, assistant, UsernameDisplay, user, localize]);

  /**
   * 消息标签显示逻辑：
   * 1. 如果消息是用户创建的，显示用户名或“用户消息”。
   * 2. 否则，优先根据 endpoint 显示 AI 厂商名称（如 OpenAI、Google 等）。
   * 3. 如果 endpoint 未识别，则 fallback 到 assistant.name 或 agent.name。
   * 4. 如果有模型名称，则显示为“AI名称（模型名称）”格式。
   * 这样可以更清晰地标识消息来源和使用的模型。
   * by ruanyao 2025-11-26
   */
  const messageLabel = useMemo(() => {
    if (message?.isCreatedByUser === true) {
      return UsernameDisplay ? (user?.name ?? '') || user?.username : localize('com_user_message');
    }
    // 获取 endpoint
    const endpoint = (message?.endpoint ?? conversation?.endpoint ?? '').toLowerCase();
    // AI 厂商名映射（你可以增删）
    const endpointMap: Record<string, string> = {
      openai: 'OpenAI',
      google: 'Google',
      doubao: 'Doubao',
      anthropic: 'Anthropic', // ← Claude 显示为 Anthropic
      groq: 'Groq',
      deepseek: 'DeepSeek',
    };
    // 优先根据 endpoint 显示品牌名称
    let aiName = endpointMap[endpoint];
    // 如果 endpoint 未识别，则 fallback 到 assistant.name 或 agent.name
    if (!aiName) {
      aiName = agent?.name ?? assistant?.name ?? 'Assistant';
    }
    // 模型名称
    const modelName = message?.model ?? conversation?.model ?? '';
    // 显示格式： AI名称（模型名称）
    return modelName ? `${aiName}（${modelName}）` : aiName;
  }, [message, agent, assistant, UsernameDisplay, user, localize, conversation]);

  const feedbackMutation = useUpdateFeedbackMutation(
    conversation?.conversationId || '',
    message?.messageId || '',
  );

  const handleFeedback = useCallback(
    ({ feedback: newFeedback }: { feedback: TFeedback | undefined }) => {
      const payload: TUpdateFeedbackRequest = {
        feedback: newFeedback ? toMinimalFeedback(newFeedback) : undefined,
      };

      feedbackMutation.mutate(payload, {
        onSuccess: (data) => {
          if (!data.feedback) {
            setFeedback(undefined);
          } else {
            const tag = getTagByKey(data.feedback?.tag ?? undefined);
            setFeedback({
              rating: data.feedback.rating,
              tag,
              text: data.feedback.text,
            });
          }
        },
        onError: (error) => {
          console.error('Failed to update feedback:', error);
        },
      });
    },
    [feedbackMutation],
  );

  return {
    ask,
    edit,
    index,
    agent,
    assistant,
    enterEdit,
    conversation,
    messageLabel,
    isSubmitting,
    latestMessage,
    handleContinue,
    copyToClipboard,
    setLatestMessage,
    selectMessageAsMainBranch,
    regenerateMessage,
    handleFeedback,
    feedback,
  };
}
