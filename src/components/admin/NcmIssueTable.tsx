import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type NcmIssueType = 'missing_ncm' | 'invalid_ncm' | 'expired_ncm' | 'description_mismatch'

export interface NcmIssue {
  item_id: string
  description: string
  ncm_current: string | null
  issue_type: NcmIssueType
  company_name: string
}

const issueLabels: Record<NcmIssueType, { label: string; variant: 'destructive' | 'warning' | 'secondary' }> = {
  missing_ncm: { label: 'Sem NCM', variant: 'destructive' },
  invalid_ncm: { label: 'NCM Inválido', variant: 'destructive' },
  expired_ncm: { label: 'NCM Vencido', variant: 'warning' },
  description_mismatch: { label: 'Divergência', variant: 'secondary' },
}

interface NcmIssueTableProps {
  issues: NcmIssue[]
  loading?: boolean
  onSelectItem?: (itemId: string) => void
  onSelectIssue?: (issue: NcmIssue) => void
  selectedIssueId?: string | null
}

export function NcmIssueTable({ issues, loading, onSelectItem, onSelectIssue, selectedIssueId }: NcmIssueTableProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse bg-gray-100 rounded-lg" />
        ))}
      </div>
    )
  }

  if (!issues.length) {
    return (
      <div className="text-center py-10 text-gray-400">
        <p className="text-sm">Nenhuma pendência encontrada.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Descrição</th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Empresa</th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">NCM Atual</th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Problema</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {issues.map((issue) => {
            const { label, variant } = issueLabels[issue.issue_type]
            return (
              <tr
                key={issue.item_id}
                className={cn(
                  'hover:bg-gray-50 transition-colors',
                  (onSelectItem || onSelectIssue) && 'cursor-pointer',
                  selectedIssueId === issue.item_id && 'bg-blue-50 border-l-2 border-l-blue-600',
                )}
                onClick={() => {
                  onSelectItem?.(issue.item_id)
                  onSelectIssue?.(issue)
                }}
              >
                <td className="py-3 px-4 text-gray-900 max-w-xs truncate">{issue.description}</td>
                <td className="py-3 px-4 text-gray-600">{issue.company_name}</td>
                <td className="py-3 px-4 text-gray-500 font-mono">{issue.ncm_current || '—'}</td>
                <td className="py-3 px-4">
                  <Badge variant={variant}>{label}</Badge>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
