import fs from 'fs';
import path from 'path';
import { uploadToS3 } from '../../config/s3';
import { logger } from '../../utils/logger';

interface ReceiptTemplateData {
  receiptNumber: string;
  paymentNumber: string;
  clientName: string;
  clientAddress?: string | null;
  amount: string;
  amountInWords: string;
  particulars: string;
  paymentMethod: string;
  reference?: string | null;
  issuedAt: Date;
  allocations: Array<{
    policyNumber?: string | null;
    invoiceNumber?: string | null;
    amount: string;
  }>;
}

interface PaymentAcknowledgementTemplateData {
  acknowledgementNumber: string;
  policyNumber: string;
  clientName: string;
  insurerName: string;
  amount: string;
  paymentMethod: string;
  insurerReference: string;
  paymentDate: Date;
  issuedAt: Date;
  notes?: string | null;
}

function escapeHtml(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildReceiptHtml(data: ReceiptTemplateData): string {
  const rows = data.allocations.map((allocation) => `
    <tr>
      <td>${escapeHtml(allocation.policyNumber ?? allocation.invoiceNumber ?? 'Unallocated')}</td>
      <td class="amount">${escapeHtml(allocation.amount)}</td>
    </tr>
  `).join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(data.receiptNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 34px; color: #172331; font-family: Arial, Helvetica, sans-serif; }
    .shell { border: 1px solid #d8e0e5; border-radius: 18px; overflow: hidden; }
    .header { background: #0f3f3c; color: #ffffff; padding: 28px 32px; display: flex; justify-content: space-between; }
    .brand { font-size: 26px; font-weight: 800; letter-spacing: .4px; }
    .muted { color: #6b7280; }
    .white-muted { color: #d8f1ee; }
    .section { padding: 26px 32px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
    .label { font-size: 11px; text-transform: uppercase; color: #718096; font-weight: 700; margin-bottom: 6px; }
    .value { font-size: 14px; font-weight: 700; }
    .amount-box { background: #f1fbf9; border: 1px solid #bde5dd; border-radius: 14px; padding: 18px; text-align: right; }
    .amount-main { font-size: 30px; color: #0f766e; font-weight: 800; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th { text-align: left; background: #f8fafc; color: #475569; font-size: 12px; padding: 12px; border-bottom: 1px solid #e5e7eb; }
    td { padding: 12px; border-bottom: 1px solid #eef2f7; font-size: 13px; }
    .amount { text-align: right; font-weight: 700; }
    .footer { border-top: 1px solid #eef2f7; padding: 18px 32px; font-size: 11px; color: #64748b; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="shell">
    <div class="header">
      <div>
        <div class="brand">Lako Agency</div>
        <div class="white-muted">Insurance brokerage receipt</div>
      </div>
      <div style="text-align:right">
        <div class="white-muted">Receipt No.</div>
        <div style="font-size:22px;font-weight:800">${escapeHtml(data.receiptNumber)}</div>
      </div>
    </div>
    <div class="section grid">
      <div>
        <div class="label">Received From</div>
        <div class="value">${escapeHtml(data.clientName)}</div>
        <div class="muted">${escapeHtml(data.clientAddress)}</div>
      </div>
      <div class="amount-box">
        <div class="label">Amount Received</div>
        <div class="amount-main">${escapeHtml(data.amount)}</div>
        <div class="muted">${escapeHtml(data.amountInWords)}</div>
      </div>
    </div>
    <div class="section">
      <div class="grid">
        <div>
          <div class="label">Payment</div>
          <div class="value">${escapeHtml(data.paymentNumber)} / ${escapeHtml(data.paymentMethod)}</div>
        </div>
        <div>
          <div class="label">Reference</div>
          <div class="value">${escapeHtml(data.reference ?? '-')}</div>
        </div>
      </div>
      <table>
        <thead><tr><th>Particulars</th><th class="amount">Amount</th></tr></thead>
        <tbody>${rows || `<tr><td>${escapeHtml(data.particulars)}</td><td class="amount">${escapeHtml(data.amount)}</td></tr>`}</tbody>
      </table>
    </div>
    <div class="footer">
      <span>Issued ${escapeHtml(data.issuedAt.toLocaleString('en-KE'))}</span>
      <span>Premium collections are held for insurer remittance; broker revenue is commission only.</span>
    </div>
  </div>
</body>
</html>`;
}

async function renderPdf(html: string): Promise<{ buffer: Buffer; mimeType: string }> {
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier);') as (specifier: string) => Promise<any>;
    const puppeteer = await dynamicImport('puppeteer');
    const browser = await puppeteer.default.launch({ headless: 'new' });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '16mm', right: '12mm', bottom: '16mm', left: '12mm' } });
      return { buffer: Buffer.from(pdf), mimeType: 'application/pdf' };
    } finally {
      await browser.close();
    }
  } catch (error) {
    logger.warn('Receipt PDF rendering fell back to HTML artifact', { error: (error as Error).message });
    return { buffer: Buffer.from(html, 'utf8'), mimeType: 'text/html' };
  }
}

function buildPaymentAcknowledgementHtml(data: PaymentAcknowledgementTemplateData): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(data.acknowledgementNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 34px; color: #172331; font-family: Arial, Helvetica, sans-serif; }
    .shell { border: 1px solid #d8e0e5; border-radius: 18px; overflow: hidden; }
    .header { background: #0f3f3c; color: #ffffff; padding: 28px 32px; display: flex; justify-content: space-between; }
    .brand { font-size: 26px; font-weight: 800; letter-spacing: .4px; }
    .white-muted { color: #d8f1ee; }
    .section { padding: 26px 32px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
    .label { font-size: 11px; text-transform: uppercase; color: #718096; font-weight: 700; margin-bottom: 6px; }
    .value { font-size: 14px; font-weight: 700; }
    .notice { background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; border-radius: 14px; padding: 18px; font-weight: 700; line-height: 1.5; }
    .amount-main { font-size: 30px; color: #0f766e; font-weight: 800; }
    .footer { border-top: 1px solid #eef2f7; padding: 18px 32px; font-size: 11px; color: #64748b; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="shell">
    <div class="header">
      <div>
        <div class="brand">Lako Agency</div>
        <div class="white-muted">Payment Acknowledgement</div>
      </div>
      <div style="text-align:right">
        <div class="white-muted">Acknowledgement No.</div>
        <div style="font-size:22px;font-weight:800">${escapeHtml(data.acknowledgementNumber)}</div>
      </div>
    </div>
    <div class="section">
      <div class="notice">Premium was paid directly to the insurer. This is not a cash receipt from Lako Agency.</div>
    </div>
    <div class="section grid">
      <div>
        <div class="label">Client</div>
        <div class="value">${escapeHtml(data.clientName)}</div>
      </div>
      <div>
        <div class="label">Insurer</div>
        <div class="value">${escapeHtml(data.insurerName)}</div>
      </div>
      <div>
        <div class="label">Policy</div>
        <div class="value">${escapeHtml(data.policyNumber)}</div>
      </div>
      <div>
        <div class="label">Amount Paid to Insurer</div>
        <div class="amount-main">${escapeHtml(data.amount)}</div>
      </div>
      <div>
        <div class="label">Payment Method</div>
        <div class="value">${escapeHtml(data.paymentMethod)}</div>
      </div>
      <div>
        <div class="label">Insurer Reference</div>
        <div class="value">${escapeHtml(data.insurerReference)}</div>
      </div>
      <div>
        <div class="label">Payment Date</div>
        <div class="value">${escapeHtml(data.paymentDate.toLocaleDateString('en-KE'))}</div>
      </div>
      <div>
        <div class="label">Notes</div>
        <div class="value">${escapeHtml(data.notes ?? '-')}</div>
      </div>
    </div>
    <div class="footer">
      <span>Issued ${escapeHtml(data.issuedAt.toLocaleString('en-KE'))}</span>
      <span>Broker revenue is commission only.</span>
    </div>
  </div>
</body>
</html>`;
}

export async function generateReceiptArtifact(data: ReceiptTemplateData): Promise<{
  fileUrl: string;
  fileSize: number;
  mimeType: string;
}> {
  const html = buildReceiptHtml(data);
  const rendered = await renderPdf(html);
  const extension = rendered.mimeType === 'application/pdf' ? 'pdf' : 'html';
  const fileName = `${data.receiptNumber}.${extension}`;
  const s3Key = `documents/receipts/${new Date().getFullYear()}/${fileName}`;
  const s3Url = await uploadToS3(s3Key, rendered.buffer, rendered.mimeType, {
    receiptNumber: data.receiptNumber,
    paymentNumber: data.paymentNumber,
  });

  if (s3Url) {
    return { fileUrl: s3Url, fileSize: rendered.buffer.length, mimeType: rendered.mimeType };
  }

  const outputDir = path.resolve(process.cwd(), 'storage', 'receipts');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, fileName);
  fs.writeFileSync(outputPath, rendered.buffer);

  return { fileUrl: outputPath, fileSize: rendered.buffer.length, mimeType: rendered.mimeType };
}

export async function generatePaymentAcknowledgementArtifact(data: PaymentAcknowledgementTemplateData): Promise<{
  fileUrl: string;
  fileSize: number;
  mimeType: string;
}> {
  const html = buildPaymentAcknowledgementHtml(data);
  const rendered = await renderPdf(html);
  const extension = rendered.mimeType === 'application/pdf' ? 'pdf' : 'html';
  const fileName = `${data.acknowledgementNumber}.${extension}`;
  const s3Key = `documents/payment-acknowledgements/${new Date().getFullYear()}/${fileName}`;
  const s3Url = await uploadToS3(s3Key, rendered.buffer, rendered.mimeType, {
    acknowledgementNumber: data.acknowledgementNumber,
    policyNumber: data.policyNumber,
  });

  if (s3Url) {
    return { fileUrl: s3Url, fileSize: rendered.buffer.length, mimeType: rendered.mimeType };
  }

  const outputDir = path.resolve(process.cwd(), 'storage', 'payment-acknowledgements');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, fileName);
  fs.writeFileSync(outputPath, rendered.buffer);

  return { fileUrl: outputPath, fileSize: rendered.buffer.length, mimeType: rendered.mimeType };
}
