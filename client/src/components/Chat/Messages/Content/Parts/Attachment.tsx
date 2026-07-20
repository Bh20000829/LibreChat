import { memo, useState, useEffect } from 'react';
import { useSetRecoilState } from 'recoil';
import { imageExtRegex, Tools } from 'librechat-data-provider';
import type { TAttachment, TFile, TAttachmentMetadata } from 'librechat-data-provider';
import FileContainer from '~/components/Chat/Input/Files/FileContainer';
import Image from '~/components/Chat/Messages/Content/Image';
import store from '~/store';
import { cn } from '~/utils';

const FileAttachment = memo(({ attachment }: { attachment: Partial<TAttachment> }) => {
  const [isVisible, setIsVisible] = useState(false);
  const setFilePreview = useSetRecoilState(store.filePreview);
  const extension = attachment.filename?.split('.').pop();

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  if (!attachment.filepath && !attachment.file_id) {
    return null;
  }
  return (
    <div
      className={cn(
        'file-attachment-container',
        'transition-all duration-300 ease-out',
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
      )}
      style={{
        transformOrigin: 'center top',
        willChange: 'opacity, transform',
        WebkitFontSmoothing: 'subpixel-antialiased',
      }}
    >
      <FileContainer
        file={attachment}
        onClick={() => setFilePreview(attachment)}
        overrideType={extension}
        containerClassName="max-w-fit"
        buttonClassName="bg-surface-secondary hover:cursor-pointer hover:bg-surface-hover active:bg-surface-secondary focus:bg-surface-hover hover:border-border-heavy active:border-border-heavy"
      />
    </div>
  );
});

const ImageAttachment = memo(
  ({
    attachment,
    displaySize = 'default',
  }: {
    attachment: TAttachment;
    displaySize?: 'default' | 'thumbnail';
  }) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const { width, height, filepath = null } = attachment as TFile & TAttachmentMetadata;

    useEffect(() => {
      setIsLoaded(false);
      const timer = setTimeout(() => setIsLoaded(true), 100);
      return () => clearTimeout(timer);
    }, [attachment]);

    return (
      <div
        className={cn(
          'image-attachment-container',
          'transition-all duration-500 ease-out',
          isLoaded ? 'scale-100 opacity-100' : 'scale-[0.98] opacity-0',
        )}
        style={{
          transformOrigin: 'center top',
          willChange: 'opacity, transform',
          WebkitFontSmoothing: 'subpixel-antialiased',
        }}
      >
        <Image
          altText={attachment.filename || 'attachment image'}
          imagePath={filepath ?? ''}
          height={height ?? 0}
          width={width ?? 0}
          displaySize={displaySize}
          className="mb-4"
        />
      </div>
    );
  },
);

export default function Attachment({ attachment }: { attachment?: TAttachment }) {
  if (!attachment) {
    return null;
  }
  if (attachment.type === Tools.web_search) {
    return null;
  }

  const { width, height, filepath = null } = attachment as TFile & TAttachmentMetadata;
  const isImage = attachment.filename
    ? imageExtRegex.test(attachment.filename) && width != null && height != null && filepath != null
    : false;

  if (isImage) {
    return <ImageAttachment attachment={attachment} />;
  } else if (!attachment.filepath && !attachment.file_id) {
    return null;
  }
  return <FileAttachment attachment={attachment} />;
}

export function AttachmentGroup({ attachments }: { attachments?: TAttachment[] }) {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  const fileAttachments: TAttachment[] = [];
  const imageAttachments: TAttachment[] = [];

  attachments.forEach((attachment) => {
    const { width, height, filepath = null } = attachment as TFile & TAttachmentMetadata;
    const isImage = attachment.filename
      ? imageExtRegex.test(attachment.filename) &&
        width != null &&
        height != null &&
        filepath != null
      : false;

    if (isImage) {
      imageAttachments.push(attachment);
    } else if (attachment.type !== Tools.web_search) {
      fileAttachments.push(attachment);
    }
  });

  return (
    <>
      {fileAttachments.length > 0 && (
        <div className="my-2 flex flex-wrap items-center gap-2.5">
          {fileAttachments.map((attachment, index) =>
            attachment.filepath || attachment.file_id ? (
              <FileAttachment attachment={attachment} key={`file-${index}`} />
            ) : null,
          )}
        </div>
      )}
      {imageAttachments.length > 0 && (
        <div className="mb-2 flex flex-wrap items-start gap-3">
          {imageAttachments.map((attachment, index) => (
            <ImageAttachment
              attachment={attachment}
              displaySize={imageAttachments.length > 1 ? 'thumbnail' : 'default'}
              key={`image-${index}`}
            />
          ))}
        </div>
      )}
    </>
  );
}
