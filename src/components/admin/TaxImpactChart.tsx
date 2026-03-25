import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface TaxDataPoint {
  name: string
  antes: number
  depois: number
}

interface TaxImpactChartProps {
  data: TaxDataPoint[]
  title?: string
}

export function TaxImpactChart({ data, title }: TaxImpactChartProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      {title && <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>}
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
          <Tooltip formatter={(value: unknown) => `${(value as number).toFixed(2)}%`} />
          <Legend />
          <Bar dataKey="antes" name="Carga Atual" fill="#94a3b8" radius={[4, 4, 0, 0]} />
          <Bar dataKey="depois" name="Carga IBS/CBS" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
