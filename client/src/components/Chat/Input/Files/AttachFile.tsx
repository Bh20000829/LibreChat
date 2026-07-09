import React, { useRef } from 'react';
import { FileUpload, TooltipAnchor, AttachmentIcon } from '@librechat/client';
import { ImageUpIcon } from 'lucide-react';
import { useLocalize, useFileHandling } from '~/hooks';
import { cn } from '~/utils';

const AttachFile = ({
  disabled,
  isImageMode = false,
  allowMultipleImages = false,
}: {
  disabled?: boolean | null;
  isImageMode?: boolean;
  allowMultipleImages?: boolean;
}) => {
  const localize = useLocalize();
  const inputRef = useRef<HTMLInputElement>(null);
  const isUploadDisabled = disabled ?? false;

  const { handleFileChange } = useFileHandling();

  const openFilePicker = () => {
    if (!inputRef.current) {
      return;
    }

    inputRef.current.value = '';
    inputRef.current.accept = isImageMode ? 'image/*' : '';
    inputRef.current.click();
    inputRef.current.accept = '';
  };

  return (
    <FileUpload
      ref={inputRef}
      handleFileChange={handleFileChange}
      multiple={isImageMode ? allowMultipleImages : true}
    >
      <TooltipAnchor
        description={
          isImageMode
            ? localize('com_ui_upload_image_input')
            : localize('com_sidepanel_attach_files')
        }
        id="attach-file"
        disabled={isUploadDisabled}
        render={
          <button
            type="button"
            aria-label={
              isImageMode
                ? localize('com_ui_upload_image_input')
                : localize('com_sidepanel_attach_files')
            }
            disabled={isUploadDisabled}
            className={cn(
              'flex size-9 items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50',
            )}
            onKeyDownCapture={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                openFilePicker();
              }
            }}
            onClick={openFilePicker}
          >
            <div className="flex w-full items-center justify-center gap-2">
              {isImageMode ? <ImageUpIcon className="icon-md" /> : <AttachmentIcon />}
            </div>
          </button>
        }
      />
    </FileUpload>
  );
};

export default React.memo(AttachFile);
