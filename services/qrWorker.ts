import { DecodedQR, DecodedFileResult } from '../types';
import jsQR from 'jsqr';

const MAX_SCANNING_DIMENSION = 4096;
const ADAPTIVE_SCALING_THRESHOLD = 2048;

interface ProcessingResult {
  qrs: DecodedQR[];
  processingTime: number;
  strategy: string;
}

interface ScanningMetrics {
  totalAttempts: number;
  successfulDetections: number;
  avgProcessingTime: number;
  strategiesUsed: string[];
}

// Advanced image preprocessing utilities
const ImageProcessor = {
  // Gaussian blur for noise reduction
  gaussianBlur: (imageData: ImageData, radius: number = 1): ImageData => {
    const { data, width, height } = imageData;
    const output = new Uint8ClampedArray(data);
    const kernel = ImageProcessor.generateGaussianKernel(radius);
    const kernelSize = kernel.length;
    const half = Math.floor(kernelSize / 2);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        let weightSum = 0;

        for (let ky = -half; ky <= half; ky++) {
          for (let kx = -half; kx <= half; kx++) {
            const px = Math.min(Math.max(x + kx, 0), width - 1);
            const py = Math.min(Math.max(y + ky, 0), height - 1);
            const idx = (py * width + px) * 4;
            const weight = kernel[ky + half][kx + half];

            r += data[idx] * weight;
            g += data[idx + 1] * weight;
            b += data[idx + 2] * weight;
            a += data[idx + 3] * weight;
            weightSum += weight;
          }
        }

        const outIdx = (y * width + x) * 4;
        output[outIdx] = r / weightSum;
        output[outIdx + 1] = g / weightSum;
        output[outIdx + 2] = b / weightSum;
        output[outIdx + 3] = a / weightSum;
      }
    }

    return new ImageData(output, width, height);
  },

  generateGaussianKernel: (radius: number): number[][] => {
    const size = radius * 2 + 1;
    const kernel: number[][] = [];
    const sigma = radius / 3;
    let sum = 0;

    for (let y = 0; y < size; y++) {
      kernel[y] = [];
      for (let x = 0; x < size; x++) {
        const distance = Math.sqrt((x - radius) ** 2 + (y - radius) ** 2);
        const value = Math.exp(-(distance ** 2) / (2 * sigma ** 2));
        kernel[y][x] = value;
        sum += value;
      }
    }

    // Normalize kernel
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        kernel[y][x] /= sum;
      }
    }

    return kernel;
  },

  // Adaptive histogram equalization
  adaptiveHistogramEqualization: (imageData: ImageData): ImageData => {
    const { data, width, height } = imageData;
    const output = new Uint8ClampedArray(data);
    const tileSize = 64; // Size of each tile for local histogram equalization

    for (let ty = 0; ty < height; ty += tileSize) {
      for (let tx = 0; tx < width; tx += tileSize) {
        const endY = Math.min(ty + tileSize, height);
        const endX = Math.min(tx + tileSize, width);
        
        // Build histogram for this tile
        const histogram = new Array(256).fill(0);
        let pixelCount = 0;

        for (let y = ty; y < endY; y++) {
          for (let x = tx; x < endX; x++) {
            const idx = (y * width + x) * 4;
            const luminance = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
            histogram[luminance]++;
            pixelCount++;
          }
        }

        // Create cumulative distribution function
        const cdf = new Array(256);
        cdf[0] = histogram[0];
        for (let i = 1; i < 256; i++) {
          cdf[i] = cdf[i - 1] + histogram[i];
        }

        // Apply equalization to this tile
        for (let y = ty; y < endY; y++) {
          for (let x = tx; x < endX; x++) {
            const idx = (y * width + x) * 4;
            const luminance = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
            const newLuminance = Math.round((cdf[luminance] / pixelCount) * 255);
            
            // Apply the enhancement while preserving color ratios
            const ratio = newLuminance / Math.max(luminance, 1);
            output[idx] = Math.min(255, data[idx] * ratio);
            output[idx + 1] = Math.min(255, data[idx + 1] * ratio);
            output[idx + 2] = Math.min(255, data[idx + 2] * ratio);
            output[idx + 3] = data[idx + 3];
          }
        }
      }
    }

    return new ImageData(output, width, height);
  },

  // Unsharp masking for edge enhancement
  unsharpMask: (imageData: ImageData, amount: number = 0.5, radius: number = 1): ImageData => {
    const blurred = ImageProcessor.gaussianBlur(imageData, radius);
    const { data, width, height } = imageData;
    const blurredData = blurred.data;
    const output = new Uint8ClampedArray(data);

    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const original = data[i + c];
        const blur = blurredData[i + c];
        const enhanced = original + amount * (original - blur);
        output[i + c] = Math.max(0, Math.min(255, enhanced));
      }
      output[i + 3] = data[i + 3]; // Preserve alpha
    }

    return new ImageData(output, width, height);
  },

  // Morphological operations for noise reduction
  morphologicalClose: (imageData: ImageData, kernelSize: number = 3): ImageData => {
    const dilated = ImageProcessor.dilate(imageData, kernelSize);
    return ImageProcessor.erode(dilated, kernelSize);
  },

  dilate: (imageData: ImageData, kernelSize: number): ImageData => {
    const { data, width, height } = imageData;
    const output = new Uint8ClampedArray(data);
    const half = Math.floor(kernelSize / 2);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let maxVal = 0;

        for (let ky = -half; ky <= half; ky++) {
          for (let kx = -half; kx <= half; kx++) {
            const px = Math.min(Math.max(x + kx, 0), width - 1);
            const py = Math.min(Math.max(y + ky, 0), height - 1);
            const idx = (py * width + px) * 4;
            const luminance = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            maxVal = Math.max(maxVal, luminance);
          }
        }

        const outIdx = (y * width + x) * 4;
        output[outIdx] = output[outIdx + 1] = output[outIdx + 2] = maxVal;
        output[outIdx + 3] = data[outIdx + 3];
      }
    }

    return new ImageData(output, width, height);
  },

  erode: (imageData: ImageData, kernelSize: number): ImageData => {
    const { data, width, height } = imageData;
    const output = new Uint8ClampedArray(data);
    const half = Math.floor(kernelSize / 2);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let minVal = 255;

        for (let ky = -half; ky <= half; ky++) {
          for (let kx = -half; kx <= half; kx++) {
            const px = Math.min(Math.max(x + kx, 0), width - 1);
            const py = Math.min(Math.max(y + ky, 0), height - 1);
            const idx = (py * width + px) * 4;
            const luminance = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            minVal = Math.min(minVal, luminance);
          }
        }

        const outIdx = (y * width + x) * 4;
        output[outIdx] = output[outIdx + 1] = output[outIdx + 2] = minVal;
        output[outIdx + 3] = data[outIdx + 3];
      }
    }

    return new ImageData(output, width, height);
  }
};

