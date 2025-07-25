import { DecodedQR, DecodedFileResult } from '../types';
import jsQR from 'jsqr';

const MAX_SCANNING_DIMENSION = 4096;

const binarizeImageData = (imageData: ImageData, threshold: number): ImageData => {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const value = luminance < threshold ? 0 : 255;
    data[i] = data[i + 1] = data[i + 2] = value;
  }
  return imageData;
};

const scanAndClearLoop = (context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, width: number, height: number): string[] => {
    const foundCodes: string[] = [];
    while (true) {
        const imageData = (context as unknown as CanvasRenderingContext2D).getImageData(0, 0, width, height);
        const code = jsQR(imageData.data, width, height);

        if (code) {
            foundCodes.push(code.data);
            const loc = code.location;
            (context as unknown as CanvasRenderingContext2D).beginPath();
            (context as unknown as CanvasRenderingContext2D).moveTo(loc.topLeftCorner.x, loc.topLeftCorner.y);
            (context as unknown as CanvasRenderingContext2D).lineTo(loc.topRightCorner.x, loc.topRightCorner.y);
            (context as unknown as CanvasRenderingContext2D).lineTo(loc.bottomRightCorner.x, loc.bottomRightCorner.y);
            (context as unknown as CanvasRenderingContext2D).lineTo(loc.bottomLeftCorner.x, loc.bottomLeftCorner.y);
            (context as unknown as CanvasRenderingContext2D).closePath();
            (context as unknown as CanvasRenderingContext2D).fillStyle = 'white';
            (context as unknown as CanvasRenderingContext2D).fill();
        } else {
            break;
        }
    }
    return foundCodes;
};

const findAllQrCodesInImageData = (imageData: ImageData): string[] => {
    // Create an OffscreenCanvas to perform the scanning
    const canvas = new OffscreenCanvas(imageData.width, imageData.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
        console.error('Could not get OffscreenCanvas context.');
        return [];
    }
    context.putImageData(imageData, 0, 0);

    // Get the initial image data once. This is our pristine copy.
    const originalImageData = context.getImageData(0, 0, canvas.width, canvas.height);

    // Strategy 1: Standard scan.
    let codes = scanAndClearLoop(context, canvas.width, canvas.height);
    context.putImageData(originalImageData, 0, 0);
    if (codes.length > 0) return codes;
    
    // Strategy 2: Multi-threshold Binarization.
    const thresholds = [128, 85, 170]; 
    for (const threshold of thresholds) {
        const binarizableImageData = new ImageData(
            new Uint8ClampedArray(originalImageData.data),
            originalImageData.width,
            originalImageData.height
        );
        const binarizedImageData = binarizeImageData(binarizableImageData, threshold); 
        context.putImageData(binarizedImageData, 0, 0);
        codes = scanAndClearLoop(context, canvas.width, canvas.height);
        context.putImageData(originalImageData, 0, 0);
        if (codes.length > 0) return codes;
    }
    
    return [];
};


const decodeQrFromImage = async (file: File): Promise<DecodedQR[]> => {
    const blob = new Blob([file]);
    const imageBitmap = await createImageBitmap(blob);
    
    let { width, height } = imageBitmap;
    if (width > MAX_SCANNING_DIMENSION || height > MAX_SCANNING_DIMENSION) {
        const ratio = Math.min(MAX_SCANNING_DIMENSION / width, MAX_SCANNING_DIMENSION / height);
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
    }

    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get canvas context for image.');
    
    context.drawImage(imageBitmap, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const qrDataArray = findAllQrCodesInImageData(imageData);
    imageBitmap.close();
    
    return qrDataArray.map(data => ({ data, page: 1 }));
};

const processFile = async (file: File): Promise<DecodedFileResult> => {
    try {
        const qrs = await decodeQrFromImage(file);
        return { 
            fileName: file.name, 
            status: qrs.length > 0 ? 'success' : 'no_qr_found', 
            qrs 
        };
    } catch (e) {
        const message = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { fileName: file.name, status: 'error', qrs: [], error: message };
    }
};

let processingComplete = false;
let messageQueue: any[] = [];
let isProcessing = false;

const processQueue = async () => {
    if (isProcessing || messageQueue.length === 0) return;
    isProcessing = true;
    
    const { type, file, imageData, pageNum } = messageQueue.shift();

    if (type === 'image') {
        const result = await processFile(file);
        self.postMessage({ type: 'result', payload: result });
    } else if (type === 'imageData') {
        const qrs = findAllQrCodesInImageData(imageData).map(data => ({ data, page: pageNum }));
        if (qrs.length > 0) {
            self.postMessage({ type: 'result', payload: { fileName: 'PDF Scan', status: 'success', qrs } });
        }
    }
    
    isProcessing = false;
    if (messageQueue.length > 0) {
        processQueue();
    } else if (processingComplete) {
        self.postMessage({ type: 'complete' });
    }
}

self.onmessage = async (event: MessageEvent) => {
    const data = event.data;
    if (data.type === 'allFilesSent') {
        processingComplete = true;
        if (!isProcessing && messageQueue.length === 0) {
            self.postMessage({ type: 'complete' });
        }
        return;
    }
    
    messageQueue.push(data);
    processQueue();
}; 