import jsPDF from 'jspdf'

interface ClassificationRow {
  itemDescription: string
  companyName: string
  ncmUsed: string
  cstCode: string
  cclasstribCode: string
  justification: string
  responsavel: string
  data: string
  status: string
}

interface ReportConfig {
  officeName: string
  generatedBy: string
  filterCompany?: string
  classifications: ClassificationRow[]
}

export function generateClassificationReportPDF(config: ReportConfig) {
  const doc = new jsPDF({ orientation: 'landscape' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 14
  let y = margin

  // --- Header ---
  doc.setFillColor(37, 99, 235) // blue-600
  doc.rect(0, 0, pageWidth, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('TributoFlow', margin, 13)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Laudo de Classificação Fiscal — IBS/CBS (LC 214/2025)', margin, 21)
  doc.setFontSize(8)
  doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, pageWidth - margin, 13, { align: 'right' })
  doc.text(`Por: ${config.generatedBy}`, pageWidth - margin, 21, { align: 'right' })

  y = 36

  // --- Office info ---
  doc.setTextColor(55, 65, 81) // gray-700
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(`Escritório: ${config.officeName}`, margin, y)
  y += 5
  if (config.filterCompany && config.filterCompany !== 'Todas') {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`Empresa filtrada: ${config.filterCompany}`, margin, y)
    y += 5
  }
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Total de classificações: ${config.classifications.length}`, margin, y)
  y += 8

  // --- Separator ---
  doc.setDrawColor(229, 231, 235) // gray-200
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageWidth - margin, y)
  y += 6

  // --- Table header ---
  const colWidths = [70, 35, 28, 22, 25, 55, 25, 18]
  // columns: Item, Empresa, NCM, CST, cClassTrib, Justificativa, Responsável, Status
  const headers = ['Item', 'Empresa', 'NCM', 'CST', 'cClassTrib', 'Justificativa', 'Responsável', 'Status']

  function drawTableHeader(yPos: number) {
    doc.setFillColor(249, 250, 251) // gray-50
    doc.rect(margin, yPos - 4, pageWidth - margin * 2, 7, 'F')
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(107, 114, 128) // gray-500
    let x = margin + 2
    headers.forEach((h, i) => {
      doc.text(h.toUpperCase(), x, yPos)
      x += colWidths[i]
    })
    return yPos + 7
  }

  y = drawTableHeader(y)

  // --- Table rows ---
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)

  for (const row of config.classifications) {
    if (y > pageHeight - 20) {
      // Footer on current page
      doc.setFontSize(7)
      doc.setTextColor(156, 163, 175)
      doc.text(`TributoFlow — Laudo de Classificação Fiscal`, margin, pageHeight - 8)
      doc.text(`Página ${doc.getNumberOfPages()}`, pageWidth - margin, pageHeight - 8, { align: 'right' })

      doc.addPage()
      y = margin
      y = drawTableHeader(y)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
    }

    doc.setTextColor(17, 24, 39) // gray-900
    let x = margin + 2

    // Truncate long strings
    const truncate = (s: string, max: number) => s.length > max ? s.substring(0, max - 2) + '..' : s

    const values = [
      truncate(row.itemDescription, 45),
      truncate(row.companyName, 22),
      row.ncmUsed || '—',
      row.cstCode || '—',
      row.cclasstribCode || '—',
      truncate(row.justification || '—', 35),
      truncate(row.responsavel, 16),
      row.status === 'approved' ? 'Aprovado' : row.status,
    ]

    values.forEach((val, i) => {
      doc.text(val, x, y)
      x += colWidths[i]
    })

    // Row separator
    y += 1
    doc.setDrawColor(243, 244, 246) // gray-100
    doc.setLineWidth(0.2)
    doc.line(margin, y, pageWidth - margin, y)
    y += 5
  }

  // --- Footer on last page ---
  y += 10
  if (y > pageHeight - 40) {
    doc.addPage()
    y = margin
  }

  doc.setDrawColor(229, 231, 235)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageWidth - margin, y)
  y += 8

  doc.setFontSize(8)
  doc.setTextColor(107, 114, 128)
  doc.setFont('helvetica', 'bold')
  doc.text('Metodologia', margin, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  const methodology = [
    'Este laudo foi gerado automaticamente pelo TributoFlow com base nas classificações realizadas pelo escritório contábil.',
    'As classificações seguem os códigos CST e cClassTrib definidos pela LC 214/2025 (Reforma Tributária — IBS/CBS).',
    'Cada classificação possui justificativa textual registrada pelo responsável, constituindo trilha de auditoria.',
    'As alíquotas de redução aplicadas correspondem aos percentuais definidos nos anexos da LC 214/2025.',
  ]
  for (const line of methodology) {
    doc.text(`• ${line}`, margin + 2, y)
    y += 4
  }

  y += 6
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('Disclaimer', margin, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text('Este documento tem caráter informativo e de apoio à decisão. Não substitui parecer jurídico ou consulta formal à Receita Federal.', margin + 2, y)

  // Page numbers on all pages
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(156, 163, 175)
    doc.text(`TributoFlow — Laudo de Classificação Fiscal`, margin, pageHeight - 8)
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: 'right' })
  }

  // Save
  const dateStr = new Date().toISOString().split('T')[0]
  doc.save(`laudo-classificacao-${dateStr}.pdf`)
}
