import { useMemo, useState } from 'react';
import ProgressText from './ProgressText';
import ImageGenerationPlaceholder from './ImageGenerationPlaceholder';
import { useProgress } from '~/hooks';

export default function ImageGen({
  initialProgress = 0.1,
  args = '',
}: {
  initialProgress: number;
  args: string;
}) {
  const progress = useProgress(initialProgress);
  const [showDetails, setShowDetails] = useState(false);
  const { width, height } = useMemo(() => {
    try {
      const parsedArgs = JSON.parse(args) as { size?: string };
      if (!parsedArgs?.size || typeof parsedArgs.size !== 'string') {
        return { width: undefined, height: undefined };
      }

      const [parsedWidth, parsedHeight] = parsedArgs.size.split('x').map((value) => Number(value));
      if (!Number.isFinite(parsedWidth) || !Number.isFinite(parsedHeight)) {
        return { width: undefined, height: undefined };
      }

      return {
        width: `${parsedWidth}px`,
        height: `${parsedHeight}px`,
      };
    } catch (_error) {
      return { width: undefined, height: undefined };
    }
  }, [args]);

  // const [translate, setTranslate] = useState(0);
  // useEffect(() => {
  //   const timer = setInterval(() => {
  //     setTranslate((prevTranslate) => (prevTranslate + 1) % 360);
  //   }, 20);
  //   return () => clearInterval(timer);
  // }, []);
  // if (progress >= 1) {
  //   return null;
  // }

  return (
    <div className="my-2.5 flex w-full max-w-lg flex-col gap-3">
      <ProgressText
        progress={progress}
        onClick={() => setShowDetails((prev) => !prev)}
        inProgressText="Creating Image"
        finishedText="Finished."
        hasInput={false}
      />
      {progress < 1 && <ImageGenerationPlaceholder width={width} height={height} progress={progress} />}
    </div>
  );
}
