declare interface PDFDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PDFPageProxy>;
}

declare interface PDFPageProxy {
  getTextContent(): Promise<TextContent>;
}

declare interface TextContent {
  items: TextItem[];
}

declare interface TextItem {
  str: string;
}

declare interface PDFDocumentLoadingTask {
  promise: Promise<PDFDocumentProxy>;
}

declare const pdfjsLib: {
  getDocument(params: { data: ArrayBuffer } | ArrayBuffer): PDFDocumentLoadingTask;
};

declare interface JSZipObject {
  dir: boolean;
  async(type: 'blob'): Promise<Blob>;
  async(type: 'text' | 'string'): Promise<string>;
  async(type: 'arraybuffer'): Promise<ArrayBuffer>;
}

declare interface JSZipInstance {
  files: { [key: string]: JSZipObject };
  file(path: string): JSZipObject | null;
}

declare const JSZip: {
  new(): { loadAsync(data: ArrayBuffer): Promise<JSZipInstance> };
  loadAsync(data: ArrayBuffer): Promise<JSZipInstance>;
};

declare interface Window {
  pdfjsLib: typeof pdfjsLib;
  JSZip: typeof JSZip;
}
