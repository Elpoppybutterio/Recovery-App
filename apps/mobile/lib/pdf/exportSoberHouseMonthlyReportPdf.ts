import type { MonthlyReport } from "../soberHouse/types";

type PrintModule = {
  printToFileAsync(input: {
    html: string;
    width?: number;
    height?: number;
  }): Promise<{ uri: string }>;
};

type SharingModule = {
  isAvailableAsync(): Promise<boolean>;
  shareAsync(
    uri: string,
    options?: {
      UTI?: string;
      mimeType?: string;
      dialogTitle?: string;
    },
  ): Promise<void>;
};

type FileSystemModule = {
  documentDirectory?: string;
  cacheDirectory?: string;
  getInfoAsync(uri: string): Promise<{ exists: boolean }>;
  deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
  moveAsync(input: { from: string; to: string }): Promise<void>;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatIso(value: string | null): string {
  if (!value) {
    return "Not available";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function percentLabel(value: number | null): string {
  return value === null ? "N/A" : `${Math.round(value * 100)}%`;
}

function listMarkup(items: string[]): string {
  return items.length === 0
    ? "<li>None</li>"
    : items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function section(title: string, body: string): string {
  return `<h2>${escapeHtml(title)}</h2><div class="box">${body}</div>`;
}

export function buildSoberHouseMonthlyReportPdfFileName(report: MonthlyReport): string {
  const scope =
    report.summaryPayload.reportKind === "resident_monthly"
      ? report.summaryPayload.resident.residentName
      : report.summaryPayload.house.houseName;
  return `${scope} - ${report.summaryPayload.reportMonth} - Monthly Report.pdf`;
}

export function buildSoberHouseMonthlyReportPdfHtml(report: MonthlyReport): string {
  const snapshot = report.summaryPayload;
  const workflowMarkup = `
    <p><strong>Status:</strong> ${escapeHtml(report.status)}</p>
    <p><strong>Generated:</strong> ${escapeHtml(formatIso(report.generatedAt))}</p>
    <p><strong>Reviewed:</strong> ${escapeHtml(formatIso(report.reviewedAt))}</p>
    <p><strong>Approved:</strong> ${escapeHtml(formatIso(report.approvedAt))}</p>
    <p><strong>Last exported:</strong> ${escapeHtml(formatIso(report.exportHistory[0]?.exportedAt ?? null))}</p>
    <p><strong>Version:</strong> ${escapeHtml(String(report.versionNumber))}${report.isCurrentVersion ? " (current)" : ""}</p>
  `;

  const body =
    snapshot.reportKind === "resident_monthly"
      ? `
        <h1>${escapeHtml(snapshot.resident.residentName)}</h1>
        <p class="muted">${escapeHtml(snapshot.resident.houseName)} • ${escapeHtml(snapshot.reportMonth)}</p>
        ${section(
          "Identity / Placement",
          `
            <p><strong>Move-in:</strong> ${escapeHtml(snapshot.resident.moveInDate || "Not set")}</p>
            <p><strong>Program phase:</strong> ${escapeHtml(snapshot.resident.programPhaseOnEntry || "Not set")}</p>
          `,
        )}
        ${section(
          "KPI Summary",
          `
            <div class="grid">
              <div class="metric"><strong>Curfew:</strong> ${escapeHtml(percentLabel(snapshot.kpis.curfewComplianceRate.value))}</div>
              <div class="metric"><strong>Chores:</strong> ${escapeHtml(percentLabel(snapshot.kpis.choreCompletionRate.value))}</div>
              <div class="metric"><strong>Meetings:</strong> ${escapeHtml(percentLabel(snapshot.kpis.meetingComplianceRate.value))}</div>
              <div class="metric"><strong>Acknowledgments:</strong> ${escapeHtml(percentLabel(snapshot.kpis.acknowledgmentCompletionRate.value))}</div>
            </div>
          `,
        )}
        ${section(
          "Violations Summary",
          `
            <p>Total: ${snapshot.violationsSummary.totalViolations}</p>
            <p>Open: ${snapshot.violationsSummary.openCount} • Resolved: ${snapshot.violationsSummary.resolvedCount} • Dismissed: ${snapshot.violationsSummary.dismissedCount}</p>
            <ul>${listMarkup(
              snapshot.violationsSummary.notableIncidents.map(
                (incident) =>
                  `${incident.ruleType}: ${incident.reasonSummary} (${formatIso(incident.triggeredAt)})`,
              ),
            )}</ul>
          `,
        )}
        ${section(
          "Corrective Actions",
          `
            <p>Total assigned: ${snapshot.correctiveActionSummary.totalAssigned}</p>
            <p>Open: ${snapshot.correctiveActionSummary.openCount} • Completed: ${snapshot.correctiveActionSummary.completedCount} • Overdue: ${snapshot.correctiveActionSummary.overdueCount}</p>
          `,
        )}
        ${section(
          "Communication Summary",
          `
            <p>Structured messages: ${snapshot.communicationSummary.structuredMessageCount}</p>
            <p>Acknowledgment required: ${snapshot.communicationSummary.acknowledgmentRequiredCount}</p>
            <p>${escapeHtml(snapshot.communicationSummary.acknowledgmentCompletionSummary)}</p>
          `,
        )}
        ${section(
          "Wins / Strengths",
          `<ul>${listMarkup(
            snapshot.winsSummary.map((win) => `${win.label}: ${win.value} — ${win.detail}`),
          )}</ul>`,
        )}
        ${section(
          "Final Manager Summary",
          `
            <p><strong>Monthly summary:</strong> ${escapeHtml(snapshot.notesSection.monthlySummary || "None")}</p>
            <p><strong>Progress summary:</strong> ${escapeHtml(snapshot.notesSection.progressSummary || "None")}</p>
            <p><strong>Concerns / priorities:</strong> ${escapeHtml(snapshot.notesSection.concernsPriorities || "None")}</p>
            <p><strong>Encouragement / strengths:</strong> ${escapeHtml(snapshot.notesSection.encouragementStrengths || "None")}</p>
          `,
        )}
        ${section("Workflow Metadata", workflowMarkup)}
      `
      : `
        <h1>${escapeHtml(snapshot.house.houseName)}</h1>
        <p class="muted">${escapeHtml(snapshot.reportMonth)}</p>
        ${section(
          "House Overview",
          `
            <p><strong>Active residents:</strong> ${snapshot.house.activeResidentCount}</p>
            <p><strong>Staff summary:</strong> ${escapeHtml(snapshot.house.staffSummary.join(", ") || "None")}</p>
          `,
        )}
        ${section(
          "KPI Summary",
          `
            <div class="grid">
              <div class="metric"><strong>Curfew:</strong> ${escapeHtml(percentLabel(snapshot.kpis.curfewComplianceRate.value))}</div>
              <div class="metric"><strong>Chores:</strong> ${escapeHtml(percentLabel(snapshot.kpis.choreCompletionRate.value))}</div>
              <div class="metric"><strong>Meetings:</strong> ${escapeHtml(percentLabel(snapshot.kpis.meetingComplianceRate.value))}</div>
              <div class="metric"><strong>Acknowledgments:</strong> ${escapeHtml(percentLabel(snapshot.kpis.acknowledgmentCompletionRate.value))}</div>
            </div>
          `,
        )}
        ${section(
          "Operations Summary",
          `
            <p>Residents in good standing: ${snapshot.operationsSummary.residentsInGoodStandingCount}</p>
            <p>Residents with unresolved issues: ${snapshot.operationsSummary.residentsWithUnresolvedIssuesCount}</p>
            <p>Residents with repeated violations: ${snapshot.operationsSummary.residentsWithRepeatedViolationsCount}</p>
          `,
        )}
        ${section(
          "Wins Summary",
          `<ul>${listMarkup(
            snapshot.winsSummary.map((win) => `${win.label}: ${win.value} — ${win.detail}`),
          )}</ul>`,
        )}
        ${section(
          "Final Manager Summary",
          `
            <p><strong>Monthly summary:</strong> ${escapeHtml(snapshot.notesSection.monthlySummary || "None")}</p>
            <p><strong>Operational concerns:</strong> ${escapeHtml(snapshot.notesSection.operationalConcerns || "None")}</p>
            <p><strong>Follow-up priorities:</strong> ${escapeHtml(snapshot.notesSection.followUpPriorities || "None")}</p>
          `,
        )}
        ${section("Workflow Metadata", workflowMarkup)}
      `;

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(buildSoberHouseMonthlyReportPdfFileName(report))}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; padding: 24px; }
      h1 { margin: 0 0 8px 0; font-size: 22px; }
      h2 { margin: 20px 0 8px 0; font-size: 16px; }
      p { margin: 4px 0; font-size: 13px; }
      ul { margin: 6px 0 0 0; padding-left: 18px; }
      li { margin-bottom: 4px; font-size: 13px; }
      .box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; margin-top: 8px; }
      .muted { color: #6b7280; font-size: 12px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .metric { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; font-size: 13px; }
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>`;
}

export async function exportSoberHouseMonthlyReportPdf(report: MonthlyReport): Promise<string> {
  const printModule = (await import("expo-print")) as PrintModule;
  const sharingModule = (await import("expo-sharing")) as SharingModule;
  let fileSystemModule: FileSystemModule;
  try {
    fileSystemModule = (await import("expo-file-system/legacy")) as FileSystemModule;
  } catch {
    fileSystemModule = (await import("expo-file-system")) as FileSystemModule;
  }

  const html = buildSoberHouseMonthlyReportPdfHtml(report);
  const printed = await printModule.printToFileAsync({ html, width: 612, height: 792 });

  const outputDirectory = fileSystemModule.documentDirectory ?? fileSystemModule.cacheDirectory;
  if (!outputDirectory) {
    throw new Error("No writable directory available for report PDF export.");
  }

  const fileName = buildSoberHouseMonthlyReportPdfFileName(report);
  const targetUri = `${outputDirectory}${fileName}`;
  const existing = await fileSystemModule.getInfoAsync(targetUri);
  if (existing.exists) {
    await fileSystemModule.deleteAsync(targetUri, { idempotent: true });
  }
  await fileSystemModule.moveAsync({ from: printed.uri, to: targetUri });

  const canShare = await sharingModule.isAvailableAsync();
  if (canShare) {
    await sharingModule.shareAsync(targetUri, {
      UTI: "com.adobe.pdf",
      mimeType: "application/pdf",
      dialogTitle: fileName,
    });
  }

  return targetUri;
}