// Advanced binarization techniques
const BinarizationMethods = {
  // Otsu's method for automatic threshold selection
  otsu: (imageData: ImageData): ImageData => {
    const { data, width, height } = imageData;
    const histogram = new Array(256).fill(0);
    const totalPixels = width * height;

    // Build histogram
    for (let i = 0; i < data.length; i += 4) {
      const luminance = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      histogram[luminance]++;
    }

    // Find optimal threshold using Otsu's method
    let sum = 0;
    for (let i = 0; i < 256; i++) {
      sum += i * histogram[i];
    }

    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let varMax = 0;
    let threshold = 0;

    for (let t = 0; t < 256; t++) {
      wB += histogram[t];
      if (wB === 0) continue;

      wF = totalPixels - wB;
      if (wF === 0) break;

      sumB += t * histogram[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const varBetween = wB * wF * (mB - mF) * (mB - mF);

      if (varBetween > varMax) {
        varMax = varBetween;
        threshold = t;
      }
    }

    return BinarizationMethods.simpleThreshold(imageData, threshold);
  },

  // Adaptive threshold (Bradley-Roth method)
  adaptive: (imageData: ImageData, windowSize: number = 15, threshold: number = 0.15): ImageData => {
    const { data, width, height } = imageData;
    const output = new Uint8ClampedArray(data);
    const integralImage = new Array(width * height).fill(0);

    // Build integral image
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const luminance = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        const integralIdx = y * width + x;
        
        integralImage[integralIdx] = luminance;
        if (x > 0) integralImage[integralIdx] += integralImage[y * width + x - 1];
        if (y > 0) integralImage[integralIdx] += integralImage[(y - 1) * width + x];
        if (x > 0 && y > 0) integralImage[integralIdx] -= integralImage[(y - 1) * width + x - 1];
      }
    }

    // Apply adaptive thresholding
    const halfWindow = Math.floor(windowSize / 2);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const x1 = Math.max(0, x - halfWindow);
        const x2 = Math.min(width - 1, x + halfWindow);
        const y1 = Math.max(0, y - halfWindow);
        const y2 = Math.min(height - 1, y + halfWindow);

        const count = (x2 - x1) * (y2 - y1);
        let sum = integralImage[y2 * width + x2];
        if (x1 > 0) sum -= integralImage[y2 * width + x1 - 1];
        if (y1 > 0) sum -= integralImage[(y1 - 1) * width + x2];
        if (x1 > 0 && y1 > 0) sum += integralImage[(y1 - 1) * width + x1 - 1];

        const idx = (y * width + x) * 4;
        const luminance = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        const localMean = sum / count;
        const value = luminance > localMean * (1 - threshold) ? 255 : 0;

        output[idx] = output[idx + 1] = output[idx + 2] = value;
        output[idx + 3] = data[idx + 3];
      }
    }

    return new ImageData(output, width, height);
  },

  simpleThreshold: (imageData: ImageData, threshold: number): ImageData => {
    const { data, width, height } = imageData;
    const output = new Uint8ClampedArray(data);

    for (let i = 0; i < data.length; i += 4) {
      const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const value = luminance < threshold ? 0 : 255;
      output[i] = output[i + 1] = output[i + 2] = value;
      output[i + 3] = data[i + 3];
    }

    return new ImageData(output, width, height);
  }
};

