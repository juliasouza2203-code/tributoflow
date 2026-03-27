import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { syncNCM, syncClassTribXLS, syncNBSCorrelation, runFullSync } from '@/integrations/fiscal/TaxSyncService'
import { toast } from 'sonner'

/**
 * Hook to manage tax table sync operations and view sync logs.
 */
export function useTaxSync() {
  const qc = useQueryClient()

  // Fetch sync logs
  const { data: syncLogs, isLoading: logsLoading } = useQuery({
    queryKey: ['tax-sync-logs'],
    queryFn: async () => {
      const { data } = await (supabase.from('tax_sync_logs') as any)
        .select('*')
        .order('executed_at', { ascending: false })
        .limit(20)
      return (data as any[]) || []
    },
  })

  // Full sync mutation
  const fullSyncMutation = useMutation({
    mutationFn: runFullSync,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['tax-sync-logs'] })
      qc.invalidateQueries({ queryKey: ['tax-ncm'] })
      qc.invalidateQueries({ queryKey: ['tax-cclasstrib'] })
      const { succeeded, failed } = result.summary
      if (failed === 0) {
        toast.success(`Sincronização completa! ${succeeded} fontes atualizadas.`)
      } else {
        toast.warning(`Sincronização parcial: ${succeeded} ok, ${failed} com erro.`)
      }
    },
    onError: () => toast.error('Erro ao executar sincronização completa'),
  })

  // Individual sync mutations
  const syncNcmMutation = useMutation({
    mutationFn: syncNCM,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['tax-sync-logs'] })
      qc.invalidateQueries({ queryKey: ['tax-ncm'] })
      if (r.status === 'success') toast.success(`NCM: ${r.updated} registros atualizados`)
      else toast.warning(`NCM: ${r.updated} atualizados, ${r.errors.length} erros`)
    },
    onError: () => toast.error('Erro ao sincronizar NCM'),
  })

  const syncClassTribMutation = useMutation({
    mutationFn: syncClassTribXLS,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['tax-sync-logs'] })
      qc.invalidateQueries({ queryKey: ['tax-cclasstrib'] })
      if (r.status === 'success') toast.success(`cClassTrib: ${r.updated} registros atualizados`)
      else toast.warning(`cClassTrib: ${r.updated} atualizados, ${r.errors.length} erros`)
    },
    onError: () => toast.error('Erro ao sincronizar cClassTrib'),
  })

  const syncNbsMutation = useMutation({
    mutationFn: syncNBSCorrelation,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['tax-sync-logs'] })
      if (r.status === 'success') toast.success(`NBS: ${r.updated} correlações atualizadas`)
      else toast.warning(`NBS: ${r.updated} atualizadas, ${r.errors.length} erros`)
    },
    onError: () => toast.error('Erro ao sincronizar NBS'),
  })

  const isSyncing = fullSyncMutation.isPending
    || syncNcmMutation.isPending
    || syncClassTribMutation.isPending
    || syncNbsMutation.isPending

  return {
    syncLogs,
    logsLoading,
    isSyncing,
    runFullSync: () => fullSyncMutation.mutate(),
    syncNcm: () => syncNcmMutation.mutate(),
    syncClassTrib: () => syncClassTribMutation.mutate(),
    syncNbs: () => syncNbsMutation.mutate(),
    fullSyncResult: fullSyncMutation.data,
  }
}

/**
 * Hook to fetch cClassTrib options in batch via the RPC function.
 */
export function useCClassTribBatch() {
  const batchMutation = useMutation({
    mutationFn: async (items: Array<{ item_id: string; ncm_code: string; is_service?: boolean; nbs_code?: string }>) => {
      const { data, error } = await supabase.rpc('get_cclasstrib_batch', {
        items: items as any,
      })
      if (error) throw error
      return data as Array<{
        itemId: string
        ncmCode: string
        ncmDescription: string
        ncmValid: boolean
        ncmValidationMessage: string | null
        options: Array<{
          cClassTrib: string
          description: string
          cstCode: string
          cstDescription: string
          articleRef: string
          pRedIBS: number | null
          pRedCBS: number | null
          indOp: string
          indicators: Record<string, unknown>
        }>
      }>
    },
    onError: () => toast.error('Erro ao buscar classificações em lote'),
  })

  return {
    fetchBatch: batchMutation.mutate,
    fetchBatchAsync: batchMutation.mutateAsync,
    batchData: batchMutation.data,
    isFetching: batchMutation.isPending,
    error: batchMutation.error,
  }
}
