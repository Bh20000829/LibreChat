import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '~/hooks/AuthContext';

export type TImageFavorite = {
  id: string;
  messageId: string;
  conversationId?: string;
  imagePath: string;
  prompt: string;
  altText: string;
  width?: number;
  height?: number;
  model?: string;
  favoritedAt: number;
};

type TImageFavoriteApi = Partial<TImageFavorite> & {
  favoriteId?: string;
};

const EMPTY_FAVORITES: TImageFavorite[] = [];
const QUERY_KEY = ['image-favorites'];

function normalizeFavorite(favorite: TImageFavoriteApi): TImageFavorite {
  return {
    id: favorite.id ?? favorite.favoriteId ?? '',
    messageId: favorite.messageId ?? '',
    conversationId: favorite.conversationId,
    imagePath: favorite.imagePath ?? '',
    prompt: favorite.prompt ?? '',
    altText: favorite.altText ?? 'Generated Image',
    width: favorite.width,
    height: favorite.height,
    model: favorite.model,
    favoritedAt: favorite.favoritedAt ?? Date.now(),
  };
}

function createAuthHeaders(token?: string) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function getImageFavorites(token?: string): Promise<TImageFavorite[]> {
  const response = await fetch('/api/image-favorites', {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch image favorites');
  }

  const favorites = (await response.json()) as TImageFavoriteApi[];
  return Array.isArray(favorites) ? favorites.map(normalizeFavorite) : EMPTY_FAVORITES;
}

async function createImageFavorite({
  favorite,
  token,
}: {
  favorite: TImageFavorite;
  token?: string;
}): Promise<TImageFavorite> {
  const response = await fetch('/api/image-favorites', {
    method: 'POST',
    headers: createAuthHeaders(token),
    credentials: 'include',
    body: JSON.stringify({
      messageId: favorite.messageId,
      imagePath: favorite.imagePath,
      favoritedAt: favorite.favoritedAt,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to save image favorite');
  }

  return normalizeFavorite((await response.json()) as TImageFavoriteApi);
}

async function removeImageFavorite({
  favoriteId,
  token,
}: {
  favoriteId: string;
  token?: string;
}): Promise<void> {
  const response = await fetch(`/api/image-favorites/${encodeURIComponent(favoriteId)}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    credentials: 'include',
  });

  if (!response.ok && response.status !== 404) {
    throw new Error('Failed to delete image favorite');
  }
}

export function getImageFavoriteId(messageId: string, imagePath: string) {
  return `${messageId}::${encodeURIComponent(imagePath)}`;
}

export default function useImageFavorites() {
  const queryClient = useQueryClient();
  const { isAuthenticated, token, user } = useAuthContext();
  const userId = user?.id ?? '';
  const queryKey = [...QUERY_KEY, userId || 'anonymous'];

  const { data: favorites = EMPTY_FAVORITES } = useQuery<TImageFavorite[]>(
    queryKey,
    () => getImageFavorites(token),
    {
      enabled: !!userId || !!token || !!isAuthenticated,
      initialData: EMPTY_FAVORITES,
      placeholderData: (previousData) => previousData ?? EMPTY_FAVORITES,
      refetchOnMount: 'always',
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    },
  );

  const sortedFavorites = useMemo(
    () => [...favorites].sort((a, b) => b.favoritedAt - a.favoritedAt),
    [favorites],
  );

  const favoriteIds = useMemo(() => new Set(favorites.map((favorite) => favorite.id)), [favorites]);

  const isFavorited = useCallback((id: string) => favoriteIds.has(id), [favoriteIds]);

  const addMutation = useMutation(createImageFavorite, {
    onMutate: async ({ favorite }) => {
      await queryClient.cancelQueries(queryKey);
      const previousFavorites =
        queryClient.getQueryData<TImageFavorite[]>(queryKey) ?? EMPTY_FAVORITES;

      queryClient.setQueryData<TImageFavorite[]>(queryKey, (current = EMPTY_FAVORITES) => {
        if (current.some((item) => item.id === favorite.id)) {
          return current;
        }

        return [favorite, ...current];
      });

      return { previousFavorites };
    },
    onSuccess: (favorite) => {
      queryClient.setQueryData<TImageFavorite[]>(queryKey, (current = EMPTY_FAVORITES) => {
        const filtered = current.filter((item) => item.id !== favorite.id);
        return [favorite, ...filtered];
      });
    },
    onError: (_error, _favorite, context) => {
      queryClient.setQueryData<TImageFavorite[]>(
        queryKey,
        context?.previousFavorites ?? EMPTY_FAVORITES,
      );
    },
  });

  const removeMutation = useMutation(removeImageFavorite, {
    onMutate: async ({ favoriteId }) => {
      await queryClient.cancelQueries(queryKey);
      const previousFavorites =
        queryClient.getQueryData<TImageFavorite[]>(queryKey) ?? EMPTY_FAVORITES;

      queryClient.setQueryData<TImageFavorite[]>(queryKey, (current = EMPTY_FAVORITES) =>
        current.filter((favorite) => favorite.id !== favoriteId),
      );

      return { previousFavorites };
    },
    onSuccess: (_data, { favoriteId }) => {
      queryClient.setQueryData<TImageFavorite[]>(queryKey, (current = EMPTY_FAVORITES) =>
        current.filter((favorite) => favorite.id !== favoriteId),
      );
    },
    onError: (_error, _favoriteId, context) => {
      queryClient.setQueryData<TImageFavorite[]>(
        queryKey,
        context?.previousFavorites ?? EMPTY_FAVORITES,
      );
    },
  });

  const addFavorite = useCallback(
    async (favorite: TImageFavorite) => {
      if (!isAuthenticated || favoriteIds.has(favorite.id)) {
        return;
      }

      await addMutation.mutateAsync({ favorite, token });
    },
    [addMutation, favoriteIds, isAuthenticated, token],
  );

  const removeFavorite = useCallback(
    async (id: string) => {
      if (!isAuthenticated) {
        return;
      }

      await removeMutation.mutateAsync({ favoriteId: id, token });
    },
    [isAuthenticated, removeMutation, token],
  );

  const toggleFavorite = useCallback(
    async (favorite: TImageFavorite) => {
      if (!isAuthenticated) {
        return false;
      }

      if (favoriteIds.has(favorite.id)) {
        await removeMutation.mutateAsync({ favoriteId: favorite.id, token });
        return false;
      }

      await addMutation.mutateAsync({ favorite, token });
      return true;
    },
    [addMutation, favoriteIds, isAuthenticated, removeMutation, token],
  );

  return {
    favorites: sortedFavorites,
    isFavorited,
    addFavorite,
    removeFavorite,
    toggleFavorite,
  };
}
