import { useState, memo } from 'react';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { Star, X } from 'lucide-react';
import type { TDialogProps } from '~/common';
import { useLocalize } from '~/hooks';
import useImageFavorites from '~/hooks/useImageFavorites';
import Image from '~/components/Chat/Messages/Content/Image';
import { cn } from '~/utils';

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('sv').replace(/-/g, '/');
}

function ImageFavoritesDialog({ open, onOpenChange }: TDialogProps) {
  const localize = useLocalize();
  const { favorites, removeFavorite } = useImageFavorites();

  return (
    <Transition appear show={open} as="div">
      <Dialog as="div" className="relative z-50" onClose={onOpenChange}>
        <TransitionChild
          as="div"
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <TransitionChild
              as="div"
              enter="ease-out duration-200"
              enterFrom="translate-y-2 opacity-0"
              enterTo="translate-y-0 opacity-100"
              leave="ease-in duration-150"
              leaveFrom="translate-y-0 opacity-100"
              leaveTo="translate-y-2 opacity-0"
            >
              <DialogPanel className="flex h-[720px] max-h-[85vh] w-[960px] max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-border-light bg-surface-primary shadow-xl">
                <DialogTitle as="div" className="flex items-center justify-between border-b border-border-light px-5 py-4">
                  <div className="flex items-center gap-2 text-base font-medium text-text-primary">
                    <Star className="size-5" />
                    <span>{localize('com_ui_my_favorites')}</span>
                  </div>
                  <button
                    type="button"
                    aria-label={localize('com_ui_close')}
                    title={localize('com_ui_close')}
                    onClick={() => onOpenChange(false)}
                    className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                  >
                    <X className="size-4" />
                  </button>
                </DialogTitle>

                <div className="flex-1 overflow-y-auto px-5 py-4">
                  {favorites.length === 0 ? (
                    <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-3 text-center text-text-secondary">
                      <Star className="size-9" />
                      <div className="text-sm">{localize('com_ui_no_favorites')}</div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {favorites.map((favorite) => (
                        <div
                          key={favorite.id}
                          className="overflow-hidden rounded-2xl border border-border-light bg-surface-secondary shadow-sm"
                        >
                          <div className="relative overflow-hidden bg-surface-primary-alt">
                            <Image
                              imagePath={favorite.imagePath}
                              altText={favorite.altText}
                              height={favorite.height ?? 1024}
                              width={favorite.width ?? 1024}
                              className="mt-0 max-w-none rounded-none border-0 shadow-none"
                              args={{ prompt: favorite.prompt }}
                            />
                            <button
                              type="button"
                              aria-label={localize('com_ui_remove_favorite')}
                              title={localize('com_ui_remove_favorite')}
                              onClick={() => removeFavorite(favorite.id)}
                              className="absolute right-2 top-2 rounded-full bg-black/55 p-1.5 text-white transition-colors hover:bg-black/75"
                            >
                              <X className="size-4" />
                            </button>
                          </div>
                          <div className="space-y-1.5 px-3 py-3">
                            <div className="flex items-center justify-between gap-3 text-xs text-text-secondary">
                              <span className="truncate">{favorite.model ?? localize('com_ui_image_created')}</span>
                              <span>{formatDate(favorite.favoritedAt)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

function ImageFavorites() {
  const localize = useLocalize();
  const { favorites } = useImageFavorites();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'mt-2 flex w-full items-center gap-2 rounded-xl p-2 text-sm text-text-primary transition-colors duration-200',
          'hover:bg-surface-hover',
        )}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-secondary text-text-primary">
          <Star className="size-4" />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <div className="truncate">{localize('com_ui_my_favorites')}</div>
        </div>
        <div className="rounded-full bg-surface-secondary px-2 py-0.5 text-xs text-text-secondary">
          {favorites.length}
        </div>
      </button>
      <ImageFavoritesDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export default memo(ImageFavorites);