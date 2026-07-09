import React, { useState, useRef, useMemo } from 'react';
import { Download, ImagePlus, Star } from 'lucide-react';
import { CheckMark, Skeleton, useToastContext } from '@librechat/client';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { useLocalize } from '~/hooks';
import { useMessageContext } from '~/Providers';
import useImageFavorites, { getImageFavoriteId } from '~/hooks/useImageFavorites';
import { cn } from '~/utils';
import DialogImage from './DialogImage';

export type ImageDisplaySize = 'default' | 'thumbnail' | 'wide-thumbnail' | 'upload-thumbnail';

const getImagePreviewBounds = ({
  displaySize,
  originalWidth,
  originalHeight,
}: {
  displaySize: ImageDisplaySize;
  originalWidth: number;
  originalHeight: number;
}) => {
  if (displaySize !== 'default') {
    return null;
  }

  if (
    !Number.isFinite(originalWidth) ||
    !Number.isFinite(originalHeight) ||
    originalWidth <= 0 ||
    originalHeight <= 0
  ) {
    return { maxWidth: 520, maxHeight: 520 };
  }

  const aspectRatio = originalWidth / originalHeight;

  if (aspectRatio >= 1.85) {
    return { maxWidth: 640, maxHeight: 360 };
  }

  if (aspectRatio >= 1.15) {
    return { maxWidth: 600, maxHeight: 430 };
  }

  if (aspectRatio <= 0.55) {
    return { maxWidth: 340, maxHeight: 560 };
  }

  if (aspectRatio < 0.85) {
    return { maxWidth: 420, maxHeight: 560 };
  }

  return { maxWidth: 520, maxHeight: 520 };
};

const getBoundedImageSize = ({
  originalWidth,
  originalHeight,
  displaySize,
}: {
  originalWidth: number;
  originalHeight: number;
  displaySize: ImageDisplaySize;
}) => {
  if (displaySize === 'upload-thumbnail') {
    return { width: '100%', height: '96px' };
  }

  if (displaySize !== 'default') {
    return { width: '100%', height: 'auto' };
  }

  if (
    !Number.isFinite(originalWidth) ||
    !Number.isFinite(originalHeight) ||
    originalWidth <= 0 ||
    originalHeight <= 0
  ) {
    return { width: '520px', height: '520px' };
  }

  const bounds = getImagePreviewBounds({ displaySize, originalWidth, originalHeight });
  if (!bounds) {
    return { width: '100%', height: 'auto' };
  }

  const scale = Math.min(bounds.maxWidth / originalWidth, bounds.maxHeight / originalHeight, 1);
  const boundedWidth = Math.max(1, Math.round(originalWidth * scale));
  const boundedHeight = Math.max(1, Math.round(originalHeight * scale));

  return { width: `${boundedWidth}px`, height: `${boundedHeight}px` };
};

const convertBlobToPng = async (blob: Blob): Promise<Blob> => {
  if (blob.type === 'image/png') {
    return blob;
  }

  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to decode image for clipboard conversion.'));
      img.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to initialize canvas for clipboard conversion.');
    }

    context.drawImage(image, 0, 0);

    const pngBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), 'image/png');
    });

    if (!pngBlob) {
      throw new Error('Failed to convert image to PNG for clipboard copy.');
    }

    return pngBlob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const writeImageToClipboard = async (blob: Blob): Promise<void> => {
  if (typeof ClipboardItem === 'undefined') {
    throw new Error('Clipboard image copy is not supported in this browser.');
  }

  const writeBlob = async (mimeType: string, value: Blob) => {
    await navigator.clipboard.write([
      new ClipboardItem({
        [mimeType]: value,
      }),
    ]);
  };

  const sourceMimeType = blob.type || 'image/png';

  if (typeof ClipboardItem.supports === 'function' && !ClipboardItem.supports(sourceMimeType)) {
    const pngBlob = await convertBlobToPng(blob);
    await writeBlob('image/png', pngBlob);
    return;
  }

  try {
    await writeBlob(sourceMimeType, blob);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unsupportedType = /type\s+image\/.+\s+not\s+supported\s+on\s+write/i.test(message);

    if (sourceMimeType !== 'image/png' && unsupportedType) {
      const pngBlob = await convertBlobToPng(blob);
      await writeBlob('image/png', pngBlob);
      return;
    }

    throw error;
  }
};

