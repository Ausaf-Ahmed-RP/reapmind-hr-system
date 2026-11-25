import { PDFDocument } from 'pdf-lib';

/**
 * Combines an array of image buffers (JPEG/PNG) into a single PDF document.
 * Returns the PDF as a Node Buffer.
 */
export async function mergeImagesToPdf(imageBuffers: { buffer: Buffer; mimeType: string }[]): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();

  for (const item of imageBuffers) {
    let image;
    if (item.mimeType === 'image/png') {
      image = await pdfDoc.embedPng(item.buffer);
    } else {
      // Default to JPEG
      image = await pdfDoc.embedJpg(item.buffer);
    }

    const { width, height } = image.scale(1);
    // Create page matching image aspect ratio, standard A4 if needed or fitted
    const page = pdfDoc.addPage([width, height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width,
      height,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
