import { PDFDocument } from 'pdf-lib';

/**
 * Combines an array of image buffers (JPEG/PNG) into a single PDF document.
 * Returns the PDF as a Node Buffer.
 */
export async function mergeImagesToPdf(imageBuffers: { buffer: Buffer; mimeType: string }[]): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();

  for (const item of imageBuffers) {
    let image;
    const buf = item.buffer;
    if (!buf || buf.length < 4) continue;

    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8;

    try {
      if (isPng) {
        image = await pdfDoc.embedPng(buf);
      } else if (isJpg) {
        image = await pdfDoc.embedJpg(buf);
      } else if (item.mimeType === 'image/png') {
        image = await pdfDoc.embedPng(buf);
      } else {
        // Fallback attempt
        try {
          image = await pdfDoc.embedJpg(buf);
        } catch {
          image = await pdfDoc.embedPng(buf);
        }
      }
    } catch (embedError) {
      console.warn('Skipping invalid image in PDF merge:', embedError);
      continue;
    }

    if (image) {
      const { width, height } = image.scale(1);
      const page = pdfDoc.addPage([width, height]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width,
        height,
      });
    }
  }

  // Ensure at least one page exists if all failed
  if (pdfDoc.getPageCount() === 0) {
    pdfDoc.addPage([595, 842]); // Empty A4 page
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
