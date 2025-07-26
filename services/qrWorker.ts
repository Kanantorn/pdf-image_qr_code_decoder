import { DecodedQR, DecodedFileResult } from '../types';
import jsQR from 'jsqr';

const MAX_SCANNING_DIMENSION = 4096;
const ADAPTIVE_SCALING_THRESHOLD = 2048;
const IS_DEVELOPMENT = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';

// Simplified but effective binarization
const binarizeImageData = (imageData: ImageData, threshold: number): ImageData => {
  const { data, width, height } = imageData;
  const output = new Uint8ClampedArray(data);
  
  for (let i = 0; i < data.length; i += 4) {
    const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const value = luminance < threshold ? 0 : 255;
    output[i] = output[i + 1] = output[i + 2] = value;
    output[i + 3] = data[i + 3];
  }
  
  return new ImageData(output, width, height);
};

// Effective scan and clear loop
const scanAndClearLoop = (context: OffscreenCanvasRenderingContext2D, width: number, height: number): string[] => {
  const foundCodes: string[] = [];
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const imageData = context.getImageData(0, 0, width, height);
    const code = jsQR(imageData.data, width, height, {
      inversionAttempts: 'dontInvert'
    });

    if (code) {
      foundCodes.push(code.data);
      
      // Clear the detected QR code area to find additional codes
      const loc = code.location;
      context.beginPath();
      context.moveTo(loc.topLeftCorner.x, loc.topLeftCorner.y);
      context.lineTo(loc.topRightCorner.x, loc.topRightCorner.y);
      context.lineTo(loc.bottomRightCorner.x, loc.bottomRightCorner.y);
      context.lineTo(loc.bottomLeftCorner.x, loc.bottomLeftCorner.y);
      context.closePath();
      context.fillStyle = 'white';
      context.fill();
    } else {
      break;
    }
    attempts++;
  }

  return foundCodes;
};

// Simplified but effective QR detection
const findAllQrCodesInImageData = async (imageData: ImageData, pageNum: number = 1): Promise<DecodedQR[]> => {
  const canvas = new OffscreenCanvas(imageData.width, imageData.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    if (IS_DEVELOPMENT) {
      console.error('Could not get OffscreenCanvas context.');
    }
    return [];
  }

  context.putImageData(imageData, 0, 0);
  const originalImageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const allCodes = new Set<string>();

  try {
    // Strategy 1: Direct scan
    let codes = scanAndClearLoop(context, canvas.width, canvas.height);
    codes.forEach(code => allCodes.add(code));
    
    if (allCodes.size === 0) {
      // Strategy 2: Multi-threshold binarization
      const thresholds = [128, 85, 170, 100, 155];
      
      for (const threshold of thresholds) {
        context.putImageData(originalImageData, 0, 0);
        const binarized = binarizeImageData(
          new ImageData(new Uint8ClampedArray(originalImageData.data), originalImageData.width, originalImageData.height), 
          threshold
        );
        context.putImageData(binarized, 0, 0);
        codes = scanAndClearLoop(context, canvas.width, canvas.height);
        codes.forEach(code => allCodes.add(code));
        
        if (allCodes.size > 0) break;
      }
    }

    // Strategy 3: Scale variations (if still no results)
    if (allCodes.size === 0) {
      const scales = [0.8, 1.2, 0.6, 1.5];
      
      for (const scale of scales) {
        const scaledWidth = Math.floor(canvas.width * scale);
        const scaledHeight = Math.floor(canvas.height * scale);
        
        if (scaledWidth < 50 || scaledHeight < 50) continue;

        const scaledCanvas = new OffscreenCanvas(scaledWidth, scaledHeight);
        const scaledContext = scaledCanvas.getContext('2d');
        if (!scaledContext) continue;

        const tempCanvas = new OffscreenCanvas(canvas.width, canvas.height);
        const tempContext = tempCanvas.getContext('2d');
        if (!tempContext) continue;

        tempContext.putImageData(originalImageData, 0, 0);
        scaledContext.drawImage(tempCanvas, 0, 0, scaledWidth, scaledHeight);

        codes = scanAndClearLoop(scaledContext, scaledWidth, scaledHeight);
        codes.forEach(code => allCodes.add(code));
        
        if (allCodes.size > 0) break;
      }
    }

    const finalQRs = Array.from(allCodes).map(data => ({ data, page: pageNum }));
    
    if (IS_DEVELOPMENT) {
      console.log(`QR Detection - Page ${pageNum}: Found ${finalQRs.length} codes`);
    }
    return finalQRs;

  } catch (error) {
    if (IS_DEVELOPMENT) {
      console.error('Error in QR detection:', error);
    }
    return [];
  }
};

