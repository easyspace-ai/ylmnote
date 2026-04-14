import { useQuery } from '@tanstack/react-query'
import { projectApi } from '@/services/api'

export function useProjectsList(status?: string) {
  return useQuery({
    queryKey: ['projects', status ?? 'all'],
    queryFn: () => projectApi.list({ status, limit: 50 }),
  })
}
