import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type ImageGenerationPlaceholderProps = {
  width?: string;
  height?: string;
  progress: number;
  error?: boolean;
  className?: string;
};

export default function ImageGenerationPlaceholder({
  width: _width,
  height: _height,
  progress: _progress,
  error = false,
  className,
}: ImageGenerationPlaceholderProps) {
  const localize = useLocalize();

  return (
    <div
      className={cn(
        'text-message mb-[0.625rem] flex min-h-[20px] flex-col items-start gap-3 overflow-visible',
        className,
      )}
    >
      <div className="markdown prose dark:prose-invert light w-full break-words dark:text-gray-100">
        <div className="absolute">
          <p className="submitting relative">
            <span className="result-thinking" />
          </p>
        </div>
      </div>
      {error && (
        <div className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-200">
          {localize('com_ui_error')}
        </div>
      )}
    </div>
  );
}
