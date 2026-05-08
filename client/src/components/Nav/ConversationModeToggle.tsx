import { ImagePlus, MessageSquareText } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import { useLocalize, useNewConvo } from '~/hooks';
import useConversationMode from '~/hooks/Conversations/useConversationMode';
import { clearMessagesCache } from '~/utils';
import store from '~/store';

export default function ConversationModeToggle() {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { mode, setMode } = useConversationMode();
  const { newConversation } = useNewConvo();
  const { conversation } = store.useCreateConversationAtom(0);

  const switchMode = (nextMode: 'chat' | 'image') => {
    if (nextMode === mode) {
      return;
    }

    clearMessagesCache(queryClient, conversation?.conversationId);
    queryClient.invalidateQueries([QueryKeys.messages]);
    setMode(nextMode);
    newConversation({ template: { mode: nextMode } });
  };

  return (
    <div className="mb-2 mt-1 flex rounded-xl bg-surface-secondary p-1">
      <button
        type="button"
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${
          mode === 'chat'
            ? 'bg-surface-primary text-text-primary shadow-sm'
            : 'text-text-secondary hover:bg-surface-hover'
        }`}
        onClick={() => switchMode('chat')}
      >
        <MessageSquareText className="icon-sm" />
        <span>{localize('com_ui_chat')}</span>
      </button>
      <button
        type="button"
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${
          mode === 'image'
            ? 'bg-surface-primary text-text-primary shadow-sm'
            : 'text-text-secondary hover:bg-surface-hover'
        }`}
        onClick={() => switchMode('image')}
      >
        <ImagePlus className="icon-sm" />
        <span>{localize('com_ui_image_gen')}</span>
      </button>
    </div>
  );
}