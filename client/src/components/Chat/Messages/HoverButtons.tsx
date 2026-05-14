import React, { useState, useMemo, memo } from 'react';
import { useRecoilState } from 'recoil';
import copy from 'copy-to-clipboard';
import { useToastContext } from '@librechat/client';
import { ContentTypes, imageExtRegex } from 'librechat-data-provider';
import type { TAttachment, TConversation, TMessage, TFeedback } from 'librechat-data-provider';
import { EditIcon, Clipboard, CheckMark, ContinueIcon, RegenerateIcon } from '@librechat/client';
import { Download, ImagePlus, Star } from 'lucide-react';
import { useGenerationsByLatest, useLocalize } from '~/hooks';
import { Fork } from '~/components/Conversations';
import { useMessagesOperations } from '~/Providers';
import useImageFavorites, { getImageFavoriteId } from '~/hooks/useImageFavorites';
import MessageAudio from './MessageAudio';
import Feedback from './Feedback';
import { cn } from '~/utils';
import store from '~/store';

type THoverButtons = {
  attachments?: TAttachment[];
  isEditing: boolean;
  enterEdit: (cancel?: boolean) => void;
  copyToClipboard: (setIsCopied: React.Dispatch<React.SetStateAction<boolean>>) => void;
  conversation: TConversation | null;
  isSubmitting: boolean;
  message: TMessage;
  regenerate: () => void;
  handleContinue: (e: React.MouseEvent<HTMLButtonElement>) => void;
  latestMessage: TMessage | null;
  isLast: boolean;
  index: number;
  handleFeedback?: ({ feedback }: { feedback: TFeedback | undefined }) => void;
};

const getImageAttachment = (attachments?: TAttachment[]) => {
  if (!attachments?.length) {
    return null;
  }

  return (
    attachments.find((attachment) => {
      const hasImageName = attachment.filename ? imageExtRegex.test(attachment.filename) : false;
      const hasDimensions = attachment.width != null && attachment.height != null;
      return hasImageName && hasDimensions && attachment.filepath != null;
    }) ?? null
  );
};

type HoverButtonProps = {
  id?: string;
  onClick: (e?: React.MouseEvent<HTMLButtonElement>) => void;
  title: string;
  icon: React.ReactNode;
  isActive?: boolean;
  isVisible?: boolean;
  isDisabled?: boolean;
  isLast?: boolean;
  className?: string;
  buttonStyle?: string;
};

const extractMessageContent = (message: TMessage): string => {
  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if ('text' in part) {
          if (typeof part.text === 'string') {
            return part.text;
          }
          return part.text?.value || '';
        }
        if ('think' in part) {
          const think = part.think;
          if (typeof think === 'string') {
            return think;
          }
          return think && 'text' in think ? think.text || '' : '';
        }
        return '';
      })
      .join('');
  }

  return message.text || '';
};

const getOriginalImagePrompt = (
  message: TMessage,
  getMessages: (() => TMessage[] | undefined) | undefined,
): string => {
  const parentMessageId = message.parentMessageId;
  if (!parentMessageId || typeof getMessages !== 'function') {
    return '';
  }

  const parentMessage = getMessages()?.find((msg) => msg.messageId === parentMessageId);
  if (!parentMessage) {
    return '';
  }

  return extractMessageContent(parentMessage).trim();
};

const getImageCopySource = (message: TMessage, attachments?: TAttachment[]): string | null => {
  const imageAttachment = getImageAttachment(attachments);
  if (imageAttachment?.filepath) {
    return imageAttachment.filepath;
  }

  if (!Array.isArray(message.content)) {
    const imageFile = message.files?.find((file) => file.type?.startsWith('image/'));
    return imageFile?.preview ?? imageFile?.filepath ?? null;
  }

  for (const part of message.content) {
    if (part?.type === ContentTypes.IMAGE_FILE) {
      return part.image_file?.filepath ?? null;
    }

    if (part?.type === ContentTypes.IMAGE_URL) {
      return typeof part.image_url === 'string' ? part.image_url : (part.image_url?.url ?? null);
    }
  }

  const imageFile = message.files?.find((file) => file.type?.startsWith('image/'));
  return imageFile?.preview ?? imageFile?.filepath ?? null;
};