// Enhanced image processing
const decodeQrFromImage = async (file: File): Promise<DecodedQR[]> => {
  try {
    const blob = new Blob([file]);
    const imageBitmap = await createImageBitmap(blob);
    
    let { width, height } = imageBitmap;
    
    // Adaptive scaling
    if (width > MAX_SCANNING_DIMENSION || height > MAX_SCANNING_DIMENSION) {
      const ratio = Math.min(MAX_SCANNING_DIMENSION / width, MAX_SCANNING_DIMENSION / height);
      width = Math.floor(width * ratio);
      height = Math.floor(height * ratio);
    } else if (width < ADAPTIVE_SCALING_THRESHOLD && height < ADAPTIVE_SCALING_THRESHOLD) {
      const scaleFactor = Math.min(2, ADAPTIVE_SCALING_THRESHOLD / Math.max(width, height));
      width = Math.floor(width * scaleFactor);
      height = Math.floor(height * scaleFactor);
    }

    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get canvas context for image.');
    
    context.drawImage(imageBitmap, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const qrs = await findAllQrCodesInImageData(imageData, 1);
    
    imageBitmap.close();
    return qrs;
    
  } catch (error) {
    if (IS_DEVELOPMENT) {
      console.error('Error processing image:', error);
    }
    return [];
  }
};

// File processing
const processFile = async (file: File): Promise<DecodedFileResult> => {
  const startTime = performance.now();
  
  try {
    const qrs = await decodeQrFromImage(file);
    const processingTime = performance.now() - startTime;
    
    if (IS_DEVELOPMENT) {
      console.log(`File Processing Complete: ${file.name}`, {
        processingTime: `${processingTime.toFixed(2)}ms`,
        qrCodesFound: qrs.length,
        fileSize: `${(file.size / 1024).toFixed(2)}KB`
      });
    }
    
    return { 
      fileName: file.name, 
      status: qrs.length > 0 ? 'success' : 'no_qr_found', 
      qrs,
      processingTime 
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'An unknown error occurred.';
    if (IS_DEVELOPMENT) {
      console.error(`Error processing file ${file.name}:`, message);
    }
    return { 
      fileName: file.name, 
      status: 'error', 
      qrs: [], 
      error: message 
    };
  }
};

// Message queue handling with improved performance
interface QueueItem {
  type: 'image' | 'imageData';
  file?: File;
  imageData?: ImageData;
  pageNum?: number;
  priority: number;
  timestamp: number;
  parentFileName?: string;
}

let processingComplete = false;
let messageQueue: QueueItem[] = [];
let isProcessing = false;
let processedPages = 0;
let totalExpectedPages = 0;

const processQueue = async (): Promise<void> => {
  if (isProcessing || messageQueue.length === 0) return;
  isProcessing = true;
  
  // Sort queue by priority (higher priority first)
  messageQueue.sort((a, b) => b.priority - a.priority);
  const item = messageQueue.shift()!;

  try {
    if (item.type === 'image') {
      const result = await processFile(item.file!);
      self.postMessage({ type: 'result', payload: result });
    } else if (item.type === 'imageData') {
      const qrs = await findAllQrCodesInImageData(item.imageData!, item.pageNum || 1);
      processedPages++;
      
      // Always send result for every page
      self.postMessage({ 
        type: 'result', 
        payload: { 
          fileName: `Page ${item.pageNum}`,
          status: qrs.length > 0 ? 'success' : 'no_qr_found',
          qrs,
          pageNumber: item.pageNum,
          parentFileName: item.parentFileName
        } 
      });

      // Send progress update
      self.postMessage({
        type: 'progress',
        payload: {
          processed: processedPages,
          total: totalExpectedPages,
          currentPage: item.pageNum
        }
      });
    }
  } catch (error) {
    if (IS_DEVELOPMENT) {
      console.error('Error processing queue item:', error);
    }
    self.postMessage({
      type: 'error',
      payload: {
        message: error instanceof Error ? error.message : 'Processing error',
        item: item.type,
        fileName: item.type === 'image' ? item.file?.name : `Page ${item.pageNum}`
      }
    });
  }
  
  isProcessing = false;
  
  if (messageQueue.length > 0) {
    // Use requestIdleCallback equivalent for better performance
    setTimeout(processQueue, 0);
  } else if (processingComplete) {
    self.postMessage({ type: 'complete', payload: { totalProcessed: processedPages } });
  }
};

// Message handling
self.onmessage = async (event: MessageEvent) => {
  const data = event.data;
  
  switch (data.type) {
    case 'allFilesSent':
      processingComplete = true;
      if (!isProcessing && messageQueue.length === 0) {
        self.postMessage({ type: 'complete', payload: { totalProcessed: processedPages } });
      }
      break;
      
    case 'setPdfPageCount':
      totalExpectedPages = data.pageCount;
      processedPages = 0;
      break;
      
    case 'image':
      messageQueue.push({
        type: 'image',
        file: data.file,
        priority: 2,
        timestamp: Date.now()
      });
      processQueue();
      break;
      
    case 'imageData':
      messageQueue.push({
        type: 'imageData',
        imageData: data.imageData,
        pageNum: data.pageNum,
        parentFileName: data.parentFileName,
        priority: 3,
        timestamp: Date.now()
      });
      processQueue();
      break;
      
    default:
      if (IS_DEVELOPMENT) {
        console.warn('Unknown message type:', data.type);
      }
  }
}; 