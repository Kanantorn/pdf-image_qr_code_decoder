import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  
  // New generator state
  const [activeTab, setActiveTab] = useState<ActiveTab>('decoder');
  const [generatedQRs, setGeneratedQRs] = useState<GeneratedQR[]>([]);
  const [showGenerationForm, setShowGenerationForm] = useState(false);
  const [copiedGeneratedId, setCopiedGeneratedId] = useState<string | null>(null);

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
          if (timerRef.current) clearInterval(timerRef.current);
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
          console.error('Worker error:', payload);
          // Add error result to display
          setResults(prev => [...prev, {
            fileName: payload.fileName || 'Unknown File',
            status: 'error',
            qrs: [],
            error: payload.message
          }]);
          break;
          
        default:
          console.warn('Unknown worker message type:', type);
      }
    };

    workerRef.current.addEventListener('message', handleWorkerMessage);

    return () => {
      workerRef.current?.removeEventListener('message', handleWorkerMessage);
      workerRef.current?.terminate();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []); // Keep empty dependency array but fix the stale closure issue

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
      console.log(`Processing PDF: ${file.name} (${totalPages} pages)`);
      
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
              console.error(`Failed to get context for page ${pageNum}`);
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

            console.log(`Rendering page ${pageNum}/${totalPages} at ${scale}x scale (${viewport.width}x${viewport.height})`);
            
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
            console.error(`Error processing page ${pageNum}:`, error);
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
      console.error(`Failed to process PDF ${file.name}:`, error);
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
    if (timerRef.current) clearInterval(timerRef.current);
    setStatus('idle');
    setResults([]);
    setProcessingState(null);
    setCopiedInfo(null);
    setElapsedTime(0);
    setProcessingMetrics(null);
  };

  const handleCopy = (text: string, fileIndex: number, qrIndex: number) => {
    navigator.clipboard.writeText(text);
    setCopiedInfo({ fileIndex, qrIndex });
    setTimeout(() => setCopiedInfo(null), 2000);
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
      console.error('Failed to generate QR code:', error);
      // You could add error state here if needed
    }
  };

  const handleDeleteGeneratedQR = (id: string) => {
    setGeneratedQRs(prev => prev.filter(qr => qr.id !== id));
  };

  const handleCopyGeneratedQR = (data: string, id: string) => {
    navigator.clipboard.writeText(data);
    setCopiedGeneratedId(id);
    setTimeout(() => setCopiedGeneratedId(null), 2000);
  };

  // Enhanced processing status with metrics
  const renderProcessingStatus = () => {
    if (status !== 'processing' || !processingState) return null;

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
            <p className="text-xs text-slate-500 mt-1">
              Strategy: {processingState.strategy || 'Standard Processing'}
            </p>
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg p-4">
          <div className="flex justify-between text-sm text-slate-400 mb-2">
            <span>Files: {processingState.current} / {processingState.total}</span>
            <span>{elapsedTime}s elapsed</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-indigo-600 to-purple-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(processingState.current / processingState.total) * 100}%` }}
            ></div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-lg font-bold text-indigo-400">
              {results.reduce((sum, r) => sum + r.qrs.length, 0)}
            </div>
            <div className="text-xs text-slate-500">QR Codes Found</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-lg font-bold text-green-400">
              {results.filter(r => r.status === 'success').length}
            </div>
            <div className="text-xs text-slate-500">Successful Scans</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-lg font-bold text-yellow-400">
              {processingState.totalPages || 0}
            </div>
            <div className="text-xs text-slate-500">Pages Processed</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-lg font-bold text-purple-400">
              {Math.round((processingState.current / processingState.total) * 100)}%
            </div>
            <div className="text-xs text-slate-500">Completion</div>
          </div>
        </div>
      </div>
    );
  };

  // Enhanced results display with metrics
  const renderResults = () => {
    if (status !== 'results' || results.length === 0) return null;

    const totalQRs = results.reduce((sum, file) => sum + file.qrs.length, 0);
    const successfulFiles = results.filter(file => file.status === 'success').length;

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
                <div className="text-2xl font-bold text-indigo-400">{processingMetrics.filesProcessed}</div>
                <div className="text-xs text-slate-400">Files Processed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{processingMetrics.pagesProcessed}</div>
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
              Found {totalQRs} QR codes in {successfulFiles} files • {elapsedTime}s processing time
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <button
              onClick={resetState}
              className="flex items-center gap-2 bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Scan More Files
            </button>
          </div>
        </div>

        {/* Results List */}
        <div className="space-y-4">
          {results.map((result, fileIndex) => (
            <div key={fileIndex} className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${
                    result.status === 'success' ? 'bg-green-500' :
                    result.status === 'no_qr_found' ? 'bg-yellow-500' : 'bg-red-500'
                  }`}></div>
                  <div>
                    <h3 className="font-semibold text-white">{result.fileName}</h3>
                    <p className="text-sm text-slate-400">
                      {result.status === 'success' ? `${result.qrs.length} QR code(s) found` :
                       result.status === 'no_qr_found' ? 'No QR codes detected' :
                       `Error: ${result.error}`}
                    </p>
                  </div>
                </div>
                {result.qrs.length > 0 && (
                  <div className="text-sm text-slate-500">
                    {result.qrs.length} code{result.qrs.length !== 1 ? 's' : ''}
                  </div>
                )}
              </div>

              {result.qrs.length > 0 && (
                <div className="space-y-3">
                  {result.qrs.map((qr, qrIndex) => (
                    <div key={qrIndex} className="bg-slate-700 rounded-lg p-4">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <QrCode className="w-4 h-4 text-indigo-400" />
                            <span className="text-sm font-medium text-slate-300">
                              Page {qr.page}
                            </span>
                          </div>
                          <div className="bg-slate-900 rounded p-3 font-mono text-sm text-slate-200 break-all">
                            {parseQRData(qr.data)}
                          </div>
                        </div>
                        <button
                          onClick={() => handleCopy(qr.data, fileIndex, qrIndex)}
                          className="flex items-center gap-1 px-3 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors flex-shrink-0"
                        >
                          {copiedInfo?.fileIndex === fileIndex && copiedInfo?.qrIndex === qrIndex ? (
                            <><Check className="w-4 h-4" /> Copied</>
                          ) : (
                            <><Copy className="w-4 h-4" /> Copy</>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
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