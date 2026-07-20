import { memo, useMemo } from 'react';
import { ContentTypes } from 'librechat-data-provider';
import type {
  TMessageContentParts,
  SearchResultData,
  TAttachment,
  Agents,
} from 'librechat-data-provider';
import { MessageContext, SearchContext, useMessagesOperations } from '~/Providers';
import MemoryArtifacts from './MemoryArtifacts';
import Sources from '~/components/Web/Sources';
import { mapAttachments } from '~/utils/map';
import { EditTextPart } from './Parts';
import { AttachmentGroup } from './Parts/Attachment';
import Part from './Part';
import type { ImageDisplaySize } from './Image';

type ContentPartsProps = {
  content: Array<TMessageContentParts | undefined> | undefined;
  messageId: string;
  parentMessageId?: string | null;
  conversationId?: string | null;
  attachments?: TAttachment[];
  searchResults?: { [key: string]: SearchResultData };
  isCreatedByUser: boolean;
  isLast: boolean;
  isSubmitting: boolean;
  isLatestMessage?: boolean;
  edit?: boolean;
  enterEdit?: (cancel?: boolean) => void | null | undefined;
  siblingIdx?: number;
  setSiblingIdx?:
    | ((value: number) => void | React.Dispatch<React.SetStateAction<number>>)
    | null
    | undefined;
};

const isImageContentPart = (part: TMessageContentParts | undefined): part is TMessageContentParts =>
  part?.type === ContentTypes.IMAGE_FILE || part?.type === ContentTypes.IMAGE_URL;

const getImagePartAspectRatio = (part: TMessageContentParts | undefined) => {
  if (!part) {
    return 1;
  }

  if (part.type === ContentTypes.IMAGE_FILE) {
    const imageFile = part[ContentTypes.IMAGE_FILE];
    const width = Number(imageFile?.width);
    const height = Number(imageFile?.height);

    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return width / height;
    }
  }

  return 1;
};

const getImageGroupLayout = (
  imageParts: Array<{ imagePart: TMessageContentParts; partIndex: number }>,
): { className: string; displaySize: ImageDisplaySize } => {
  const aspectRatio = getImagePartAspectRatio(imageParts[0]?.imagePart);

  if (aspectRatio >= 1.15) {
    return {
      className: 'grid w-full max-w-[980px] grid-cols-1 items-start gap-4 sm:grid-cols-2',
      displaySize: 'wide-thumbnail',
    };
  }

  return {
    className: 'grid w-full max-w-[940px] grid-cols-2 items-start gap-4 sm:grid-cols-4',
    displaySize: 'thumbnail',
  };
};