const Image = ({
  imagePath,
  altText,
  height,
  width,
  placeholderDimensions,
  className,
  args,
  showPrompt = false,
  displaySize = 'default',
  showActions = false,
}: {
  imagePath: string;
  altText: string;
  height: number;
  width: number;
  placeholderDimensions?: {
    height?: string;
    width?: string;
  };
  className?: string;
  displaySize?: ImageDisplaySize;
  args?: {
    prompt?: string;
    quality?: 'low' | 'medium' | 'high';
    size?: string;
    style?: string;
    width?: number;
    height?: number;
    [key: string]: unknown;
  };
  showPrompt?: boolean;
  showActions?: boolean;
}) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { messageId, conversationId } = useMessageContext();
  const { isFavorited, toggleFavorite } = useImageFavorites();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isImageCopied, setIsImageCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleImageLoad = () => setIsLoaded(true);

  const dialogArgs = useMemo(
    () => ({
      ...args,
      width,
      height,
    }),
    [args, height, width],
  );

  const { width: scaledWidth, height: scaledHeight } = useMemo(() => {
    const originalWidth = Number(placeholderDimensions?.width?.split('px')[0] ?? width);
    const originalHeight = Number(placeholderDimensions?.height?.split('px')[0] ?? height);

    return getBoundedImageSize({
      originalWidth,
      originalHeight,
      displaySize,
    });
  }, [displaySize, placeholderDimensions, height, width]);

  const downloadImage = async () => {
    try {
      const response = await fetch(imagePath);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = altText || 'image.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      const link = document.createElement('a');
      link.href = imagePath;
      link.download = altText || 'image.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const isThumbnail = displaySize === 'thumbnail';
  const isWideThumbnail = displaySize === 'wide-thumbnail';
  const isUploadThumbnail = displaySize === 'upload-thumbnail';
  const isGroupedImage = isThumbnail || isWideThumbnail || isUploadThumbnail;
  const favoriteId = useMemo(
    () => getImageFavoriteId(messageId, imagePath),
    [imagePath, messageId],
  );

  const handleFavoriteToggle = async () => {
    try {
      const nextState = await toggleFavorite({
        id: favoriteId,
        messageId,
        conversationId: conversationId ?? undefined,
        imagePath,
        prompt: typeof args?.prompt === 'string' ? args.prompt : '',
        altText,
        width,
        height,
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
    if (typeof navigator === 'undefined' || navigator.clipboard == null) {
      showToast({
        message: 'Image copy is not available right now.',
        status: 'error',
        duration: 3000,
      });
      return;
    }

    try {
      const response = await fetch(imagePath);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const blob = await response.blob();
      await writeImageToClipboard(blob);

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

  return (
    <div
      ref={containerRef}
      className={cn(
        'space-y-2',
        isThumbnail && 'w-full min-w-0',
        isWideThumbnail && 'w-full min-w-0',
        isUploadThumbnail && 'w-32 min-w-0 sm:w-36 md:w-40',
      )}
    >
      <div
        className={cn(
          'relative mt-1 flex h-auto items-center justify-center overflow-hidden rounded-lg border border-border-light text-text-secondary-alt shadow-md',
          !isGroupedImage && 'w-fit max-w-full',
          isGroupedImage && 'w-full max-w-none rounded-md',
          isUploadThumbnail && 'h-24',
          className,
        )}
      >
        <button
          type="button"
          aria-label={`View ${altText} in dialog`}
          onClick={() => setIsOpen(true)}
          className={cn(
            'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            isGroupedImage && 'w-full',
          )}
        >
          <LazyLoadImage
            alt={altText}
            onLoad={handleImageLoad}
            visibleByDefault={true}
            className={cn(
              'opacity-100 transition-opacity duration-100',
              isLoaded ? 'opacity-100' : 'opacity-0',
            )}
            src={imagePath}
            style={{
              width: `${scaledWidth}`,
              height: isUploadThumbnail ? `${scaledHeight}` : 'auto',
              maxWidth: '100%',
              objectFit: isUploadThumbnail ? 'cover' : undefined,
              color: 'transparent',
              display: 'block',
            }}
            placeholder={
              <Skeleton
                className={cn('h-auto w-full', `h-[${scaledHeight}] w-[${scaledWidth}]`)}
                aria-label="Loading image"
                aria-busy="true"
              />
            }
          />
        </button>
        {isLoaded && (
          <DialogImage
            isOpen={isOpen}
            onOpenChange={setIsOpen}
            src={imagePath}
            downloadImage={downloadImage}
            args={dialogArgs}
          />
        )}
      </div>
      {showPrompt && typeof args?.prompt === 'string' && args.prompt.trim().length > 0 && (
        <div className="max-w-lg rounded-lg border border-border-light bg-surface-tertiary px-3 py-2 text-sm leading-relaxed text-text-primary">
          {args.prompt}
        </div>
      )}
      {showActions && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              void handleFavoriteToggle();
            }}
            title={
              isFavorited(favoriteId)
                ? localize('com_ui_favorite_remove')
                : localize('com_ui_favorite_add')
            }
            className="rounded-lg p-1.5 text-text-secondary-alt transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            <Star
              size={17}
              className={cn(isFavorited(favoriteId) ? 'fill-current text-yellow-400' : '')}
            />
          </button>
          <button
            type="button"
            onClick={() => {
              void handleCopyImage();
            }}
            title={
              isImageCopied ? localize('com_ui_copied_to_clipboard') : localize('com_ui_copy_image')
            }
            className="rounded-lg p-1.5 text-text-secondary-alt transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            {isImageCopied ? <CheckMark className="h-[17px] w-[17px]" /> : <ImagePlus size={17} />}
          </button>
          <button
            type="button"
            onClick={() => {
              void downloadImage();
            }}
            title={localize('com_ui_download')}
            className="rounded-lg p-1.5 text-text-secondary-alt transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            <Download size={17} />
          </button>
        </div>
      )}
    </div>
  );
};

export default Image;
