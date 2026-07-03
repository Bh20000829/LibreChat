import debounce from 'lodash/debounce';
import { SetterOrUpdater, useRecoilValue } from 'recoil';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { LocalStorageKeys, Constants } from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import { getDraft, setDraft } from '~/utils';
import { useChatFormContext } from '~/Providers';
import { useGetFiles } from '~/data-provider';
import store from '~/store';

export const useAutoSave = ({
  isSubmitting,
  conversationId: _conversationId,
  mode,
  textAreaRef,
  setFiles,
  files,
}: {
  isSubmitting?: boolean;
  conversationId?: string | null;
  mode?: string | null;
  textAreaRef?: React.RefObject<HTMLTextAreaElement>;
  files: Map<string, ExtendedFile>;
  setFiles: SetterOrUpdater<Map<string, ExtendedFile>>;
}) => {
  // setting for auto-save
  const { setValue } = useChatFormContext();
  const saveDrafts = useRecoilValue<boolean>(store.saveDrafts);
  const getDraftId = useCallback(
    (id?: string | null) => {
      const conversationId = id ?? '';
      if (conversationId === Constants.NEW_CONVO) {
        return `${conversationId}_${mode === 'image' ? 'image' : 'chat'}`;
      }

      return conversationId;
    },
    [mode],
  );
  const conversationId = isSubmitting ? Constants.PENDING_CONVO : getDraftId(_conversationId);

  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const fileIds = useMemo(() => Array.from(files.keys()), [files]);
  const { data: fileList } = useGetFiles<TFile[]>();
  const prevFileDraftStateRef = useRef<{ conversationId: string | null; fileIds: string[] }>({
    conversationId: null,
    fileIds: [],
  });

  const getFileDraftIds = useCallback((id: string) => {
    try {
      return JSON.parse(
        (localStorage.getItem(`${LocalStorageKeys.FILES_DRAFT}${id}`) ?? '') || '[]',
      ) as string[];
    } catch {
      return [];
    }
  }, []);

  const restoreFiles = useCallback(
    (id: string) => {
      const filesDraft = getFileDraftIds(id);

      if (filesDraft.length === 0) {
        setFiles(new Map());
        return;
      }

      const recoveredFiles = new Map<string, ExtendedFile>();

      // Retrieve files stored in localStorage from files in fileList and set them to `setFiles`
      // If a file is found with `temp_file_id`, use `temp_file_id` as a key in `setFiles`
      filesDraft.forEach((fileId) => {
        const fileData = fileList?.find((f) => f.file_id === fileId);
        const tempFileData = fileList?.find((f) => f.temp_file_id === fileId);
        const { fileToRecover, fileIdToRecover } = fileData
          ? { fileToRecover: fileData, fileIdToRecover: fileId }
          : {
              fileToRecover: tempFileData,
              fileIdToRecover: (tempFileData?.temp_file_id ?? '') || fileId,
            };

        if (fileToRecover) {
          recoveredFiles.set(fileIdToRecover, {
            ...fileToRecover,
            progress: 1,
            attached: true,
            size: fileToRecover.bytes,
          });
        }
      });

      setFiles(recoveredFiles);
    },
    [fileList, getFileDraftIds, setFiles],
  );

  const restoreText = useCallback(
    (id: string) => {
      const savedDraft = getDraft(id);
      setValue('text', savedDraft ?? '');
    },
    [setValue],
  );

  const saveText = useCallback(
    (id: string) => {
      if (!textAreaRef?.current) {
        return;
      }
      // Save the draft of the current conversation before switching
      if (textAreaRef.current.value === '') {
        setDraft({ id, value: '' });
      } else {
        setDraft({ id, value: textAreaRef.current.value });
      }
    },
    [textAreaRef],
  );

  useEffect(() => {
    // This useEffect is responsible for setting up and cleaning up the auto-save functionality
    // for the text area input. It saves the text to localStorage with a debounce to prevent
    // excessive writes.
    if (!saveDrafts || conversationId == null || conversationId === '') {
      return;
    }

    /** Use shorter debounce for saving text (65ms) to capture rapid typing */
    const handleInputFast = debounce(
      (value: string) => setDraft({ id: conversationId, value }),
      65,
    );

    /** Use longer debounce for clearing empty values (850ms) to prevent accidental draft loss */
    const handleInputSlow = debounce(
      (value: string) => setDraft({ id: conversationId, value }),
      850,
    );

    const eventListener = (e: Event) => {
      const target = e.target as HTMLTextAreaElement;
      const value = target.value;

      /** Cancel any pending operations to avoid conflicts */
      handleInputFast.cancel();
      handleInputSlow.cancel();

      /** If empty, use long delay to prevent accidental clearing
       * Otherwise use short delay to capture rapid typing */
      if (value === '') {
        handleInputSlow(value);
      } else {
        handleInputFast(value);
      }
    };

    const textArea = textAreaRef?.current;
    if (textArea) {
      textArea.addEventListener('input', eventListener);
    }

    return () => {
      if (textArea) {
        textArea.removeEventListener('input', eventListener);
      }
      handleInputFast.cancel();
      handleInputSlow.cancel();
    };
  }, [conversationId, saveDrafts, textAreaRef]);

  const prevConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    // This useEffect is responsible for saving the current conversation's draft and
    // restoring the new conversation's draft when switching between conversations.
    // It handles both text and file drafts, ensuring that the user's input is preserved
    // across different conversations.

    if (!saveDrafts || conversationId == null || conversationId === '') {
      return;
    }
    if (conversationId === currentConversationId) {
      return;
    }

    // clear attachment files when switching conversation
    setFiles(new Map());

    try {
      // Check for transition from PENDING_CONVO to a valid conversationId
      if (
        prevConversationIdRef.current === Constants.PENDING_CONVO &&
        conversationId !== Constants.PENDING_CONVO &&
        conversationId.length > 3
      ) {
        const pendingDraft = localStorage.getItem(
          `${LocalStorageKeys.TEXT_DRAFT}${Constants.PENDING_CONVO}`,
        );

        // Clear the pending text draft, if it exists, and save the current draft to the new conversationId;
        // otherwise, save the current text area value to the new conversationId
        localStorage.removeItem(`${LocalStorageKeys.TEXT_DRAFT}${Constants.PENDING_CONVO}`);
        if (pendingDraft) {
          localStorage.setItem(`${LocalStorageKeys.TEXT_DRAFT}${conversationId}`, pendingDraft);
        } else if (textAreaRef?.current?.value) {
          setDraft({ id: conversationId, value: textAreaRef.current.value });
        }
        const pendingFileDraft = localStorage.getItem(
          `${LocalStorageKeys.FILES_DRAFT}${Constants.PENDING_CONVO}`,
        );

        if (pendingFileDraft) {
          localStorage.setItem(
            `${LocalStorageKeys.FILES_DRAFT}${conversationId}`,
            pendingFileDraft,
          );
          localStorage.removeItem(`${LocalStorageKeys.FILES_DRAFT}${Constants.PENDING_CONVO}`);
          const filesDraft = getFileDraftIds(conversationId);
          if (filesDraft.length > 0) {
            restoreFiles(conversationId);
          }
        }
      } else if (currentConversationId != null && currentConversationId) {
        saveText(currentConversationId);
      }

      restoreText(conversationId);
      restoreFiles(conversationId);
    } catch (e) {
      console.error(e);
    }

    prevConversationIdRef.current = conversationId;
    setCurrentConversationId(conversationId);
  }, [
    currentConversationId,
    conversationId,
    restoreFiles,
    textAreaRef,
    restoreText,
    saveDrafts,
    saveText,
    setFiles,
    getFileDraftIds,
  ]);

  useEffect(() => {
    if (
      !saveDrafts ||
      conversationId == null ||
      conversationId === '' ||
      currentConversationId !== conversationId ||
      fileList == null ||
      files.size > 0
    ) {
      return;
    }

    if (getFileDraftIds(conversationId).length > 0) {
      restoreFiles(conversationId);
    }
  }, [
    conversationId,
    currentConversationId,
    fileList,
    files.size,
    getFileDraftIds,
    restoreFiles,
    saveDrafts,
  ]);

  useEffect(() => {
    // This useEffect is responsible for saving or removing the current conversation's file drafts
    // in localStorage whenever the file attachments change.
    // It ensures that the file drafts are kept up-to-date and can be restored
    // when the conversation is revisited.

    if (
      !saveDrafts ||
      conversationId == null ||
      conversationId === '' ||
      currentConversationId !== conversationId
    ) {
      return;
    }

    const previousFileDraftState = prevFileDraftStateRef.current;
    const hadFilesInCurrentConversation =
      previousFileDraftState.conversationId === conversationId &&
      previousFileDraftState.fileIds.length > 0;

    if (fileIds.length === 0) {
      if (
        !hadFilesInCurrentConversation &&
        getFileDraftIds(conversationId).length > 0 &&
        fileList == null
      ) {
        return;
      }
      localStorage.removeItem(`${LocalStorageKeys.FILES_DRAFT}${conversationId}`);
    } else {
      localStorage.setItem(
        `${LocalStorageKeys.FILES_DRAFT}${conversationId}`,
        JSON.stringify(fileIds),
      );
    }

    prevFileDraftStateRef.current = { conversationId, fileIds };
  }, [
    files,
    conversationId,
    saveDrafts,
    currentConversationId,
    fileIds,
    fileList,
    getFileDraftIds,
  ]);
};