const ContentParts = memo(
  ({
    content,
    messageId,
    parentMessageId,
    conversationId,
    attachments,
    searchResults,
    isCreatedByUser,
    isLast,
    isSubmitting,
    isLatestMessage,
    edit,
    enterEdit,
    siblingIdx,
    setSiblingIdx,
  }: ContentPartsProps) => {
    const { getMessages } = useMessagesOperations();
    const attachmentMap = useMemo(() => mapAttachments(attachments ?? []), [attachments]);
    const contentToolCallIds = useMemo(() => {
      const ids = new Set<string>();

      content?.forEach((part) => {
        const toolCallId =
          (part?.[ContentTypes.TOOL_CALL] as Agents.ToolCall | undefined)?.id ?? '';
        if (toolCallId) {
          ids.add(toolCallId);
        }
      });

      return ids;
    }, [content]);
    const looseAttachments = useMemo(
      () =>
        (attachments ?? []).filter((attachment) => {
          const toolCallId = attachment.toolCallId ?? '';
          return !toolCallId || !contentToolCallIds.has(toolCallId);
        }),
      [attachments, contentToolCallIds],
    );
    const imagePrompt = useMemo(() => {
      const extractText = (parts: Array<TMessageContentParts | undefined> | undefined) => {
        const prompt = (parts ?? [])
          .map((part) => {
            if (!part || part.type !== ContentTypes.TEXT) {
              return '';
            }

            if (typeof part.text === 'string') {
              return part.text;
            }

            return part.text?.value || '';
          })
          .join('\n')
          .trim();

        return prompt.length > 0 ? prompt : undefined;
      };

      const ownPrompt = extractText(content);
      if (ownPrompt) {
        return ownPrompt;
      }

      if (!parentMessageId) {
        return undefined;
      }

      const parentMessage = getMessages()?.find((msg) => msg.messageId === parentMessageId);
      const parentText = parentMessage?.text?.trim();
      if (parentText) {
        return parentText;
      }

      return extractText(
        parentMessage?.content as Array<TMessageContentParts | undefined> | undefined,
      );
    }, [content, getMessages, parentMessageId]);

    const effectiveIsSubmitting = isLatestMessage ? isSubmitting : false;

    if (!content) {
      return <AttachmentGroup attachments={looseAttachments} />;
    }
    if (edit === true && enterEdit && setSiblingIdx) {
      return (
        <>
          {content.map((part, idx) => {
            if (!part) {
              return null;
            }
            const isTextPart =
              part?.type === ContentTypes.TEXT ||
              typeof (part as unknown as Agents.MessageContentText)?.text !== 'string';
            const isThinkPart =
              part?.type === ContentTypes.THINK ||
              typeof (part as unknown as Agents.ReasoningDeltaUpdate)?.think !== 'string';
            if (!isTextPart && !isThinkPart) {
              return null;
            }

            const isToolCall =
              part.type === ContentTypes.TOOL_CALL || part['tool_call_ids'] != null;
            if (isToolCall) {
              return null;
            }

            return (
              <EditTextPart
                index={idx}
                part={part as Agents.MessageContentText | Agents.ReasoningDeltaUpdate}
                messageId={messageId}
                isSubmitting={isSubmitting}
                enterEdit={enterEdit}
                siblingIdx={siblingIdx ?? null}
                setSiblingIdx={setSiblingIdx}
                key={`edit-${messageId}-${idx}`}
              />
            );
          })}
        </>
      );
    }

    return (
      <>
        <SearchContext.Provider value={{ searchResults }}>
          <MemoryArtifacts attachments={attachments} />
          <Sources messageId={messageId} conversationId={conversationId || undefined} />
          {content.map((part, idx) => {
            if (!part) {
              return null;
            }

            if (isImageContentPart(part)) {
              if (idx > 0 && isImageContentPart(content[idx - 1])) {
                return null;
              }

              const imageParts: Array<{
                imagePart: TMessageContentParts;
                partIndex: number;
              }> = [];
              for (let partIndex = idx; partIndex < content.length; partIndex++) {
                const imagePart = content[partIndex];
                if (!isImageContentPart(imagePart)) {
                  break;
                }
                imageParts.push({ imagePart, partIndex });
              }

              if (imageParts.length > 1) {
                const imageGroupLayout = getImageGroupLayout(imageParts);

                return (
                  <div
                    key={`image-group-${messageId}-${idx}`}
                    className={imageGroupLayout.className}
                  >
                    {imageParts.map(({ imagePart, partIndex }) => (
                      <MessageContext.Provider
                        key={`provider-${messageId}-${partIndex}`}
                        value={{
                          messageId,
                          isExpanded: true,
                          conversationId,
                          partIndex,
                          nextType: content[partIndex + 1]?.type,
                          isSubmitting: effectiveIsSubmitting,
                          isLatestMessage,
                        }}
                      >
                        <Part
                          part={imagePart}
                          imagePrompt={imagePrompt}
                          imageDisplaySize={imageGroupLayout.displaySize}
                          isSubmitting={effectiveIsSubmitting}
                          isCreatedByUser={isCreatedByUser}
                          isLast={partIndex === content.length - 1}
                          showCursor={partIndex === content.length - 1 && isLast}
                        />
                      </MessageContext.Provider>
                    ))}
                  </div>
                );
              }
            }

            const toolCallId =
              (part?.[ContentTypes.TOOL_CALL] as Agents.ToolCall | undefined)?.id ?? '';
            const partAttachments = attachmentMap[toolCallId];

            return (
              <MessageContext.Provider
                key={`provider-${messageId}-${idx}`}
                value={{
                  messageId,
                  isExpanded: true,
                  conversationId,
                  partIndex: idx,
                  nextType: content[idx + 1]?.type,
                  isSubmitting: effectiveIsSubmitting,
                  isLatestMessage,
                }}
              >
                <Part
                  part={part}
                  attachments={partAttachments}
                  imagePrompt={imagePrompt}
                  isSubmitting={effectiveIsSubmitting}
                  key={`part-${messageId}-${idx}`}
                  isCreatedByUser={isCreatedByUser}
                  isLast={idx === content.length - 1}
                  showCursor={idx === content.length - 1 && isLast}
                />
              </MessageContext.Provider>
            );
          })}
          <AttachmentGroup attachments={looseAttachments} />
        </SearchContext.Provider>
      </>
    );
  },
);

export default ContentParts;