const getImageFavoritePayload = (message: TMessage, attachments?: TAttachment[]) => {
  const imageAttachment = getImageAttachment(attachments);
  if (imageAttachment?.filepath) {
    return {
      imagePath: imageAttachment.filepath,
      altText: imageAttachment.filename ?? 'Generated Image',
      width: imageAttachment.width,
      height: imageAttachment.height,
    };
  }

  if (!Array.isArray(message.content)) {
    const imageFile = message.files?.find((file) => file.type?.startsWith('image/'));
    const imagePath = imageFile?.preview ?? imageFile?.filepath;
    if (!imagePath) {
      return null;
    }

    return {
      imagePath,
      altText: imageFile?.filename ?? 'Generated Image',
      width: imageFile?.width,
      height: imageFile?.height,
    };
  }

  for (const part of message.content) {
    if (part?.type === ContentTypes.IMAGE_FILE) {
      const imageFile = part.image_file;
      const imagePath = imageFile?.filepath;
      if (!imagePath) {
        continue;
      }

      return {
        imagePath,
        altText: imageFile?.filename ?? 'Generated Image',
        width: imageFile?.width,
        height: imageFile?.height,
      };
    }

    if (part?.type === ContentTypes.IMAGE_URL) {
      const imagePath = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url;
      if (!imagePath) {
        continue;
      }

      return {
        imagePath,
        altText: 'Generated Image',
      };
    }
  }

  const imageFile = message.files?.find((file) => file.type?.startsWith('image/'));
  const imagePath = imageFile?.preview ?? imageFile?.filepath;
  if (!imagePath) {
    return null;
  }

  return {
    imagePath,
    altText: imageFile?.filename ?? 'Generated Image',
    width: imageFile?.width,
    height: imageFile?.height,
  };
};

const HoverButton = memo(
  ({
    id,
    onClick,
    title,
    icon,
    isActive = false,
    isVisible = true,
    isDisabled = false,
    isLast = false,
    className = '',
  }: HoverButtonProps) => {
    const buttonStyle = cn(
      'hover-button rounded-lg p-1.5 text-text-secondary-alt transition-colors duration-200',
      'hover:text-text-primary hover:bg-surface-hover',
      'md:group-hover:visible md:group-focus-within:visible md:group-[.final-completion]:visible',
      !isLast && 'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100',
      !isVisible && 'opacity-0',
      'focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white focus-visible:outline-none',
      isActive && isVisible && 'active text-text-primary bg-surface-hover',
      className,
    );

    return (
      <button
        id={id}
        className={buttonStyle}
        onClick={onClick}
        type="button"
        title={title}
        disabled={isDisabled}
      >
        {icon}
      </button>
    );
  },
);

HoverButton.displayName = 'HoverButton';

