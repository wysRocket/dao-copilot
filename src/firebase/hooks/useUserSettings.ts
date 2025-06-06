import {useQuery, useMutation, useQueryClient} from '@tanstack/react-query';
import {getUserSettings, setUserSettings} from '../firestore';
import {useAuth} from '@/contexts/AuthContext';
import {UserSettings} from '@/types/user-settings';

export function useUserSettings() {
  const {user} = useAuth();
  const queryClient = useQueryClient();

  const userId = user?.uid;

  const settingsQuery = useQuery({
    queryKey: ['userSettings', userId],
    queryFn: () => (userId ? getUserSettings(userId) : null),
    enabled: !!userId,
  });

  const mutation = useMutation({
    mutationFn: (data: UserSettings) =>
      userId
        ? setUserSettings(userId, data)
        : Promise.reject(new Error('No user')),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['userSettings', userId],
      });
    },
  });

  return {
    settings: settingsQuery.data,
    isLoading: settingsQuery.isLoading,
    isError: settingsQuery.isError,
    refetch: settingsQuery.refetch,
    updateSettings: mutation.mutateAsync,
    updating: mutation.isPending,
  };
}
