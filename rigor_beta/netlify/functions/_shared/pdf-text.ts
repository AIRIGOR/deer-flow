export async function readPdfPages(raw: ArrayBuffer): Promise<string[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({ data: new Uint8Array(raw), useSystemFonts: true, disableFontFace: true });
  try {
    const pdf = await loading.promise;
    if (pdf.numPages > 200) throw new Error("PDF exceeds 200-page analysis limit");
    const pages: string[] = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const content = await page.getTextContent();
      // Preserve PDF.js line boundaries for rule-assisted requirement review.
      // Keep blank pages in the array so citations retain physical page numbers.
      pages.push(content.items.map(item => "str" in item
        ? item.str + (item.hasEOL ? "\n" : " ") : "").join("").trim());
      page.cleanup();
    }
    return pages;
  } finally {
    await loading.destroy();
  }
}
