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
type Status = 'idle' | 'processing' | 'results';
type ProcessingState = { total: number; current: number; currentFile: string; } | null;
type ActiveTab = 'decoder' | 'generator';

const App: React.FC = () => {
  // Existing decoder state
  const [results, setResults] = useState<DecodedFileResult[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [processingState, setProcessingState] = useState<ProcessingState>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [copiedInfo, setCopiedInfo] = useState<{fileIndex: number, qrIndex: number} | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const startTimeRef = useRef<number>(0);
  
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
        if (type === 'result') {
            setResults(prev => [...prev, payload]);
        } else if (type === 'complete') {
            if (timerRef.current) clearInterval(timerRef.current);
            setElapsedTime(Math.round((Date.now() - startTimeRef.current) / 1000));
            setStatus('results');
            setProcessingState(null);
        }
    };

    workerRef.current.addEventListener('message', handleWorkerMessage);

    // Cleanup on unmount
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (workerRef.current) {
        workerRef.current.removeEventListener('message', handleWorkerMessage);
        workerRef.current.terminate();
      }
    };
  }, []);
  
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

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    startTimeRef.current = Date.now();
    setElapsedTime(0);
    timerRef.current = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    setStatus('processing');
    setResults([]);
    const fileArray = Array.from(files);
    let filesProcessed = 0;

    setProcessingState({ total: fileArray.length, current: 0, currentFile: 'Starting scan...' });

    for (const file of fileArray) {
        setProcessingState(prev => ({ ...prev!, current: filesProcessed + 1, currentFile: `Scanning: ${file.name}` }));
        
        if (file.type.startsWith('image/')) {
            workerRef.current?.postMessage({ type: 'image', file });
        } else if (file.type === 'application/pdf') {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
                const pagePromises = [];

                for (let i = 1; i <= pdf.numPages; i++) {
                    pagePromises.push(pdf.getPage(i).then(async (page) => {
                        let scale = 5.0;
                        let viewport = page.getViewport({ scale });
                        const unscaledViewport = page.getViewport({ scale: 1.0 });

                        if (viewport.width > MAX_SCANNING_DIMENSION || viewport.height > MAX_SCANNING_DIMENSION) {
                            const scaleX = MAX_SCANNING_DIMENSION / unscaledViewport.width;
                            const scaleY = MAX_SCANNING_DIMENSION / unscaledViewport.height;
                            scale = Math.min(scale, scaleX, scaleY);
                            viewport = page.getViewport({ scale });
                        }

                        const canvas = document.createElement('canvas');
                        const context = canvas.getContext('2d');
                        canvas.width = Math.floor(viewport.width);
                        canvas.height = Math.floor(viewport.height);
                        if (!context) return null;

                        await page.render({ canvasContext: context, viewport: viewport }).promise;
                        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                        
                        // Transferable object for performance
                        workerRef.current?.postMessage({ type: 'imageData', imageData, pageNum: i }, [imageData.data.buffer]);
                        page.cleanup();
                        return true;
                    }));
                }
                
                await Promise.all(pagePromises);

                if (pdf.destroy) await pdf.destroy();

            } catch (e) {
                console.error(`Failed to process PDF ${file.name}`, e);
                const errorResult: DecodedFileResult = {
                    fileName: file.name,
                    status: 'error',
                    qrs: [],
                    error: e instanceof Error ? e.message : 'PDF processing failed'
                };
                setResults(prev => [...prev, errorResult]);
            }
        }
        
        filesProcessed++;
    }
    // This message signals the worker that all files have been processed
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

  const renderContent = () => {
    switch (status) {
      case 'processing':
        return (
          <div className="text-center flex flex-col items-center justify-center h-full">
            <Spinner />
            {processingState && (
                <>
                    <p className="mt-4 text-lg text-slate-300">
                        Processing file {processingState.current} of {processingState.total}
                    </p>
                    <p className="text-sm text-slate-400 truncate max-w-full px-4">{processingState.currentFile}</p>
                </>
            )}
            <p className="mt-2 text-sm text-indigo-400 font-mono">
                Elapsed Time: {formatTime(elapsedTime)}
            </p>
          </div>
        );
      case 'results':
        const totalQRs = results.reduce((sum, r) => sum + r.qrs.length, 0);
        const successfulFiles = results.filter(r => r.status === 'success').length;
        return (
          <div>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-indigo-400">Scan Complete</h2>
                <button 
                    onClick={handleExport}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors text-base"
                >
                    <Download className="w-5 h-5" />
                    Export to CSV
                </button>
            </div>
            <p className="text-center text-slate-400 mb-6">
              Found {totalQRs} QR Code(s) in {successfulFiles} of {results.length} file(s).
              <span className="block mt-1">Total time: {formatTime(elapsedTime)}</span>
            </p>
            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 -mr-4 custom-scrollbar">
              {results.map((result, fileIndex) => (
                <div key={fileIndex} className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                  <div className="flex items-center mb-3">
                     {result.status === 'error' ? 
                      <FileText className="w-5 h-5 text-red-400 mr-3 flex-shrink-0" /> :
                      result.status === 'success' ?
                      <QrCode className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" /> :
                      <FileText className="w-5 h-5 text-slate-500 mr-3 flex-shrink-0" />
                    }
                    <p className="font-semibold text-slate-100 truncate" title={result.fileName}>{result.fileName}</p>
                  </div>

                  {result.status === 'success' && (
                    <div className="space-y-3">
                      {result.qrs.map((qr, qrIndex) => (
                        <div key={qrIndex} className="bg-slate-800 rounded-md p-3 border border-slate-600/50">
                          <div className="flex justify-between items-start gap-4">
                            <div>
                              <p className="text-xs text-slate-400 mb-1">
                                {result.fileName.toLowerCase().endsWith('.pdf') && qr.page > 0 ? `Found on Page ${qr.page}` : 'QR Code Data'}
                              </p>
                              <div className="text-slate-100 font-mono break-all text-sm">
                                {parseQRData(qr.data)}
                              </div>
                            </div>
                            <button
                              onClick={() => handleCopy(qr.data, fileIndex, qrIndex)}
                              className="p-2 rounded-md bg-slate-700 hover:bg-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-shrink-0"
                              aria-label="Copy to clipboard"
                            >
                              {copiedInfo?.fileIndex === fileIndex && copiedInfo?.qrIndex === qrIndex 
                                ? <Check className="w-5 h-5 text-green-400" /> 
                                : <Copy className="w-5 h-5 text-slate-300" />}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {result.status === 'no_qr_found' && (
                    <p className="text-slate-400 text-center py-2 text-sm">No QR codes found in this file.</p>
                  )}
                  {result.status === 'error' && (
                     <div className="bg-red-900/30 text-red-300 border border-red-500/30 rounded-md p-3 text-sm font-mono">{result.error}</div>
                  )}
                </div>
              ))}
            </div>
            <button onClick={resetState} className="mt-8 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-colors text-base">
              Scan More Files
            </button>
          </div>
        );
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