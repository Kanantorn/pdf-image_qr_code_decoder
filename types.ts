export interface DecodedQR {
  data: string;
  page: number; // For PDFs, for images this will be 1
}

export interface DecodedFileResult {
  fileName: string;
  status: 'success' | 'no_qr_found' | 'error';
  qrs: DecodedQR[];
  error?: string;
}