// Advanced QR detection strategies
const QRDetectionStrategies = {
  // Multi-scale detection
  multiScale: async (canvas: OffscreenCanvas, context: OffscreenCanvasRenderingContext2D): Promise<ProcessingResult> => {
    const startTime = performance.now();
    const scales = [1.0, 0.8, 1.2, 0.6, 1.5, 0.4];
    const foundCodes: string[] = [];
    
    const originalImageData = context.getImageData(0, 0, canvas.width, canvas.height);

    for (const scale of scales) {
      const scaledWidth = Math.floor(canvas.width * scale);
      const scaledHeight = Math.floor(canvas.height * scale);
      
      if (scaledWidth < 50 || scaledHeight < 50) continue;

      const scaledCanvas = new OffscreenCanvas(scaledWidth, scaledHeight);
      const scaledContext = scaledCanvas.getContext('2d');
      if (!scaledContext) continue;

      // Create scaled image
      const tempCanvas = new OffscreenCanvas(canvas.width, canvas.height);
      const tempContext = tempCanvas.getContext('2d');
      if (!tempContext) continue;

      tempContext.putImageData(originalImageData, 0, 0);
      scaledContext.drawImage(tempCanvas, 0, 0, scaledWidth, scaledHeight);

      const scaledImageData = scaledContext.getImageData(0, 0, scaledWidth, scaledHeight);
      const codes = QRDetectionStrategies.scanAndClearLoop(scaledContext, scaledWidth, scaledHeight);
      
      foundCodes.push(...codes.filter(code => !foundCodes.includes(code)));
      
      if (foundCodes.length > 0) break;
    }

    return {
      qrs: foundCodes.map(data => ({ data, page: 1 })),
      processingTime: performance.now() - startTime,
      strategy: 'multi-scale'
    };
  },

  // Enhanced preprocessing pipeline
  enhancedPreprocessing: async (canvas: OffscreenCanvas, context: OffscreenCanvasRenderingContext2D): Promise<ProcessingResult> => {
    const startTime = performance.now();
    const originalImageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const foundCodes: string[] = [];

    const preprocessingSteps = [
      { name: 'original', processor: (data: ImageData) => data },
      { name: 'gaussian-blur', processor: (data: ImageData) => ImageProcessor.gaussianBlur(data, 1) },
      { name: 'unsharp-mask', processor: (data: ImageData) => ImageProcessor.unsharpMask(data, 0.7, 1) },
      { name: 'adaptive-histogram', processor: (data: ImageData) => ImageProcessor.adaptiveHistogramEqualization(data) },
      { name: 'morphological-close', processor: (data: ImageData) => ImageProcessor.morphologicalClose(data, 3) }
    ];

    for (const step of preprocessingSteps) {
      const processedImageData = step.processor(new ImageData(
        new Uint8ClampedArray(originalImageData.data),
        originalImageData.width,
        originalImageData.height
      ));

      context.putImageData(processedImageData, 0, 0);
      const codes = QRDetectionStrategies.scanAndClearLoop(context, canvas.width, canvas.height);
      foundCodes.push(...codes.filter(code => !foundCodes.includes(code)));

      if (foundCodes.length > 0) break;
    }

    return {
      qrs: foundCodes.map(data => ({ data, page: 1 })),
      processingTime: performance.now() - startTime,
      strategy: 'enhanced-preprocessing'
    };
  },

  // Advanced binarization techniques
  advancedBinarization: async (canvas: OffscreenCanvas, context: OffscreenCanvasRenderingContext2D): Promise<ProcessingResult> => {
    const startTime = performance.now();
    const originalImageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const foundCodes: string[] = [];

    const binarizationMethods = [
      { name: 'otsu', method: BinarizationMethods.otsu },
      { name: 'adaptive-15', method: (data: ImageData) => BinarizationMethods.adaptive(data, 15, 0.15) },
      { name: 'adaptive-25', method: (data: ImageData) => BinarizationMethods.adaptive(data, 25, 0.1) },
      { name: 'adaptive-35', method: (data: ImageData) => BinarizationMethods.adaptive(data, 35, 0.2) },
      { name: 'threshold-85', method: (data: ImageData) => BinarizationMethods.simpleThreshold(data, 85) },
      { name: 'threshold-128', method: (data: ImageData) => BinarizationMethods.simpleThreshold(data, 128) },
      { name: 'threshold-170', method: (data: ImageData) => BinarizationMethods.simpleThreshold(data, 170) }
    ];

    for (const method of binarizationMethods) {
      const binarizedImageData = method.method(new ImageData(
        new Uint8ClampedArray(originalImageData.data),
        originalImageData.width,
        originalImageData.height
      ));

      context.putImageData(binarizedImageData, 0, 0);
      const codes = QRDetectionStrategies.scanAndClearLoop(context, canvas.width, canvas.height);
      foundCodes.push(...codes.filter(code => !foundCodes.includes(code)));

      if (foundCodes.length > 0) break;
    }

    return {
      qrs: foundCodes.map(data => ({ data, page: 1 })),
      processingTime: performance.now() - startTime,
      strategy: 'advanced-binarization'
    };
  },

  // Region-based scanning (divide and conquer)
  regionBasedScanning: async (canvas: OffscreenCanvas, context: OffscreenCanvasRenderingContext2D): Promise<ProcessingResult> => {
    const startTime = performance.now();
    const foundCodes: string[] = [];
    const originalImageData = context.getImageData(0, 0, canvas.width, canvas.height);

    // Divide image into overlapping regions
    const regionSize = Math.min(512, Math.max(canvas.width, canvas.height) / 2);
    const overlap = regionSize * 0.2;
    const step = regionSize - overlap;

    for (let y = 0; y < canvas.height; y += step) {
      for (let x = 0; x < canvas.width; x += step) {
        const regionWidth = Math.min(regionSize, canvas.width - x);
        const regionHeight = Math.min(regionSize, canvas.height - y);

        if (regionWidth < 100 || regionHeight < 100) continue;

        const regionCanvas = new OffscreenCanvas(regionWidth, regionHeight);
        const regionContext = regionCanvas.getContext('2d');
        if (!regionContext) continue;

        // Extract region
        const tempCanvas = new OffscreenCanvas(canvas.width, canvas.height);
        const tempContext = tempCanvas.getContext('2d');
        if (!tempContext) continue;

        tempContext.putImageData(originalImageData, 0, 0);
        regionContext.drawImage(tempCanvas, x, y, regionWidth, regionHeight, 0, 0, regionWidth, regionHeight);

        const codes = QRDetectionStrategies.scanAndClearLoop(regionContext, regionWidth, regionHeight);
        foundCodes.push(...codes.filter(code => !foundCodes.includes(code)));
      }
    }

    return {
      qrs: foundCodes.map(data => ({ data, page: 1 })),
      processingTime: performance.now() - startTime,
      strategy: 'region-based'
    };
  },

  scanAndClearLoop: (context: OffscreenCanvasRenderingContext2D, width: number, height: number): string[] => {
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
  }
};

