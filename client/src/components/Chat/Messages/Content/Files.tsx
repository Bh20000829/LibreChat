import { useMemo, memo } from 'react';
import type { TFile, TMessage } from 'librechat-data-provider';
import FileContainer from '~/components/Chat/Input/Files/FileContainer';
import Image from './Image';

const Files = ({ message }: { message?: TMessage }) => {
  const imageFiles = useMemo(() => {
    return message?.files?.filter((file) => file.type?.startsWith('image/')) || [];
  }, [message?.files]);

  const otherFiles = useMemo(() => {
    return message?.files?.filter((file) => !(file.type?.startsWith('image/') === true)) || [];
  }, [message?.files]);

  return (
    <>
      {otherFiles.length > 0 &&
        otherFiles.map((file) => <FileContainer key={file.file_id} file={file as TFile} />)}
      {imageFiles.length > 0 && (
        <div className="flex w-full max-w-full flex-row flex-wrap items-start gap-2.5">
          {imageFiles.map((file) => (
            <Image
              key={file.file_id}
              imagePath={file.preview ?? file.filepath ?? ''}
              height={file.height ?? 1920}
              width={file.width ?? 1080}
              altText={file.filename ?? 'Uploaded Image'}
              displaySize={imageFiles.length > 1 ? 'upload-thumbnail' : 'default'}
              placeholderDimensions={{
                height: `${file.height ?? 1920}px`,
                width: `${file.width ?? 1080}px`,
              }}
              args={{ prompt: typeof message?.text === 'string' ? message.text : undefined }}
            />
          ))}
        </div>
      )}
    </>
  );
};

export default memo(Files);
