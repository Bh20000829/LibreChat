import { Star, Trash2 } from 'lucide-react';
import { useLocalize } from '~/hooks';
import useImageFavorites from '~/hooks/useImageFavorites';

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('sv').replace(/-/g, '/');
}

export default function FavoritesPanel() {
  const localize = useLocalize();
  const { favorites, removeFavorite } = useImageFavorites();

  if (favorites.length === 0) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-4 py-8 text-center text-text-secondary">
        <Star className="size-8" />
        <div className="text-sm">{localize('com_ui_no_favorites')}</div>
      </div>
    );
  }

  return (
    <div className="h-auto max-w-full overflow-x-hidden px-3 py-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {favorites.map((favorite) => (
          <div
            key={favorite.id}
            className="overflow-hidden rounded-xl border border-border-light bg-surface-primary shadow-sm"
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-secondary">
              <img
                src={favorite.imagePath}
                alt={favorite.altText}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                aria-label={localize('com_ui_remove_favorite')}
                title={localize('com_ui_remove_favorite')}
                onClick={() => removeFavorite(favorite.id)}
                className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            <div className="space-y-1 px-3 py-2">
              <div className="line-clamp-2 text-sm text-text-primary">{favorite.prompt}</div>
              <div className="flex items-center justify-between text-xs text-text-secondary">
                <span>{favorite.model ?? localize('com_ui_image_created')}</span>
                <span>{formatDate(favorite.favoritedAt)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}