// Super advanced QR detection orchestrator
const findAllQrCodesInImageData = async (imageData: ImageData, pageNum: number = 1): Promise<DecodedQR[]> => {
  const canvas = new OffscreenCanvas(imageData.width, imageData.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    console.error('Could not get OffscreenCanvas context.');
    return [];
  }

  context.putImageData(imageData, 0, 0);
  const allResults: ProcessingResult[] = [];

  // Execute all strategies in parallel for maximum efficiency
  const strategies = [
    QRDetectionStrategies.multiScale(canvas, context),
    QRDetectionStrategies.enhancedPreprocessing(canvas, context),
    QRDetectionStrategies.advancedBinarization(canvas, context),
    QRDetectionStrategies.regionBasedScanning(canvas, context)
  ];

  try {
    const results = await Promise.allSettled(strategies);
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allResults.push(result.value);
      } else {
        console.warn(`Strategy ${index} failed:`, result.reason);
      }
    });

    // Combine results and remove duplicates
    const uniqueCodes = new Set<string>();
    const finalQRs: DecodedQR[] = [];

    allResults.forEach(result => {
      result.qrs.forEach(qr => {
        if (!uniqueCodes.has(qr.data)) {
          uniqueCodes.add(qr.data);
          finalQRs.push({ data: qr.data, page: pageNum });
        }
      });
    });

    // Log performance metrics
    const totalTime = allResults.reduce((sum, result) => sum + result.processingTime, 0);
    const avgTime = totalTime / allResults.length;
    
    console.log(`QR Detection Performance - Page ${pageNum}:`, {
      strategiesExecuted: allResults.length,
      totalProcessingTime: `${totalTime.toFixed(2)}ms`,
      averageTime: `${avgTime.toFixed(2)}ms`,
      codesFound: finalQRs.length,
      uniqueCodes: uniqueCodes.size
    });

    return finalQRs;

  } catch (error) {
    console.error('Error in advanced QR detection:', error);
    return [];
  }
};

