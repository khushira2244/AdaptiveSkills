const mimeTypes = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
} as const;

export type UploadDocument = { filename: string; mimeType: string; contentBase64: string };

export function supportedDocument(file: File) {
  const extension = (Object.keys(mimeTypes) as (keyof typeof mimeTypes)[]).find(item => file.name.toLowerCase().endsWith(item));
  const mimeType = extension ? mimeTypes[extension] : Object.values(mimeTypes).includes(file.type as never) ? file.type : null;
  if (!mimeType) throw new Error("Choose a PDF, DOCX or TXT file.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Choose a file smaller than 2 MB.");
  return mimeType;
}

export function readDocument(file: File, onProgress: (progress: number) => void): Promise<UploadDocument> {
  const mimeType = supportedDocument(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = event => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100));
    reader.onerror = () => reject(new Error("The selected file could not be read."));
    reader.onload = () => {
      const value = String(reader.result || "");
      const contentBase64 = value.slice(value.indexOf(",") + 1);
      onProgress(100);
      resolve({ filename: file.name, mimeType, contentBase64 });
    };
    reader.readAsDataURL(file);
  });
}
