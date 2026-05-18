import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface ReportData {
  applicantName: string;
  programCode: string;
  programName: string;
  generatedAt: string;
  credited: { code: string; title: string; units: number; matchedFrom: string; confidence: number }[];
  notCredited: { code: string; title: string; reason: string }[];
  remaining: { code: string; title: string; units: number }[];
  forecast: { semestersMin: number; semestersMax: number };
  evaluatorRemarks?: string | null;
  evaluatorName?: string | null;
}

export function buildReportPDF(d: ReportData): Blob {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const w = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(122, 30, 43); // CIT-U Maroon
  doc.rect(0, 0, w, 80, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text("ACREDIA — Credit Evaluation Report", 40, 40);
  doc.setFontSize(11);
  doc.setTextColor(212, 167, 71);
  doc.text("Cebu Institute of Technology — University", 40, 60);

  doc.setTextColor(30, 30, 30);
  doc.setFontSize(11);
  let y = 110;
  doc.text(`Applicant: ${d.applicantName}`, 40, y); y += 16;
  doc.text(`Target program: ${d.programCode} — ${d.programName}`, 40, y); y += 16;
  doc.text(`Generated: ${d.generatedAt}`, 40, y); y += 24;

  const creditedUnits = d.credited.reduce((s, c) => s + c.units, 0);
  const remainingUnits = d.remaining.reduce((s, c) => s + c.units, 0);

  doc.setFontSize(13);
  doc.text("Credited Subjects", 40, y); y += 6;
  autoTable(doc, {
    startY: y + 4,
    head: [["Code", "Title", "Units", "Matched from TOR", "Confidence"]],
    body: d.credited.map((c) => [c.code, c.title, c.units, c.matchedFrom, `${c.confidence.toFixed(0)}%`]),
    headStyles: { fillColor: [122, 30, 43] },
    styles: { fontSize: 9 },
  });
  // @ts-expect-error autotable types
  y = doc.lastAutoTable.finalY + 18;

  doc.text("Not Credited / Rejected", 40, y); y += 6;
  autoTable(doc, {
    startY: y + 4,
    head: [["Code", "Title", "Reason"]],
    body: d.notCredited.map((c) => [c.code, c.title, c.reason]),
    headStyles: { fillColor: [122, 30, 43] },
    styles: { fontSize: 9 },
  });
  // @ts-expect-error
  y = doc.lastAutoTable.finalY + 18;

  if (y > 600) { doc.addPage(); y = 50; }
  doc.text("Remaining Subjects to Complete", 40, y); y += 6;
  autoTable(doc, {
    startY: y + 4,
    head: [["Code", "Title", "Units"]],
    body: d.remaining.map((c) => [c.code, c.title, c.units]),
    headStyles: { fillColor: [122, 30, 43] },
    styles: { fontSize: 9 },
  });
  // @ts-expect-error
  y = doc.lastAutoTable.finalY + 18;

  if (y > 650) { doc.addPage(); y = 50; }
  doc.setFontSize(12);
  doc.text("Summary", 40, y); y += 16;
  doc.setFontSize(10);
  doc.text(`Total credited units: ${creditedUnits}`, 40, y); y += 14;
  doc.text(`Remaining units: ${remainingUnits}`, 40, y); y += 14;
  doc.text(
    `Estimated completion: ${d.forecast.semestersMin}${d.forecast.semestersMax !== d.forecast.semestersMin ? `–${d.forecast.semestersMax}` : ""} semester(s)`,
    40,
    y,
  );
  y += 24;

  if (d.evaluatorRemarks) {
    doc.setFontSize(12);
    doc.text("Evaluator Remarks", 40, y); y += 14;
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(d.evaluatorRemarks, w - 80);
    doc.text(lines, 40, y);
    y += lines.length * 12 + 10;
  }

  if (y > 680) { doc.addPage(); y = 50; }
  y += 30;
  doc.line(40, y, 240, y);
  doc.setFontSize(9);
  doc.text(d.evaluatorName ?? "Evaluator (signature)", 40, y + 14);

  return doc.output("blob");
}
