process.once("message", async (input: { contentBase64: string; mimeType: string }) => {
try {
  const bytes = Buffer.from(input.contentBase64,"base64");
  let text: string;
  if (input.mimeType === "application/pdf") {
    if (!bytes.subarray(0,5).equals(Buffer.from("%PDF-"))) throw new Error("Invalid PDF");
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: bytes, isEvalSupported: false });
    try { text = (await parser.getText({ first: 20 })).text; }
    finally { await parser.destroy(); }
  } else if (input.mimeType === "text/plain") {
    text = new TextDecoder("utf-8",{ fatal: true }).decode(bytes);
  } else {
    if (bytes.readUInt32LE(0) !== 0x04034b50) throw new Error("Invalid DOCX");
    const { default: mammoth } = await import("mammoth");
    text = (await mammoth.extractRawText({ buffer: bytes })).value;
  }
  if (input.mimeType === "text/plain" && text.includes("\u0000")) throw new Error("Unreadable document");
  text = text.replaceAll("\u0000", "");
  if (!text.trim() || text.length > 200_000) throw new Error("Unreadable document");
  process.send?.({ text });
} catch (error) {
  const detail = error instanceof Error ? { errorName: error.name, errorMessage: error.message } : {};
  process.send?.({ error: true, ...detail });
}

finally { process.disconnect(); }
});
