import { ContentTypes } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';

export function getMessageImageCount(message?: TMessage | null): number {
  if (!message) {
    return 0;
  }

  if (Array.isArray(message.content)) {
    return message.content.filter(
      (part) => part?.type === ContentTypes.IMAGE_FILE || part?.type === ContentTypes.IMAGE_URL,
    ).length;
  }

  return message.files?.filter((file) => file.type?.startsWith('image/')).length ?? 0;
}

export function canInheritFromImageMessage(message?: TMessage | null): boolean {
  return message?.isCreatedByUser !== true && getMessageImageCount(message) === 1;
}
