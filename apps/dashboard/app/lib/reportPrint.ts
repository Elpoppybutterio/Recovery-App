import type { OperatorReportDocument } from "../../../mobile/lib/soberHouse/reportingExports";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function metricMarkup(document: OperatorReportDocument): string {
  return document.metrics
    .map(
      (metric) => `
        <div class="metric">
          <div class="metric-label">${escapeHtml(metric.label)}</div>
          <div class="metric-value">${escapeHtml(metric.value)}</div>
          <div class="metric-detail">${escapeHtml(metric.detail)}</div>
        </div>
      `,
    )
    .join("");
}

function sectionMarkup(document: OperatorReportDocument): string {
  return document.sections
    .map((section) => {
      if (section.kind === "table") {
        const header = section.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
        const rows =
          section.rows.length === 0
            ? `<tr><td colspan="${section.columns.length}">${escapeHtml(section.emptyState)}</td></tr>`
            : section.rows
                .map(
                  (row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`,
                )
                .join("");
        return `
          <h2>${escapeHtml(section.title)}</h2>
          <div class="box">
            <table>
              <thead><tr>${header}</tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        `;
      }
      if (section.kind === "trend") {
        const items =
          section.points.length === 0
            ? `<li>${escapeHtml(section.emptyState)}</li>`
            : section.points
                .map(
                  (point) =>
                    `<li>${escapeHtml(point.label)}: ${escapeHtml(String(point.count))}</li>`,
                )
                .join("");
        return `
          <h2>${escapeHtml(section.title)}</h2>
          <div class="box"><ul>${items}</ul></div>
        `;
      }
      const items =
        section.items.length === 0
          ? `<li>${escapeHtml(section.emptyState)}</li>`
          : section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
      return `
        <h2>${escapeHtml(section.title)}</h2>
        <div class="box"><ul>${items}</ul></div>
      `;
    })
    .join("");
}

export function buildPrintableOperatorReportHtml(document: OperatorReportDocument): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(document.title)}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; padding: 24px; }
      h1 { margin: 0 0 6px 0; font-size: 22px; }
      h2 { margin: 22px 0 8px 0; font-size: 16px; }
      p { margin: 4px 0; font-size: 13px; }
      ul { margin: 0; padding-left: 18px; }
      li { margin-bottom: 4px; font-size: 13px; }
      .meta { color: #6b7280; font-size: 12px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px; }
      .metric { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px; }
      .metric-label { color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
      .metric-value { margin-top: 4px; font-size: 20px; font-weight: 700; }
      .metric-detail { margin-top: 6px; color: #6b7280; font-size: 12px; line-height: 1.4; }
      .box { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; margin-top: 8px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border-bottom: 1px solid #e5e7eb; padding: 8px; text-align: left; font-size: 12px; vertical-align: top; }
      th { background: #f8fafc; font-weight: 700; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(document.title)}</h1>
    <p class="meta">${escapeHtml(document.scopeLabel)}</p>
    <p class="meta">Reporting period ${escapeHtml(document.periodStart)} to ${escapeHtml(document.periodEnd)}</p>
    <p class="meta">Generated ${escapeHtml(document.generatedAt)}</p>
    <div class="grid">${metricMarkup(document)}</div>
    ${sectionMarkup(document)}
  </body>
</html>`;
}
