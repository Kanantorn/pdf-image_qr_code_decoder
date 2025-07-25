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