// Enhanced image processing for different file types
const decodeQrFromImage = async (file: File): Promise<DecodedQR[]> => {
  try {
    const blob = new Blob([file]);
    const imageBitmap = await createImageBitmap(blob);
    
    let { width, height } = imageBitmap;
    
    // Adaptive scaling based on image size
    if (width > MAX_SCANNING_DIMENSION || height > MAX_SCANNING_DIMENSION) {
      const ratio = Math.min(MAX_SCANNING_DIMENSION / width, MAX_SCANNING_DIMENSION / height);
      width = Math.floor(width * ratio);
      height = Math.floor(height * ratio);
    } else if (width < ADAPTIVE_SCALING_THRESHOLD && height < ADAPTIVE_SCALING_THRESHOLD) {
      // Upscale small images for better detection
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
    console.error('Error processing image:', error);
    return [];
  }
};

// Enhanced file processing with better error handling and metrics
const processFile = async (file: File): Promise<DecodedFileResult> => {
  const startTime = performance.now();
  
  try {
    const qrs = await decodeQrFromImage(file);
    const processingTime = performance.now() - startTime;
    
    console.log(`File Processing Complete: ${file.name}`, {
      processingTime: `${processingTime.toFixed(2)}ms`,
      qrCodesFound: qrs.length,
      fileSize: `${(file.size / 1024).toFixed(2)}KB`
    });
    
    return { 
      fileName: file.name, 
      status: qrs.length > 0 ? 'success' : 'no_qr_found', 
      qrs 
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'An unknown error occurred.';
    console.error(`Error processing file ${file.name}:`, message);
    return { 
      fileName: file.name, 
      status: 'error', 
      qrs: [], 
      error: message 
    };
  }
};

// Enhanced message queue with priority handling
interface QueueItem {
  type: 'image' | 'imageData';
  file?: File;
  imageData?: ImageData;
  pageNum?: number;
  priority: number;
  timestamp: number;
}

let processingComplete = false;
let messageQueue: QueueItem[] = [];
let isProcessing = false;
let processedPages = 0;
let totalExpectedPages = 0;

const processQueue = async () => {
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
      
      if (qrs.length > 0) {
        self.postMessage({ 
          type: 'result', 
          payload: { 
            fileName: `PDF Page ${item.pageNum}`, 
            status: 'success', 
            qrs,
            pageNumber: item.pageNum
          } 
        });
      }

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
    console.error('Error processing queue item:', error);
    self.postMessage({
      type: 'error',
      payload: {
        message: error instanceof Error ? error.message : 'Processing error',
        item: item.type
      }
    });
  }
  
  isProcessing = false;
  
  if (messageQueue.length > 0) {
    // Use setTimeout to prevent blocking
    setTimeout(processQueue, 0);
  } else if (processingComplete) {
    self.postMessage({ type: 'complete', payload: { totalProcessed: processedPages } });
  }
};

// Enhanced message handling with better coordination
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
        priority: 2, // Lower priority than PDF pages
        timestamp: Date.now()
      });
      processQueue();
      break;
      
    case 'imageData':
      messageQueue.push({
        type: 'imageData',
        imageData: data.imageData,
        pageNum: data.pageNum,
        priority: 3, // Higher priority for PDF pages
        timestamp: Date.now()
      });
      processQueue();
      break;
      
    default:
      console.warn('Unknown message type:', data.type);
  }
}; 