const HoverButtons = ({
  attachments,
  index,
  isEditing,
  enterEdit,
  copyToClipboard,
  conversation,
  isSubmitting,
  message,
  regenerate,
  handleContinue,
  latestMessage,
  isLast,
  handleFeedback,
}: THoverButtons) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { getMessages } = useMessagesOperations();
  const [isCopied, setIsCopied] = useState(false);
  const [isImageCopied, setIsImageCopied] = useState(false);
  const [TextToSpeech] = useRecoilState<boolean>(store.textToSpeech);
  const { isFavorited, toggleFavorite } = useImageFavorites();

  const endpoint = useMemo(() => {
    if (!conversation) {
      return '';
    }
    return conversation.endpointType ?? conversation.endpoint;
  }, [conversation]);

  const generationCapabilities = useGenerationsByLatest({
    isEditing,
    isSubmitting,
    error: message.error,
    endpoint: endpoint ?? '',
    messageId: message.messageId,
    searchResult: message.searchResult,
    finish_reason: message.finish_reason,
    isCreatedByUser: message.isCreatedByUser,
    latestMessageId: latestMessage?.messageId,
  });

  const {
    hideEditButton,
    regenerateEnabled,
    continueSupported,
    forkingSupported,
    isEditableEndpoint,
  } = generationCapabilities;

  const { isCreatedByUser, error } = message;
  const isImageConversation = conversation?.mode === 'image';
  const favoritePayload = useMemo(
    () => getImageFavoritePayload(message, attachments),
    [attachments, message],
  );
  const favoriteId = useMemo(
    () =>
      favoritePayload != null
        ? getImageFavoriteId(message.messageId, favoritePayload.imagePath)
        : '',
    [favoritePayload, message.messageId],
  );
  const isImageMessage = useMemo(
    () => isCreatedByUser !== true && favoritePayload != null,
    [isCreatedByUser, favoritePayload],
  );
  const originalImagePrompt = useMemo(
    () => getOriginalImagePrompt(message, getMessages),
    [getMessages, message],
  );

  if (!conversation) {
    return null;
  }

  if (isImageConversation && isCreatedByUser) {
    return null;
  }

  if (error === true) {
    return (
      <div className="visible flex justify-center self-end lg:justify-start">
        {regenerateEnabled && (
          <HoverButton
            onClick={regenerate}
            title={localize('com_ui_regenerate')}
            icon={<RegenerateIcon size="19" />}
            isLast={isLast}
          />
        )}
      </div>
    );
  }

  const onEdit = () => {
    if (isEditing) {
      return enterEdit(true);
    }
    enterEdit();
  };

  const handleCopy = () => {
    if (isImageMessage && originalImagePrompt.length > 0) {
      setIsCopied(true);
      copy(originalImagePrompt, { format: 'text/plain' });
      window.setTimeout(() => setIsCopied(false), 3000);
      return;
    }

    copyToClipboard(setIsCopied);
  };

  const handleFavoriteToggle = async () => {
    if (favoritePayload == null) {
      return;
    }

    try {
      const nextState = await toggleFavorite({
        id: favoriteId,
        messageId: message.messageId,
        conversationId: message.conversationId,
        imagePath: favoritePayload.imagePath,
        prompt: extractMessageContent(message),
        altText: favoritePayload.altText,
        width: favoritePayload.width,
        height: favoritePayload.height,
        model: message.model,
        favoritedAt: Date.now(),
      });

      showToast({
        message: nextState
          ? localize('com_ui_favorite_added')
          : localize('com_ui_favorite_removed'),
        status: 'success',
        duration: 2000,
      });
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : 'Failed to update favorites.',
        status: 'error',
        duration: 3000,
      });
    }
  };

  const handleCopyImage = async () => {
    const imageSource = getImageCopySource(message, attachments);
    if (!imageSource || typeof navigator === 'undefined' || navigator.clipboard == null) {
      showToast({
        message: 'Image copy is not available right now.',
        status: 'error',
        duration: 3000,
      });
      return;
    }

    try {
      const response = await fetch(imageSource);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const blob = await response.blob();
      if (typeof ClipboardItem === 'undefined') {
        throw new Error('Clipboard image copy is not supported in this browser.');
      }

      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type || 'image/png']: blob,
        }),
      ]);

      setIsImageCopied(true);
      showToast({
        message: localize('com_ui_copied_to_clipboard'),
        status: 'success',
        duration: 2000,
      });
      window.setTimeout(() => setIsImageCopied(false), 1500);
    } catch (copyError) {
      showToast({
        message:
          copyError instanceof Error ? copyError.message : 'Image copy is not available right now.',
        status: 'error',
        duration: 3000,
      });
    }
  };

  const handleDownloadImage = async () => {
    const imageSource = getImageCopySource(message, attachments);
    if (!imageSource) {
      showToast({
        message: localize('com_ui_download_error'),
        status: 'error',
        duration: 3000,
      });
      return;
    }

    try {
      const response = await fetch(imageSource);
      if (!response.ok) {
        throw new Error(localize('com_ui_download_error'));
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = favoritePayload?.altText || 'image.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (_error) {
      showToast({
        message: localize('com_ui_download_error'),
        status: 'error',
        duration: 3000,
      });
    }
  };

  if (isImageMessage) {
    return (
      <div className="group visible flex justify-center gap-0.5 self-end focus-within:outline-none lg:justify-start">
        <HoverButton
          onClick={handleCopy}
          title={
            isCopied ? localize('com_ui_copied_to_clipboard') : localize('com_ui_copy_to_clipboard')
          }
          icon={isCopied ? <CheckMark className="h-[18px] w-[18px]" /> : <Clipboard size="19" />}
          isLast={isLast}
          className="ml-0 flex items-center gap-1.5 text-xs"
        />
        <HoverButton
          onClick={() => {
            void handleFavoriteToggle();
          }}
          title={
            isFavorited(favoriteId)
              ? localize('com_ui_favorite_remove')
              : localize('com_ui_favorite_add')
          }
          icon={
            <Star
              size={18}
              className={cn(isFavorited(favoriteId) ? 'fill-current text-yellow-400' : '')}
            />
          }
          isLast={isLast}
          className="ml-0 flex items-center gap-1.5 text-xs"
        />
        <HoverButton
          onClick={() => {
            void handleCopyImage();
          }}
          title={isImageCopied ? localize('com_ui_copied_to_clipboard') : 'Copy image'}
          icon={
            isImageCopied ? <CheckMark className="h-[18px] w-[18px]" /> : <ImagePlus size={18} />
          }
          isLast={isLast}
          className="ml-0 flex items-center gap-1.5 text-xs"
        />
        <HoverButton
          onClick={() => {
            void handleDownloadImage();
          }}
          title={localize('com_ui_download')}
          icon={<Download size={18} />}
          isLast={isLast}
          className="ml-0 flex items-center gap-1.5 text-xs"
        />
      </div>
    );
  }

  return (
    <div className="group visible flex justify-center gap-0.5 self-end focus-within:outline-none lg:justify-start">
      {/* Text to Speech */}
      {TextToSpeech && (
        <MessageAudio
          index={index}
          isLast={isLast}
          messageId={message.messageId}
          content={extractMessageContent(message)}
          renderButton={(props) => (
            <HoverButton
              onClick={props.onClick}
              title={props.title}
              icon={props.icon}
              isActive={props.isActive}
              isLast={isLast}
            />
          )}
        />
      )}

      {/* Copy Button */}
      <HoverButton
        onClick={handleCopy}
        title={
          isCopied ? localize('com_ui_copied_to_clipboard') : localize('com_ui_copy_to_clipboard')
        }
        icon={isCopied ? <CheckMark className="h-[18px] w-[18px]" /> : <Clipboard size="19" />}
        isLast={isLast}
        className={`ml-0 flex items-center gap-1.5 text-xs ${isSubmitting && isCreatedByUser ? 'md:opacity-0 md:group-hover:opacity-100' : ''}`}
      />

      {/* Edit Button */}
      {isEditableEndpoint && (
        <HoverButton
          id={`edit-${message.messageId}`}
          onClick={onEdit}
          title={localize('com_ui_edit')}
          icon={<EditIcon size="19" />}
          isActive={isEditing}
          isVisible={!hideEditButton}
          isDisabled={hideEditButton}
          isLast={isLast}
          className={isCreatedByUser ? '' : 'active'}
        />
      )}

      {/* Fork Button */}
      <Fork
        messageId={message.messageId}
        conversationId={conversation.conversationId}
        forkingSupported={forkingSupported}
        latestMessageId={latestMessage?.messageId}
        isLast={isLast}
      />

      {/* Feedback Buttons */}
      {!isCreatedByUser && handleFeedback != null && (
        <Feedback handleFeedback={handleFeedback} feedback={message.feedback} isLast={isLast} />
      )}

      {/* Regenerate Button */}
      {regenerateEnabled && (
        <HoverButton
          onClick={regenerate}
          title={localize('com_ui_regenerate')}
          icon={<RegenerateIcon size="19" />}
          isLast={isLast}
          className="active"
        />
      )}

      {/* Continue Button */}
      {continueSupported && (
        <HoverButton
          onClick={(e) => e && handleContinue(e)}
          title={localize('com_ui_continue')}
          icon={<ContinueIcon className="w-19 h-19 -rotate-180" />}
          isLast={isLast}
          className="active"
        />
      )}
    </div>
  );
};

export default memo(HoverButtons);
