import React, { memo, useMemo } from 'react';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import supersub from 'remark-supersub';
import rehypeKatex from 'rehype-katex';
import { useRecoilValue } from 'recoil';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkDirective from 'remark-directive';
import type { Pluggable } from 'unified';
import { Citation, CompositeCitation, HighlightedText } from '~/components/Web/Citation';
import { Artifact, artifactPlugin } from '~/components/Artifacts/Artifact';
import { ArtifactProvider, CodeBlockProvider } from '~/Providers';
import { useChatContext } from '~/Providers';
import MarkdownErrorBoundary from './MarkdownErrorBoundary';
import ImageGenerationPlaceholder from './ImageGenerationPlaceholder';
import { langSubset, preprocessLaTeX } from '~/utils';
import { unicodeCitation } from '~/components/Web';
import { code, a, p } from './MarkdownComponents';
import store from '~/store';

type TContentProps = {
  content: string;
  isLatestMessage: boolean;
};

// --- 新增代码开始 ---
// 用于递归处理节点，将文本中的 <br> 标签替换为实际的换行组件
const processTableContent = (content: React.ReactNode): React.ReactNode => {
  if (typeof content === 'string') {
    const parts = content.split(/<br\s*\/?>/gi); // 匹配 <br>, <br/>, <br />
    if (parts.length === 1) return content;

    return parts.map((part, i) => (
      <React.Fragment key={i}>
        {i > 0 && <br />}
        {part}
      </React.Fragment>
    ));
  }

  if (Array.isArray(content)) {
    return content.map((child, i) => (
      <React.Fragment key={i}>{processTableContent(child)}</React.Fragment>
    ));
  }

  if (React.isValidElement(content) && content.props.children) {
    return React.cloneElement(content as React.ReactElement, {
      ...content.props,
      children: processTableContent(content.props.children),
    });
  }

  return content;
};
// --- 新增代码结束 ---

const Markdown = memo(({ content = '', isLatestMessage }: TContentProps) => {
  const { conversation } = useChatContext();
  const LaTeXParsing = useRecoilValue<boolean>(store.LaTeXParsing);
  const isInitializing = content === '';
  const isImageModeInitializing = isInitializing && conversation?.mode === 'image';

  const currentContent = useMemo(() => {
    if (isInitializing) {
      return '';
    }
    return LaTeXParsing ? preprocessLaTeX(content) : content;
  }, [content, LaTeXParsing, isInitializing]);

  const rehypePlugins = useMemo(
    () => [
      [rehypeKatex],
      [
        rehypeHighlight,
        {
          detect: true,
          ignoreMissing: true,
          subset: langSubset,
        },
      ],
    ],
    [],
  );

  const remarkPlugins: Pluggable[] = [
    supersub,
    remarkGfm,
    remarkDirective,
    artifactPlugin,
    [remarkMath, { singleDollarTextMath: false }],
    unicodeCitation,
  ];

  if (isImageModeInitializing) {
    return <ImageGenerationPlaceholder progress={0.1} className="max-w-lg" />;
  }

  if (isInitializing) {
    return (
      <div className="absolute">
        <p className="relative">
          <span className={isLatestMessage ? 'result-thinking' : ''} />
        </p>
      </div>
    );
  }

  return (
    <MarkdownErrorBoundary content={content} codeExecution={true}>
      <ArtifactProvider>
        <CodeBlockProvider>
          <ReactMarkdown
            /** @ts-ignore */
            remarkPlugins={remarkPlugins}
            /* @ts-ignore */
            rehypePlugins={rehypePlugins}
            components={
              {
                code,
                a,
                p,
                artifact: Artifact,
                citation: Citation,
                'highlighted-text': HighlightedText,
                'composite-citation': CompositeCitation,
                // --- 新增 td 组件映射 ---
                td: ({ children, ...props }: any) => (
                  <td
                    {...props}
                    className="break-words border border-black/10 p-2 text-left align-top dark:border-white/10"
                  >
                    {processTableContent(children)}
                  </td>
                ),
                // -----------------------
              } as {
                [nodeType: string]: React.ElementType;
              }
            }
          >
            {currentContent}
          </ReactMarkdown>
        </CodeBlockProvider>
      </ArtifactProvider>
    </MarkdownErrorBoundary>
  );
});

export default Markdown;
