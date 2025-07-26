import QRCode from 'qrcode';
import { QRGenerationData, WiFiCredentials, GeneratedQR } from '../types';

interface QRSettings {
  foregroundColor?: string;
  backgroundColor?: string;
  size?: number;
  margin?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

// Cache for QR generation to improve performance
const qrCodeCache = new Map<string, string>();

export const generateQRCode = async (data: QRGenerationData, settings?: QRSettings): Promise<string> => {
  let qrData = '';
  
  switch (data.type) {
    case 'text':
      qrData = data.content;
      break;
    case 'url':
      // Ensure URL has protocol
      qrData = data.content.startsWith('http://') || data.content.startsWith('https://') 
        ? data.content 
        : `https://${data.content}`;
      break;
    case 'email':
      qrData = `mailto:${data.content}`;
      break;
    case 'phone':
      qrData = `tel:${data.content}`;
      break;
    case 'wifi':
      try {
        const wifi: WiFiCredentials = JSON.parse(data.content);
        qrData = `WIFI:T:${wifi.security};S:${wifi.ssid};P:${wifi.password};H:${wifi.hidden ? 'true' : 'false'};;`;
      } catch (e) {
        throw new Error('Invalid WiFi credentials format');
      }
      break;
    default:
      throw new Error('Unsupported QR code type');
  }

  // Create cache key for identical QR codes
  const settingsStr = JSON.stringify(settings);
  const cacheKey = `${qrData}-${settingsStr}`;
  
  if (qrCodeCache.has(cacheKey)) {
    return qrCodeCache.get(cacheKey)!;
  }

  try {
    const qrDataUrl = await QRCode.toDataURL(qrData, {
      width: settings?.size || 256,
      margin: settings?.margin || 2,
      color: {
        dark: settings?.foregroundColor || '#000000',
        light: settings?.backgroundColor || '#FFFFFF'
      },
      errorCorrectionLevel: settings?.errorCorrectionLevel || 'M'
    });
    
    // Cache the result
    qrCodeCache.set(cacheKey, qrDataUrl);
    
    // Limit cache size to prevent memory leaks
    if (qrCodeCache.size > 100) {
      const firstKey = qrCodeCache.keys().next().value;
      qrCodeCache.delete(firstKey);
    }
    
    return qrDataUrl;
  } catch (error) {
    throw new Error(`Failed to generate QR code: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Enhanced QR generation with settings - unified function
export const generateQRCodeWithSettings = async (data: QRGenerationData, settings: QRSettings): Promise<string> => {
  return generateQRCode(data, settings);
};

export const createGeneratedQR = async (data: QRGenerationData, settings?: QRSettings): Promise<GeneratedQR> => {
  const qrDataUrl = await generateQRCode(data, settings);
  
  return {
    id: crypto.randomUUID(),
    type: data.type,
    data: data.content,
    displayName: data.displayName || getDefaultDisplayName(data),
    qrDataUrl,
    createdAt: new Date()
  };
};

const getDefaultDisplayName = (data: QRGenerationData): string => {
  switch (data.type) {
    case 'text':
      return data.content.length > 30 ? `${data.content.substring(0, 30)}...` : data.content;
    case 'url':
      try {
        const url = new URL(data.content.startsWith('http') ? data.content : `https://${data.content}`);
        return url.hostname;
      } catch {
        return data.content;
      }
    case 'email':
      return data.content;
    case 'phone':
      return data.content;
    case 'wifi':
      try {
        const wifi: WiFiCredentials = JSON.parse(data.content);
        return `WiFi: ${wifi.ssid}`;
      } catch {
        return 'WiFi Network';
      }
    default:
      return 'QR Code';
  }
};

export const downloadQRCode = (generatedQR: GeneratedQR): void => {
  const link = document.createElement('a');
  link.href = generatedQR.qrDataUrl;
  link.download = `qr-${generatedQR.type}-${generatedQR.id}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const exportGeneratedQRsToCSV = (qrs: GeneratedQR[]): void => {
  const headers = ['Type', 'Display Name', 'Data', 'Created At'];
  const rows = qrs.map(qr => [
    qr.type,
    `"${qr.displayName.replace(/"/g, '""')}"`,
    `"${qr.data.replace(/"/g, '""')}"`,
    qr.createdAt.toISOString()
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `generated-qr-codes-${new Date().toISOString()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up URL to prevent memory leaks
  URL.revokeObjectURL(url);
};