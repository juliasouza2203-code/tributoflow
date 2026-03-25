import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface KpiCardFiscalProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  trend?: { value: number; label: string }
  variant?: 'default' | 'warning' | 'success' | 'danger'
  loading?: boolean
}

export function KpiCardFiscal({
  title, value, subtitle, icon: Icon, trend, variant = 'default', loading
}: KpiCardFiscalProps) {
  const variantStyles = {
    default: 'bg-blue-50 text-blue-600',
    warning: 'bg-yellow-50 text-yellow-600',
    success: 'bg-green-50 text-green-600',
    danger: 'bg-red-50 text-red-600',
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          {loading ? (
            <div className="mt-2 h-7 w-24 animate-pulse bg-gray-200 rounded" />
          ) : (
            <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
          )}
          {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
          {trend && (
            <p className={cn(
              'mt-1 text-xs font-medium',
              trend.value >= 0 ? 'text-green-600' : 'text-red-600'
            )}>
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        <div className={cn('p-2.5 rounded-lg', variantStyles[variant])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}
