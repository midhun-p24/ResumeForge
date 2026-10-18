import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root = resolve('private/smoke');
for (const folder of await readdir(root)) {
  const path = join(root, folder, 'resume.pdf');
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch {
    continue;
  }
  const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  const pdf = await loading.promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1.5 });
  const factory = pdf.canvasFactory as {
    create(
      width: number,
      height: number,
    ): {
      canvas: HTMLCanvasElement & { toBuffer(mime: string): Buffer };
      context: CanvasRenderingContext2D;
    };
  };
  const canvas = factory.create(viewport.width, viewport.height);
  await page.render({ canvasContext: canvas.context, canvas: canvas.canvas, viewport }).promise;
  const png = canvas.canvas.toBuffer('image/png');
  const output = join(root, folder, 'preview.png');
  await writeFile(output, png);
  console.log(output);
  await loading.destroy();
}
