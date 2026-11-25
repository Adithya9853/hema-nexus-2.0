import { jsPDF } from 'jspdf';
import { BRAND_ASSETS } from '../../config/assets.ts';
import type {
  MeasurementRecord,
  ReportRecord,
  TestTypeRecord,
  UserProfile,
} from '../../types/hema.ts';
import { formatReferenceRange } from '../../utils/clinicalValidation.ts';

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateClinicalPdfReport(params: {
  report: ReportRecord;
  measurements: MeasurementRecord[];
  profile: UserProfile;
  testCatalog: TestTypeRecord[];
}): Promise<jsPDF> {
  const { report, measurements, profile, testCatalog } = params;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 42;
  let y = 44;

  // Header band
  doc.setFillColor(16, 24, 39);
  doc.rect(0, 0, pageWidth, 88, 'F');

  const logoDataUrl = await loadImageAsDataUrl(BRAND_ASSETS.officialLogo);
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', margin, 18, 48, 48);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('HEMA NEXUS', logoDataUrl ? margin + 62 : margin, 38);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(203, 213, 225);
  doc.text(
    'Your Health. Connected.  |  Diagnostic Summary Report',
    logoDataUrl ? margin + 62 : margin,
    56,
  );

  doc.setTextColor(223, 164, 70);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`REPORT ID: ${report.reportCode}`, pageWidth - margin, 38, {
    align: 'right',
  });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(
    `Generated: ${new Date(report.generatedAt).toLocaleString()}`,
    pageWidth - margin,
    54,
    { align: 'right' },
  );

  y = 112;

  const hasSimulated =
    report.includesSimulatedData ||
    measurements.some(
      (m) => m.isSimulated || m.dataSource === 'simulated_device',
    );

  if (hasSimulated) {
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(217, 119, 6);
    doc.roundedRect(margin, y - 8, pageWidth - margin * 2, 24, 3, 3, 'FD');
    doc.setTextColor(146, 64, 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(
      'SIMULATED TEST DATA NOTICE: This report contains measurements generated in Hema Nexus Simulated Device Mode.',
      margin + 10,
      y + 7,
    );
    y += 30;
  }

  // Report title
  doc.setTextColor(23, 32, 51);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(report.title, margin, y);
  y += 20;

  // Patient & Device Details Grid
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(247, 249, 252);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 82, 4, 4, 'FD');

  doc.setFontSize(8.5);
  doc.setTextColor(113, 128, 150);
  doc.text('PATIENT DETAILS', margin + 14, y + 18);
  doc.text('DEVICE & SOURCE SNAPSHOT', pageWidth / 2 + 10, y + 18);

  doc.setTextColor(23, 32, 51);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(report.patientName, margin + 14, y + 36);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Patient ID / UHID: ${report.patientId}`, margin + 14, y + 51);
  doc.text(
    report.patientRecordId
      ? `Prepared by: ${report.generatedByName || 'Clinic Operator'}  |  Status: ${report.verificationStatus}`
      : `DOB: ${profile.dateOfBirth || 'Not specified'}  |  Account: ${profile.email}`,
    margin + 14,
    y + 66,
  );

  if (report.deviceSnapshot) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(report.deviceSnapshot.deviceName, pageWidth / 2 + 10, y + 36);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(
      `Device ID: ${report.deviceSnapshot.deviceIdentifier}${report.deviceSnapshot.isSimulated ? ' [SIMULATED]' : ''}`,
      pageWidth / 2 + 10,
      y + 51,
    );
    doc.text(
      `Firmware: ${report.deviceSnapshot.firmwareVersion || 'Unreported'}`,
      pageWidth / 2 + 10,
      y + 66,
    );
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Manual Clinical Log / Multi-source', pageWidth / 2 + 10, y + 36);
    doc.text(
      'No paired BLE hardware attached to entries',
      pageWidth / 2 + 10,
      y + 51,
    );
  }

  y += 102;

  // Measurements Table Header
  doc.setFillColor(23, 32, 51);
  doc.rect(margin, y, pageWidth - margin * 2, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('PARAMETER', margin + 10, y + 15);
  doc.text('VALUE', margin + 155, y + 15);
  doc.text('REFERENCE RANGE', margin + 235, y + 15);
  doc.text('STATUS', margin + 375, y + 15);
  doc.text('TIMESTAMP', pageWidth - margin - 10, y + 15, { align: 'right' });

  y += 24;

  const catalogBySlug = new Map(testCatalog.map((t) => [t.slug, t]));

  measurements.forEach((m, index) => {
    if (y > pageHeight - 105) {
      doc.addPage();
      y = 48;
    }

    if (index % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, pageWidth - margin * 2, 28, 'F');
    }

    const meta = catalogBySlug.get(m.testType);
    const refText = meta
      ? formatReferenceRange(
          meta.referenceRangeConfig,
          meta.unit,
          meta.secondaryUnit,
        )
      : '—';

    const valueLabel =
      m.secondaryValue !== null
        ? `${m.measuredValue}/${m.secondaryValue} ${m.unit}`
        : `${m.measuredValue} ${m.unit}`;

    doc.setTextColor(23, 32, 51);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(m.testName, margin + 10, y + 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(
      m.isSimulated || m.dataSource === 'simulated_device' ? 180 : 113,
      m.isSimulated || m.dataSource === 'simulated_device' ? 83 : 128,
      m.isSimulated || m.dataSource === 'simulated_device' ? 9 : 150,
    );
    const sourceLabel =
      m.dataSource === 'simulated_device' || m.isSimulated
        ? 'SIMULATED TEST DATA'
        : m.dataSource === 'ble_device'
          ? 'Device BLE'
          : 'Manual Log';
    doc.text(sourceLabel, margin + 10, y + 24);

    doc.setTextColor(23, 32, 51);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(valueLabel, margin + 155, y + 17);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(refText.slice(0, 28), margin + 235, y + 17);

    const statusUpper = m.status.toUpperCase();
    if (m.status === 'normal') doc.setTextColor(22, 163, 74);
    else if (m.status === 'borderline') doc.setTextColor(217, 119, 6);
    else doc.setTextColor(220, 38, 38);
    doc.setFont('helvetica', 'bold');
    doc.text(statusUpper, margin + 375, y + 17);

    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(
      new Date(m.measuredAt).toLocaleString(),
      pageWidth - margin - 10,
      y + 17,
      { align: 'right' },
    );

    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + 28, pageWidth - margin, y + 28);
    y += 28;
  });

  if (report.summaryNotes) {
    y += 18;
    if (y > pageHeight - 100) {
      doc.addPage();
      y = 48;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(23, 32, 51);
    doc.text('Clinical / Testing Notes', margin, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    const wrapped = doc.splitTextToSize(
      report.summaryNotes,
      pageWidth - margin * 2,
    );
    doc.text(wrapped, margin, y);
  }

  // Footer disclaimer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(113, 128, 150);
  doc.text(
    hasSimulated
      ? 'Disclaimer: This Hema Nexus report contains SIMULATED test data generated for software & workflow validation prior to physical hardware deployment. Not for clinical diagnosis.'
      : 'Disclaimer: This Hema Nexus report compiles recorded personal health measurements and reference intervals for informational review. It does not constitute an independent medical diagnosis.',
    margin,
    pageHeight - 34,
    { maxWidth: pageWidth - margin * 2 },
  );

  return doc;
}
