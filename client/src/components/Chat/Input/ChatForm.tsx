import { memo, useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { useWatch } from 'react-hook-form';
import { TextareaAutosize, Dropdown } from '@librechat/client';
import {
  Root as PopoverRoot,
  Content as PopoverContent,
  Trigger as PopoverTrigger,
} from '@radix-ui/react-popover';
import { useRecoilState, useRecoilValue } from 'recoil';
import {
  Constants,
  EModelEndpoint,
  isAssistantsEndpoint,
  isAgentsEndpoint,
} from 'librechat-data-provider';
import {
  useChatContext,
  useChatFormContext,
  useAddedChatContext,
  useAssistantsMapContext,
} from '~/Providers';
import {
  useTextarea,
  useAutoSave,
  useLocalize,
  useRequiresKey,
  useHandleKeyUp,
  useQueryParams,
  useSubmitMessage,
  useFocusChatEffect,
  useSetIndexOptions,
} from '~/hooks';
import { mainTextareaId, BadgeItem } from '~/common';
import useConversationMode from '~/hooks/Conversations/useConversationMode';
import AttachFileChat from './Files/AttachFileChat';
import FileFormChat from './Files/FileFormChat';
import { canInheritFromImageMessage, cn, removeFocusRings } from '~/utils';
import TextareaHeader from './TextareaHeader';
import PromptsCommand from './PromptsCommand';
import AudioRecorder from './AudioRecorder';
import CollapseChat from './CollapseChat';
import StreamAudio from './StreamAudio';
import StopButton from './StopButton';
import SendButton from './SendButton';
import EditBadges from './EditBadges';
import BadgeRow from './BadgeRow';
import Mention from './Mention';
import store from '~/store';

const ChatForm = memo(({ index = 0 }: { index?: number }) => {
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  useFocusChatEffect(textAreaRef);
  const localize = useLocalize();
  const { setOption } = useSetIndexOptions();
  const { mode } = useConversationMode(index);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDoubaoImageSettingsOpen, setIsDoubaoImageSettingsOpen] = useState(false);
  const [, setIsScrollable] = useState(false);
  const [visualRowCount, setVisualRowCount] = useState(1);
  const [isTextAreaFocused, setIsTextAreaFocused] = useState(false);
  const [backupBadges, setBackupBadges] = useState<Pick<BadgeItem, 'id'>[]>([]);

  const SpeechToText = useRecoilValue(store.speechToText);
  const TextToSpeech = useRecoilValue(store.textToSpeech);
  const chatDirection = useRecoilValue(store.chatDirection);
  const automaticPlayback = useRecoilValue(store.automaticPlayback);
  const maximizeChatSpace = useRecoilValue(store.maximizeChatSpace);
  const centerFormOnLanding = useRecoilValue(store.centerFormOnLanding);
  const isTemporary = useRecoilValue(store.isTemporary);
  const saveDrafts = useRecoilValue(store.saveDrafts);

  const [badges, setBadges] = useRecoilState(store.chatBadges);
  const [isEditingBadges, setIsEditingBadges] = useRecoilState(store.isEditingBadges);
  const [showStopButton, setShowStopButton] = useRecoilState(store.showStopButtonByIndex(index));
  const [showPlusPopover, setShowPlusPopover] = useRecoilState(store.showPlusPopoverFamily(index));
  const [showMentionPopover, setShowMentionPopover] = useRecoilState(
    store.showMentionPopoverFamily(index),
  );

  const { requiresKey } = useRequiresKey();
  const methods = useChatFormContext();
  const {
    files,
    setFiles,
    conversation,
    isSubmitting,
    filesLoading,
    latestMessage,
    newConversation,
    handleStopGenerating,
  } = useChatContext();
  const {
    addedIndex,
    generateConversation,
    conversation: addedConvo,
    setConversation: setAddedConvo,
    isSubmitting: isSubmittingAdded,
  } = useAddedChatContext();
  const assistantMap = useAssistantsMapContext();
  const showStopAdded = useRecoilValue(store.showStopButtonByIndex(addedIndex));

  const endpoint = useMemo(
    () => conversation?.endpointType ?? conversation?.endpoint,
    [conversation?.endpointType, conversation?.endpoint],
  );
  const conversationId = useMemo(
    () => conversation?.conversationId ?? Constants.NEW_CONVO,
    [conversation?.conversationId],
  );
  const imageModeEnabled = useMemo(() => mode === 'image', [mode]);
  const isDoubaoImageMode = useMemo(
    () =>
      imageModeEnabled &&
      (conversation?.endpoint === EModelEndpoint.doubao ||
        conversation?.endpointType === EModelEndpoint.doubao ||
        endpoint === EModelEndpoint.doubao),
    [conversation?.endpoint, conversation?.endpointType, endpoint, imageModeEnabled],
  );
  const imageSizeOptions = useMemo(
    () =>
      isDoubaoImageMode
        ? [
            { value: 'auto', label: localize('com_ui_smart') },
            { value: '21:9', label: '21:9' },
            { value: '16:9', label: '16:9' },
            { value: '3:2', label: '3:2' },
            { value: '4:3', label: '4:3' },
            { value: '1:1', label: '1:1' },
            { value: '3:4', label: '3:4' },
            { value: '2:3', label: '2:3' },
            { value: '9:16', label: '9:16' },
          ]
        : [
            { value: '1:1', label: '1:1' },
            { value: '16:9', label: '16:9' },
            { value: '9:16', label: '9:16' },
            { value: '4:3', label: '4:3' },
            { value: '3:4', label: '3:4' },
          ],
    [isDoubaoImageMode, localize],
  );
  const selectedImageSize = useMemo(() => {
    const configuredSize = conversation?.imageSize ?? (isDoubaoImageMode ? 'auto' : '1:1');
    return imageSizeOptions.some((option) => option.value === configuredSize)
      ? configuredSize
      : '1:1';
  }, [conversation?.imageSize, imageSizeOptions, isDoubaoImageMode]);
  const selectedImageSizeLabel = useMemo(
    () =>
      imageSizeOptions.find((option) => option.value === selectedImageSize)?.label ??
      selectedImageSize,
    [imageSizeOptions, selectedImageSize],
  );
  const selectedImageResolution = conversation?.imageResolution === '4K' ? '4K' : '2K';
  const imageMaxImageOptions = useMemo(
    () => Array.from({ length: 4 }, (_, index) => index + 1),
    [],
  );
  const selectedImageMaxImages = useMemo(() => {
    const parsedValue = Number(conversation?.imageMaxImages ?? 1);
    if (!Number.isFinite(parsedValue)) {
      return 1;
    }

    return Math.min(Math.max(Math.floor(parsedValue), 1), 4);
  }, [conversation?.imageMaxImages]);
  const inheritPreviousImage =
    (conversation?.inheritPreviousImage ?? true) && canInheritFromImageMessage(latestMessage);
  const hasUserUploadedFiles = (files?.size ?? 0) > 0;
  const hasConversationMessages =
    Array.isArray(conversation?.messages) && conversation.messages.length > 0;
  const showImageInheritanceHint =
    imageModeEnabled &&
    inheritPreviousImage &&
    !hasUserUploadedFiles &&
    hasConversationMessages &&
    conversationId !== Constants.NEW_CONVO &&
    conversationId !== Constants.PENDING_CONVO;

  const isRTL = useMemo(
    () => (chatDirection != null ? chatDirection?.toLowerCase() === 'rtl' : false),
    [chatDirection],
  );
  const invalidAssistant = useMemo(
    () =>
      isAssistantsEndpoint(endpoint) &&
      (!(conversation?.assistant_id ?? '') ||
        !assistantMap?.[endpoint ?? '']?.[conversation?.assistant_id ?? '']),
    [conversation?.assistant_id, endpoint, assistantMap],
  );
  const disableInputs = useMemo(
    () => requiresKey || invalidAssistant,
    [requiresKey, invalidAssistant],
  );

  const handleContainerClick = useCallback(() => {
    /** Check if the device is a touchscreen */
    if (window.matchMedia?.('(pointer: coarse)').matches) {
      return;
    }
    textAreaRef.current?.focus();
  }, []);

  const handleFocusOrClick = useCallback(() => {
    if (isCollapsed) {
      setIsCollapsed(false);
    }
  }, [isCollapsed]);

  useAutoSave({
    files,
    setFiles,
    textAreaRef,
    conversationId,
    mode,
    isSubmitting: isSubmitting || isSubmittingAdded,
  });

  useEffect(() => {
    if (saveDrafts) {
      return;
    }

    // 清空文字输入框
    methods.setValue('text', '');
    // 清空已上传的文件（如果有 setFiles 方法）
    if (setFiles) {
      setFiles(new Map());
    }
    // (可选) 切换后自动聚焦输入框
    if (textAreaRef.current) {
      textAreaRef.current.focus();
    }
  }, [conversationId, methods, saveDrafts, setFiles]);

  const { submitMessage, submitPrompt } = useSubmitMessage();

  const handleKeyUp = useHandleKeyUp({
    index,
    textAreaRef,
    setShowPlusPopover,
    setShowMentionPopover,
  });
  const {
    isNotAppendable,
    placeholderText,
    handlePaste,
    handleKeyDown,
    handleCompositionStart,
    handleCompositionEnd,
  } = useTextarea({
    textAreaRef,
    submitButtonRef,
    setIsScrollable,
    disabled: disableInputs,
  });

  useQueryParams({ textAreaRef });

  const { ref, ...registerProps } = methods.register('text', {
    required: true,
    onChange: useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) =>
        methods.setValue('text', e.target.value, { shouldValidate: true }),
      [methods],
    ),
  });

  const textValue = useWatch({ control: methods.control, name: 'text' });

  useEffect(() => {
    if (textAreaRef.current) {
      const style = window.getComputedStyle(textAreaRef.current);
      const lineHeight = parseFloat(style.lineHeight);
      setVisualRowCount(Math.floor(textAreaRef.current.scrollHeight / lineHeight));
    }
  }, [textValue]);

  useEffect(() => {
    if (isEditingBadges && backupBadges.length === 0) {
      setBackupBadges([...badges]);
    }
  }, [isEditingBadges, badges, backupBadges.length]);

  const handleSaveBadges = useCallback(() => {
    setIsEditingBadges(false);
    setBackupBadges([]);
  }, [setIsEditingBadges, setBackupBadges]);

  const handleCancelBadges = useCallback(() => {
    if (backupBadges.length > 0) {
      setBadges([...backupBadges]);
    }
    setIsEditingBadges(false);
    setBackupBadges([]);
  }, [backupBadges, setBadges, setIsEditingBadges]);

  const isMoreThanThreeRows = visualRowCount > 3;

  const baseClasses = useMemo(
    () =>
      cn(
        'md:py-3.5 m-0 w-full resize-none py-[13px] placeholder-black/50 bg-transparent dark:placeholder-white/50 [&:has(textarea:focus)]:shadow-[0_2px_6px_rgba(0,0,0,.05)]',
        isCollapsed ? 'max-h-[52px]' : 'max-h-[45vh] md:max-h-[55vh]',
        isMoreThanThreeRows ? 'pl-5' : 'px-5',
      ),
    [isCollapsed, isMoreThanThreeRows],
  );

  return (
    <form
      onSubmit={methods.handleSubmit(submitMessage)}
      className={cn(
        'mx-auto flex w-full flex-row gap-3 transition-[max-width] duration-300 sm:px-2',
        maximizeChatSpace ? 'max-w-full' : 'md:max-w-3xl xl:max-w-4xl',
        centerFormOnLanding &&
          (conversationId == null || conversationId === Constants.NEW_CONVO) &&
          !isSubmitting &&
          conversation?.messages?.length === 0
          ? 'transition-all duration-200 sm:mb-28'
          : 'sm:mb-10',
      )}
    >
      <div className="relative flex h-full flex-1 items-stretch md:flex-col">
        <div className={cn('flex w-full items-center', isRTL && 'flex-row-reverse')}>
          {showPlusPopover && !isAssistantsEndpoint(endpoint) && (
            <Mention
              conversation={conversation}
              setShowMentionPopover={setShowPlusPopover}
              newConversation={generateConversation}
              textAreaRef={textAreaRef}
              commandChar="+"
              placeholder="com_ui_add_model_preset"
              includeAssistants={false}
            />
          )}
          {showMentionPopover && (
            <Mention
              conversation={conversation}
              setShowMentionPopover={setShowMentionPopover}
              newConversation={newConversation}
              textAreaRef={textAreaRef}
            />
          )}
          <PromptsCommand index={index} textAreaRef={textAreaRef} submitPrompt={submitPrompt} />
          <div
            onClick={handleContainerClick}
            className={cn(
              'relative flex w-full flex-grow flex-col overflow-hidden rounded-t-3xl border pb-4 text-text-primary transition-all duration-200 sm:rounded-3xl sm:pb-0',
              isTextAreaFocused ? 'shadow-lg' : 'shadow-md',
              isTemporary
                ? 'border-violet-800/60 bg-violet-950/10'
                : 'border-border-light bg-surface-chat',
            )}
          >
            <TextareaHeader addedConvo={addedConvo} setAddedConvo={setAddedConvo} />
            <EditBadges
              isEditingChatBadges={isEditingBadges}
              handleCancelBadges={handleCancelBadges}
              handleSaveBadges={handleSaveBadges}
              setBadges={setBadges}
            />
            <FileFormChat conversation={conversation} mode={mode} />
            {endpoint && (
              <div className={cn('flex', isRTL ? 'flex-row-reverse' : 'flex-row')}>
                <TextareaAutosize
                  {...registerProps}
                  ref={(e) => {
                    ref(e);
                    (textAreaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = e;
                  }}
                  disabled={disableInputs || isNotAppendable}
                  onPaste={handlePaste}
                  onKeyDown={handleKeyDown}
                  onKeyUp={handleKeyUp}
                  onCompositionStart={handleCompositionStart}
                  onCompositionEnd={handleCompositionEnd}
                  id={mainTextareaId}
                  tabIndex={0}
                  data-testid="text-input"
                  rows={1}
                  onFocus={() => {
                    handleFocusOrClick();
                    setIsTextAreaFocused(true);
                  }}
                  onBlur={setIsTextAreaFocused.bind(null, false)}
                  aria-label={localize('com_ui_message_input')}
                  placeholder={placeholderText}
                  onClick={handleFocusOrClick}
                  style={{ height: 44, overflowY: 'auto' }}
                  className={cn(
                    baseClasses,
                    removeFocusRings,
                    'transition-[max-height] duration-200 disabled:cursor-not-allowed',
                  )}
                />
                <div className="flex flex-col items-start justify-start pt-1.5">
                  <CollapseChat
                    isCollapsed={isCollapsed}
                    isScrollable={isMoreThanThreeRows}
                    setIsCollapsed={setIsCollapsed}
                  />
                </div>
              </div>
            )}
            <div
              className={cn(
                '@container items-between flex gap-2 pb-2',
                isRTL ? 'flex-row-reverse' : 'flex-row',
              )}
            >
              <div className={cn('flex items-center gap-2', isRTL ? 'mr-2' : 'ml-2')}>
                <AttachFileChat conversation={conversation} disableInputs={disableInputs} />
                {imageModeEnabled && (
                  <>
                    {isDoubaoImageMode ? (
                      <>
                        <PopoverRoot
                          open={isDoubaoImageSettingsOpen}
                          onOpenChange={setIsDoubaoImageSettingsOpen}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              aria-label={localize('com_ui_image_settings')}
                              disabled={disableInputs}
                              className="text-text-primary/85 hover:bg-surface-hover/50 flex h-8 min-w-[104px] items-center gap-2 rounded-lg border border-transparent bg-transparent px-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <span className="border-current/70 flex size-4 items-center justify-center rounded border">
                                <span className="border-current/80 size-1.5 rounded-sm border" />
                              </span>
                              <span>{selectedImageSizeLabel}</span>
                              <span className="text-text-secondary">{selectedImageResolution}</span>
                              <span className="text-text-secondary">
                                {selectedImageMaxImages}
                                {localize('com_ui_image_count_suffix')}
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            side="top"
                            align={isRTL ? 'end' : 'start'}
                            sideOffset={10}
                            className="z-50 w-[min(464px,calc(100vw-32px))] rounded-2xl border border-border-light bg-surface-primary p-3 shadow-xl outline-none"
                          >
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <div className="text-xs text-text-secondary">
                                  {localize('com_ui_select_ratio')}
                                </div>
                                <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-secondary p-2 sm:grid-cols-6">
                                  {imageSizeOptions.map((option) => {
                                    const selected = selectedImageSize === option.value;
                                    const isPortrait = ['1:1', '3:4', '2:3', '9:16'].includes(
                                      option.value,
                                    );
                                    const isSmart = option.value === 'auto';
                                    return (
                                      <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setOption('imageSize')(option.value)}
                                        className={cn(
                                          'flex h-[66px] flex-col items-center justify-center gap-1 rounded-lg text-xs text-text-primary transition-colors hover:bg-surface-hover',
                                          selected && 'bg-surface-hover shadow-sm',
                                        )}
                                      >
                                        <span className="flex h-5 items-center justify-center">
                                          {isSmart ? (
                                            <span className="border-current/80 flex size-4 items-center justify-center rounded border">
                                              <span className="border-current/80 size-1.5 rounded-sm border" />
                                            </span>
                                          ) : (
                                            <span
                                              className={cn(
                                                'border-current/80 rounded-sm border',
                                                isPortrait ? 'h-4 w-2.5' : 'h-2.5 w-4',
                                              )}
                                            />
                                          )}
                                        </span>
                                        <span>{option.label}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="space-y-2">
                                <div className="text-xs text-text-secondary">
                                  {localize('com_ui_select_resolution')}
                                </div>
                                <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-secondary p-1">
                                  {[
                                    { value: '2K', label: localize('com_ui_hd_2k') },
                                    { value: '4K', label: localize('com_ui_ultra_4k') },
                                  ].map((option) => (
                                    <button
                                      key={option.value}
                                      type="button"
                                      onClick={() => setOption('imageResolution')(option.value)}
                                      className={cn(
                                        'h-9 rounded-lg px-3 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover',
                                        selectedImageResolution === option.value &&
                                          'bg-surface-hover shadow-sm',
                                      )}
                                    >
                                      {option.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="space-y-2">
                                <div className="text-xs text-text-secondary">
                                  {localize('com_ui_select_image_count')}
                                </div>
                                <div className="grid grid-cols-5 gap-1.5 rounded-xl bg-surface-secondary p-1.5">
                                  {imageMaxImageOptions.map((count) => (
                                    <button
                                      key={count}
                                      type="button"
                                      aria-label={`${localize('com_ui_select_image_count')} ${count}`}
                                      onClick={() => setOption('imageMaxImages')(count)}
                                      className={cn(
                                        'h-8 rounded-lg px-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover',
                                        selectedImageMaxImages === count &&
                                          'bg-surface-hover shadow-sm',
                                      )}
                                    >
                                      {count}
                                      {localize('com_ui_image_count_suffix')}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </PopoverContent>
                        </PopoverRoot>
                      </>
                    ) : (
                      <Dropdown
                        value={selectedImageSize}
                        onChange={setOption('imageSize')}
                        options={imageSizeOptions}
                        ariaLabel={localize('com_ui_size')}
                        className="text-text-primary/85 hover:bg-surface-hover/50 min-w-[92px] border-transparent bg-transparent"
                        sizeClasses="w-[140px]"
                      />
                    )}
                    {showImageInheritanceHint && (
                      <span className="hidden text-xs text-text-secondary sm:inline">
                        {localize('com_ui_image_inherit_hint')}
                      </span>
                    )}
                  </>
                )}
              </div>
              {!imageModeEnabled && (
                <BadgeRow
                  showEphemeralBadges={
                    !isAgentsEndpoint(endpoint) && !isAssistantsEndpoint(endpoint)
                  }
                  isSubmitting={isSubmitting || isSubmittingAdded}
                  conversationId={conversationId}
                  onChange={setBadges}
                  isInChat={
                    Array.isArray(conversation?.messages) && conversation.messages.length >= 1
                  }
                />
              )}
              <div className="mx-auto flex" />
              {!imageModeEnabled && SpeechToText && (
                <AudioRecorder
                  methods={methods}
                  ask={submitMessage}
                  textAreaRef={textAreaRef}
                  disabled={disableInputs || isNotAppendable}
                  isSubmitting={isSubmitting}
                />
              )}
              <div className={`${isRTL ? 'ml-2' : 'mr-2'}`}>
                {(isSubmitting || isSubmittingAdded) && (showStopButton || showStopAdded) ? (
                  <StopButton stop={handleStopGenerating} setShowStopButton={setShowStopButton} />
                ) : (
                  endpoint && (
                    <SendButton
                      ref={submitButtonRef}
                      control={methods.control}
                      disabled={filesLoading || isSubmitting || disableInputs || isNotAppendable}
                    />
                  )
                )}
              </div>
            </div>
            {TextToSpeech && automaticPlayback && <StreamAudio index={index} />}
          </div>
        </div>
      </div>
    </form>
  );
});

export default ChatForm;
