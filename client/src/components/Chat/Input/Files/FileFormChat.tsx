import { memo } from 'react';
import { useRecoilValue } from 'recoil';
import { Constants } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import { useChatContext } from '~/Providers';
import { useFileHandling } from '~/hooks';
import FileRow from './FileRow';
import store from '~/store';

function FileFormChat({
  conversation,
  mode,
}: {
  conversation: TConversation | null;
  mode?: string | null;
}) {
  const { files, setFiles, setFilesLoading } = useChatContext();
  const chatDirection = useRecoilValue(store.chatDirection).toLowerCase();
  const { endpoint: _endpoint } = conversation ?? { endpoint: null };
  const { abortUpload } = useFileHandling();

  const isRTL = chatDirection === 'rtl';
  const conversationId = conversation?.conversationId ?? Constants.NEW_CONVO;
  const fileDraftId =
    conversationId === Constants.NEW_CONVO
      ? `${conversationId}_${mode === 'image' ? 'image' : 'chat'}`
      : conversationId;

  return (
    <>
      <FileRow
        files={files}
        setFiles={setFiles}
        abortUpload={abortUpload}
        setFilesLoading={setFilesLoading}
        fileDraftId={fileDraftId}
        isRTL={isRTL}
        Wrapper={({ children }) => <div className="mx-2 mt-2 flex flex-wrap gap-2">{children}</div>}
      />
    </>
  );
}

export default memo(FileFormChat);
