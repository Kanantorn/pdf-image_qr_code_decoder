import React, { useState, useCallback, useRef, useEffect, useMemo, memo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { DecodedFileResult, QRGenerationData, GeneratedQR } from './types';
import { FileText, UploadCloud, Copy, Check, QrCode, Image, Download, Plus } from './components/icons';
import { Spinner } from './components/Spinner';
import { exportToCsv } from './services/export';
import { parseQRData } from './services/qrParser.tsx';
import { QRGenerationForm } from './components/QRGenerationForm';
import { GeneratedQRsView } from './components/GeneratedQRsView';
import { createGeneratedQR } from './services/qrGenerator';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const MAX_SCANNING_DIMENSION = 4096;
const OPTIMAL_SCALE = 3.0; // Increased for better QR detection
const HIGH_DPI_SCALE = 5.0; // For high-quality scanning
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

type Status = 'idle' | 'processing' | 'results';
type ProcessingState = { 
  total: number; 
  current: number; 
  currentFile: string;
  currentPage?: number;
  totalPages?: number;
  strategy?: string;
} | null;
type ActiveTab = 'decoder' | 'generator';

interface ProcessingMetrics {
  filesProcessed: number;
  pagesProcessed: number;
  qrCodesFound: number;
  averageProcessingTime: number;
  totalProcessingTime: number;
}

// Memoized components for better performance
const ProcessingStatus = memo(({ processingState, results, elapsedTime }: {
  processingState: ProcessingState;
  results: DecodedFileResult[];
  elapsedTime: number;
}) => {
  if (!processingState) return null;

  const currentQRCount = results.reduce((sum, r) => sum + r.qrs.length, 0);
  const successfulCount = results.filter(r => r.status === 'success').length;

  return (
    <div className="text-center space-y-6">
      <div className="flex items-center justify-center space-x-3">
        <Spinner className="w-8 h-8" />
        <div className="text-right">
          <p className="text-lg font-semibold text-white">
            {processingState.currentFile}
          </p>
          {processingState.currentPage && processingState.totalPages && (
            <p className="text-sm text-slate-400">
              Page {processingState.currentPage} of {processingState.totalPages}
            </p>
          )}
          <p className="text-xs text-slate-500">
            Strategy: {processingState.strategy || 'multi-strategy-parallel'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto">
        <div className="bg-slate-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-indigo-400">
            {processingState.current}/{processingState.total}
          </div>
          <div className="text-xs text-slate-400">Files Processed</div>
        </div>
        <div className="bg-slate-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-400">{currentQRCount}</div>
          <div className="text-xs text-slate-400">QR Codes Found</div>
        </div>
      </div>

      <div className="text-sm text-slate-400">
        Processing time: {Math.floor(elapsedTime / 60)}:{String(elapsedTime % 60).padStart(2, '0')}
      </div>
    </div>
  );
});

const App: React.FC = () => {
  // Existing decoder state
  const [results, setResults] = useState<DecodedFileResult[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [processingState, setProcessingState] = useState<ProcessingState>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [copiedInfo, setCopiedInfo] = useState<{fileIndex: number, qrIndex: number} | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [processingMetrics, setProcessingMetrics] = useState<ProcessingMetrics | null>(null);
  
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const startTimeRef = useRef<number>(0);
  const fileProcessingStartRef = useRef<number>(0);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generatedCopiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // New generator state
  const [activeTab, setActiveTab] = useState<ActiveTab>('decoder');
  const [generatedQRs, setGeneratedQRs] = useState<GeneratedQR[]>([]);
  const [showGenerationForm, setShowGenerationForm] = useState(false);
  const [copiedGeneratedId, setCopiedGeneratedId] = useState<string | null>(null);

  // Cleanup function for all timers
  const cleanupTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (copiedTimeoutRef.current) {
      clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = null;
    }
    if (generatedCopiedTimeoutRef.current) {
      clearTimeout(generatedCopiedTimeoutRef.current);
      generatedCopiedTimeoutRef.current = null;
    }
  }, []);

  // Memoized calculations for better performance
  const resultStats = useMemo(() => {
    const filteredResults = results.filter(r => !(r.pageNumber && r.parentFileName));
    const totalQRs = filteredResults.reduce((sum, r) => sum + r.qrs.length, 0);
    const successfulFiles = filteredResults.filter(r => r.status === 'success').length;
    const totalFiles = filteredResults.length;
    
    return { totalQRs, successfulFiles, totalFiles, filteredResults };
  }, [results]);

  useEffect(() => {
    // Create worker on mount
    workerRef.current = new Worker(new URL('./services/qrWorker.ts', import.meta.url), { type: 'module' });

    const handleWorkerMessage = (event: MessageEvent) => {
      const { type, payload } = event.data;
      
      switch (type) {
        case 'result':
          setResults(prev => {
            // Handle PDF page results differently from regular file results
            if (payload.pageNumber && payload.parentFileName) {
              // This is a PDF page result - merge with parent PDF file
              const existingIndex = prev.findIndex(r => r.fileName === payload.parentFileName);
              
              if (existingIndex >= 0) {
                const updated = [...prev];
                updated[existingIndex] = {
                  ...updated[existingIndex],
                  qrs: [...updated[existingIndex].qrs, ...payload.qrs],
                  status: payload.qrs.length > 0 ? 'success' : updated[existingIndex].status
                };
                return updated;
              }
            }
            
            // Regular file result or initial PDF entry
            return [...prev, payload];
          });
          break;
          
        case 'progress':
          setProcessingState(prev => prev ? {
            ...prev,
            currentPage: payload.currentPage,
            totalPages: payload.total
          } : null);
          break;
          
        case 'complete':
          cleanupTimers();
          const totalTime = Date.now() - startTimeRef.current;
          setElapsedTime(Math.round(totalTime / 1000));
          
          // Use callback to get latest results state
          setResults(currentResults => {
            // Calculate final metrics with current results
            setProcessingMetrics({
              filesProcessed: currentResults.length,
              pagesProcessed: payload.totalProcessed || 0,
              qrCodesFound: currentResults.reduce((sum, r) => sum + r.qrs.length, 0),
              averageProcessingTime: totalTime / Math.max(currentResults.length, 1),
              totalProcessingTime: totalTime
            });
            
            setStatus('results');
            setProcessingState(null);
            return currentResults; // Return unchanged results
          });
          break;
          
        case 'error':
          if (IS_DEVELOPMENT) {
            console.error('Worker error:', payload);
          }
          // Add error result to display
          setResults(prev => [...prev, {
            fileName: payload.fileName || 'Unknown File',
            status: 'error',
            qrs: [],
            error: payload.message
          }]);
          break;
          
        default:
          if (IS_DEVELOPMENT) {
            console.warn('Unknown worker message type:', type);
          }
      }
    };

    workerRef.current.addEventListener('message', handleWorkerMessage);

    return () => {
      workerRef.current?.removeEventListener('message', handleWorkerMessage);
      workerRef.current?.terminate();
      cleanupTimers();
    };
  }, [cleanupTimers]);

  // Enhanced PDF processing with super advanced features
  const processEnhancedPDF = async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({
        data: arrayBuffer,
        cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/cmaps/',
        cMapPacked: true,
      }).promise;

      const totalPages = pdf.numPages;
      if (IS_DEVELOPMENT) {
        console.log(`Processing PDF: ${file.name} (${totalPages} pages)`);
      }
      
      // Initialize PDF processing
      workerRef.current?.postMessage({ 
        type: 'setPdfPageCount', 
        pageCount: totalPages 
      });

      // Create initial PDF result entry
      const pdfResult: DecodedFileResult = {
        fileName: file.name,
        status: 'no_qr_found', // Start with no QR found, will be updated
        qrs: []
      };
      setResults(prev => [...prev, pdfResult]);

      // Process pages with adaptive scaling and enhanced rendering
      const pageProcessingPromises = [];
      
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const pagePromise = pdf.getPage(pageNum).then(async (page) => {
          try {
            // Get page dimensions
            const unscaledViewport = page.getViewport({ scale: 1.0 });
            let scale = OPTIMAL_SCALE;

            // Adaptive scaling based on page size and content
            const pageArea = unscaledViewport.width * unscaledViewport.height;
            if (pageArea > 1000000) { // Large pages
              scale = HIGH_DPI_SCALE;
            } else if (pageArea < 100000) { // Small pages
              scale = HIGH_DPI_SCALE * 1.5; // Extra upscaling for small content
            }

            // Apply dimension constraints
            let viewport = page.getViewport({ scale });
            if (viewport.width > MAX_SCANNING_DIMENSION || viewport.height > MAX_SCANNING_DIMENSION) {
              const constraintScale = Math.min(
                MAX_SCANNING_DIMENSION / unscaledViewport.width,
                MAX_SCANNING_DIMENSION / unscaledViewport.height
              );
              scale = Math.min(scale, constraintScale);
              viewport = page.getViewport({ scale });
            }

            // Create high-quality canvas
            const canvas = new OffscreenCanvas(
              Math.floor(viewport.width),
              Math.floor(viewport.height)
            );
            const context = canvas.getContext('2d');
            if (!context) {
              if (IS_DEVELOPMENT) {
                console.error(`Failed to get context for page ${pageNum}`);
              }
              return;
            }

            // Enhanced rendering with better quality settings
            const renderContext = {
              canvasContext: context as any,
              viewport: viewport,
              enableWebGL: false, // Disable WebGL for better compatibility
              renderInteractiveForms: false,
              background: 'white' // Ensure white background for better QR detection
            };

            if (IS_DEVELOPMENT) {
              console.log(`Rendering page ${pageNum}/${totalPages} at ${scale}x scale (${viewport.width}x${viewport.height})`);
            }
            
            await page.render(renderContext).promise;
            
            // Get image data with enhanced quality
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            
            // Send to worker for super advanced processing
            workerRef.current?.postMessage({ 
              type: 'imageData', 
              imageData, 
              pageNum,
              parentFileName: file.name // Pass parent file name
            }, [imageData.data.buffer]);

            // Clean up page resources
            page.cleanup();
            
          } catch (error) {
            if (IS_DEVELOPMENT) {
              console.error(`Error processing page ${pageNum}:`, error);
            }
          }
        });

        pageProcessingPromises.push(pagePromise);
        
        // Process in batches to prevent memory issues
        if (pageProcessingPromises.length >= 5) {
          await Promise.allSettled(pageProcessingPromises.splice(0, 5));
        }
      }

      // Process remaining pages
      if (pageProcessingPromises.length > 0) {
        await Promise.allSettled(pageProcessingPromises);
      }

      // Clean up PDF resources
      await pdf.destroy();
      
    } catch (error) {
      if (IS_DEVELOPMENT) {
        console.error(`Failed to process PDF ${file.name}:`, error);
      }
      const errorResult: DecodedFileResult = {
        fileName: file.name,
        status: 'error',
        qrs: [],
        error: error instanceof Error ? error.message : 'PDF processing failed'
      };
      setResults(prev => [...prev, errorResult]);
    }
  };

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    startTimeRef.current = Date.now();
    fileProcessingStartRef.current = Date.now();
    setElapsedTime(0);
    setProcessingMetrics(null);
    
    timerRef.current = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    setStatus('processing');
    setResults([]);
    const fileArray = Array.from(files);
    let filesProcessed = 0;

    setProcessingState({ 
      total: fileArray.length, 
      current: 0, 
      currentFile: 'Initializing advanced QR detection...',
      strategy: 'multi-strategy-parallel'
    });

    for (const file of fileArray) {
      setProcessingState(prev => prev ? { 
        ...prev, 
        current: filesProcessed + 1, 
        currentFile: `Processing: ${file.name}`,
        strategy: file.type === 'application/pdf' ? 'enhanced-pdf-processing' : 'advanced-image-analysis'
      } : null);
      
      if (file.type.startsWith('image/')) {
        workerRef.current?.postMessage({ type: 'image', file });
      } else if (file.type === 'application/pdf') {
        await processEnhancedPDF(file);
      }
      
      filesProcessed++;
    }

    // Signal completion to worker
    workerRef.current?.postMessage({ type: 'allFilesSent' });
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    // Reset file input to allow re-uploading the same file
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleDragEvents = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  };

  const resetState = () => {
    cleanupTimers();
    setStatus('idle');
    setResults([]);
    setProcessingState(null);
    setCopiedInfo(null);
    setElapsedTime(0);
    setProcessingMetrics(null);
  };

  const handleCopy = (text: string, fileIndex: number, qrIndex: number) => {
    cleanupTimers(); // Clear any existing timeout
    navigator.clipboard.writeText(text);
    setCopiedInfo({ fileIndex, qrIndex });
    copiedTimeoutRef.current = setTimeout(() => setCopiedInfo(null), 2000);
  };

  const handleExport = () => {
    exportToCsv(results);
  };

  // QR Generation handlers
  const handleGenerateQR = async (data: QRGenerationData) => {
    try {
      const generatedQR = await createGeneratedQR(data);
      setGeneratedQRs(prev => [generatedQR, ...prev]);
      setShowGenerationForm(false);
    } catch (error) {
      if (IS_DEVELOPMENT) {
        console.error('Failed to generate QR code:', error);
      }
      // You could add error state here if needed
    }
  };

  const handleDeleteGeneratedQR = (id: string) => {
    setGeneratedQRs(prev => prev.filter(qr => qr.id !== id));
  };

  const handleCopyGeneratedQR = (data: string, id: string) => {
    cleanupTimers(); // Clear any existing timeout
    navigator.clipboard.writeText(data);
    setCopiedGeneratedId(id);
    generatedCopiedTimeoutRef.current = setTimeout(() => setCopiedGeneratedId(null), 2000);
  };

  // Enhanced processing status with metrics
  const renderProcessingStatus = () => {
    if (status !== 'processing' || !processingState) return null;

    return (
      <div className="text-center flex flex-col items-center justify-center h-full">
        <ProcessingStatus 
          processingState={processingState}
          results={results}
          elapsedTime={elapsedTime}
        />
      </div>
    );
  };
            

  // Enhanced results display with metrics
  const renderResults = () => {
    if (status !== 'results') return null;

    // Handle empty results case
    if (resultStats.filteredResults.length === 0) {
      return (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🔍</div>
          <h3 className="text-xl font-semibold text-white mb-2">No Results</h3>
          <p className="text-slate-400 mb-6">No files were processed. Please try uploading some files.</p>
          <button
            onClick={resetState}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg transition-colors"
          >
            Upload Files
          </button>
        </div>
      );
    }

    const totalQRs = resultStats.totalQRs;
    const successfulFiles = resultStats.successfulFiles;
    const totalFiles = resultStats.totalFiles;

    return (
      <div className="space-y-6">
        {/* Performance Metrics */}
        {processingMetrics && (
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-xl p-6 border border-slate-600">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              Processing Complete - Advanced QR Detection Report
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-indigo-400">{totalFiles}</div>
                <div className="text-xs text-slate-400">Files Processed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{processingMetrics.pagesProcessed || 0}</div>
                <div className="text-xs text-slate-400">Pages Scanned</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-400">{totalQRs}</div>
                <div className="text-xs text-slate-400">QR Codes Found</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">
                  {(processingMetrics.totalProcessingTime / 1000).toFixed(1)}s
                </div>
                <div className="text-xs text-slate-400">Total Time</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">
                  {(processingMetrics.averageProcessingTime / 1000).toFixed(1)}s
                </div>
                <div className="text-xs text-slate-400">Avg per File</div>
              </div>
            </div>
          </div>
        )}

        {/* Results Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white">
              Detection Results
            </h2>
            <p className="text-slate-400">
              Found {totalQRs} QR code{totalQRs !== 1 ? 's' : ''} in {successfulFiles} of {totalFiles} file{totalFiles !== 1 ? 's' : ''} • {elapsedTime}s processing time
            </p>
          </div>
          <div className="flex gap-2">
            {totalQRs > 0 && (
              <button
                onClick={handleExport}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            )}
            <button
              onClick={resetState}
              className="flex items-center gap-2 bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Scan More Files
            </button>
          </div>
        </div>

        {/* Results List */}
        <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
          {resultStats.filteredResults.map((result, fileIndex) => {
            // Skip individual page results - they should be merged into parent PDF
            if (result.pageNumber && result.parentFileName) {
              return null;
            }

            // Create a unique key that won't conflict
            const uniqueKey = `result-${result.fileName}-${fileIndex}-${result.qrs.length}`;

            return (
              <div key={uniqueKey} className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${
                      result.status === 'success' ? 'bg-green-500' :
                      result.status === 'no_qr_found' ? 'bg-yellow-500' : 'bg-red-500'
                    }`}></div>
                    <div>
                      <h3 className="font-semibold text-white break-words">{result.fileName}</h3>
                      <p className="text-sm text-slate-400">
                        {result.status === 'success' ? 
                          `${result.qrs.length} QR code${result.qrs.length !== 1 ? 's' : ''} found` :
                         result.status === 'no_qr_found' ? 'No QR codes detected' :
                         `Error: ${result.error || 'Unknown error'}`}
                      </p>
                    </div>
                  </div>
                  {result.qrs.length > 0 && (
                    <div className="text-sm text-slate-500 flex-shrink-0">
                      {result.qrs.length} code{result.qrs.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>

                {result.qrs.length > 0 && (
                  <div className="space-y-3">
                    {result.qrs.map((qr, qrIndex) => {
                      // Create unique key for QR codes to prevent conflicts
                      const qrKey = `qr-${uniqueKey}-${qrIndex}-${qr.page}-${qr.data.length}`;
                      
                      return (
                        <div key={qrKey} className="bg-slate-700 rounded-lg p-4">
                          <div className="flex justify-between items-start gap-4">
                            <div className="flex-1 min-w-0"> {/* min-w-0 for text truncation */}
                              <div className="flex items-center gap-2 mb-2">
                                <QrCode className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                                <span className="text-sm font-medium text-slate-300">
                                  {result.fileName.toLowerCase().endsWith('.pdf') ? `Page ${qr.page}` : 'QR Code'}
                                </span>
                              </div>
                              <div className="bg-slate-900 rounded p-3 font-mono text-sm text-slate-200 break-all">
                                {parseQRData(qr.data)}
                              </div>
                            </div>
                            <button
                              onClick={() => handleCopy(qr.data, fileIndex, qrIndex)}
                              className="flex items-center gap-1 px-3 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors flex-shrink-0"
                              aria-label={`Copy QR code data from page ${qr.page}`}
                            >
                              {copiedInfo?.fileIndex === fileIndex && copiedInfo?.qrIndex === qrIndex ? (
                                <><Check className="w-4 h-4" /> Copied</>
                              ) : (
                                <><Copy className="w-4 h-4" /> Copy</>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Show helpful message for files with no QR codes */}
                {result.status === 'no_qr_found' && (
                  <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3 text-center">
                    <p className="text-yellow-200 text-sm">
                      No QR codes were detected in this file. Make sure QR codes are clear and well-lit.
                    </p>
                  </div>
                )}

                {/* Show error details */}
                {result.status === 'error' && (
                  <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
                    <p className="text-red-200 text-sm font-mono break-words">{result.error || 'Unknown error occurred'}</p>
                  </div>
                )}
              </div>
            );
          }).filter(Boolean)} {/* Remove null entries */}
        </div>

        {/* Show summary if no valid results */}
        {resultStats.filteredResults.length === 0 && (
          <div className="text-center py-8">
            <p className="text-slate-400">All results have been processed and merged.</p>
          </div>
        )}
      </div>
    );
  };

  const formatTime = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const paddedMinutes = String(minutes).padStart(2, '0');
    const paddedSeconds = String(seconds).padStart(2, '0');

    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${paddedMinutes}:${paddedSeconds}`;
    }
    return `${paddedMinutes}:${paddedSeconds}`;
  };

  const renderContent = () => {
    switch (status) {
      case 'processing':
        return (
          <div className="text-center flex flex-col items-center justify-center h-full">
            {renderProcessingStatus()}
          </div>
        );
      case 'results':
        return renderResults();
      case 'idle':
      default:
        return (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragEvents}
            onDragEnter={handleDragEvents}
            onDragLeave={handleDragEvents}
            className={`relative block w-full rounded-lg border-2 border-dashed p-12 text-center transition-colors ${isDragging ? 'border-indigo-500 bg-slate-800/50' : 'border-slate-700 hover:border-slate-500'}`}
          >
            <input {...{
              id: "file-upload",
              name: "file-upload",
              type: "file",
              className: "sr-only",
              accept: ".pdf,image/png,image/jpeg,image/webp",
              onChange: handleFileChange,
              multiple: true
            }} />
            <label htmlFor="file-upload" className="cursor-pointer">
              <UploadCloud className="mx-auto h-12 w-12 text-slate-500" />
              <span className="mt-2 block text-lg font-semibold text-white">
                Drop PDF or image files here or click to upload
              </span>
              <span className="mt-1 block text-sm text-slate-400">
                Supports bulk uploads of PDF, PNG, JPG, and WEBP files.
              </span>
            </label>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 font-sans flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-6xl mx-auto">
        <header className="text-center mb-8">
            <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl md:text-6xl">
                PDF & Image <span className="text-indigo-400">QR Tools</span>
            </h1>
            <p className="mt-3 max-w-2xl mx-auto text-base text-slate-400 sm:text-lg md:mt-5 md:text-xl">
                Decode QR codes from files and generate new QR codes for your content.
            </p>
        </header>

        {/* Tab Navigation */}
        <div className="flex justify-center mb-8">
          <div className="bg-slate-800/50 rounded-lg p-1 border border-slate-700">
            <button
              onClick={() => setActiveTab('decoder')}
              className={`px-6 py-2 rounded-md font-medium transition-all ${
                activeTab === 'decoder'
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              QR Decoder
            </button>
            <button
              onClick={() => setActiveTab('generator')}
              className={`px-6 py-2 rounded-md font-medium transition-all ${
                activeTab === 'generator'
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              QR Generator
            </button>
          </div>
        </div>

        <main className="bg-slate-800/50 rounded-xl shadow-2xl p-6 sm:p-8 border border-slate-700 backdrop-blur-sm">
          {activeTab === 'decoder' ? (
            renderContent()
          ) : (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-indigo-400">QR Code Generator</h2>
                <button
                  onClick={() => setShowGenerationForm(true)}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  Generate QR Code
                </button>
              </div>
              <GeneratedQRsView
                qrs={generatedQRs}
                onDelete={handleDeleteGeneratedQR}
                copiedId={copiedGeneratedId}
                onCopy={handleCopyGeneratedQR}
              />
            </div>
          )}
        </main>
        
        <footer className="text-center mt-8 text-sm text-slate-500">
            <p>Your files are processed entirely in your browser and are never uploaded to a server.</p>
        </footer>
      </div>

      {/* QR Generation Form Modal */}
      {showGenerationForm && (
        <QRGenerationForm
          onGenerate={handleGenerateQR}
          onClose={() => setShowGenerationForm(false)}
        />
      )}
    </div>
  );
};

export default App;