export interface DecodedQR {
  data: string;
  page: number; // For PDFs, for images this will be 1
}

export interface DecodedFileResult {
  fileName: string;
  status: 'success' | 'no_qr_found' | 'error';
  qrs: DecodedQR[];
  error?: string;
  pageNumber?: number; // For PDF page identification
  parentFileName?: string; // For PDF pages, reference to parent file
  processingTime?: number; // Time taken to process this file/page
  strategy?: string; // Processing strategy used
}

export interface QRGenerationData {
  type: 'text' | 'url' | 'email' | 'phone' | 'wifi';
  content: string;
  displayName?: string;
}

export interface WiFiCredentials {
  ssid: string;
  password: string;
  security: 'WPA' | 'WEP' | 'nopass';
  hidden: boolean;
}

export interface GeneratedQR {
  id: string;
  type: 'text' | 'url' | 'email' | 'phone' | 'wifi';
  data: string;
  displayName: string;
  qrDataUrl: string;
  createdAt: Date;
}
