import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { normalizeConversationMode, withModeSearchParams } from '~/utils/conversationMode';
import store from '~/store';

export default function useConversationMode(index = 0) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { conversation } = store.useCreateConversationAtom(index);
  const mode = normalizeConversationMode(searchParams.get('mode') ?? conversation?.mode);

  const setMode = useCallback(
    (nextMode: 'chat' | 'image', replace = true) => {
      setSearchParams(withModeSearchParams(searchParams, nextMode), { replace });
    },
    [searchParams, setSearchParams],
  );

  return {
    mode,
    searchParams,
    setMode,
  };
}