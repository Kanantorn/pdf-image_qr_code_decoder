import React, { useState, useEffect, useCallback, useRef } from 'react';
import { QRGenerationData, WiFiCredentials } from '../types';
import { Type, Globe, Mail, Phone, Wifi, X, Download, Copy, Check, Eye, EyeOff } from './icons';
import { generateQRCode } from '../services/qrGenerator';

interface QRGenerationFormProps {
  onGenerate: (data: QRGenerationData) => void;
  onClose: () => void;
}

interface QRSettings {
  foregroundColor: string;
  backgroundColor: string;
  size: number;
  margin: number;
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H';
  quality: 'low' | 'medium' | 'high';
}

export const QRGenerationForm: React.FC<QRGenerationFormProps> = ({ onGenerate, onClose }) => {
  const [selectedType, setSelectedType] = useState<'text' | 'url' | 'email' | 'phone' | 'wifi'>('text');
  const [textContent, setTextContent] = useState('');
  const [urlContent, setUrlContent] = useState('');
  const [emailContent, setEmailContent] = useState('');
  const [phoneContent, setPhoneContent] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const [currentQRCode, setCurrentQRCode] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [wifiCredentials, setWifiCredentials] = useState<WiFiCredentials>({
    ssid: '',
    password: '',
    security: 'WPA',
    hidden: false
  });

  const [qrSettings, setQRSettings] = useState<QRSettings>({
    foregroundColor: '#000000',
    backgroundColor: '#ffffff',
    size: 768,
    margin: 2,
    errorCorrectionLevel: 'M',
    quality: 'high'
  });

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const qrTypes = [
    { type: 'text' as const, label: 'Text', icon: Type, description: 'Plain text content' },
    { type: 'url' as const, label: 'Link', icon: Globe, description: 'Website links' },
    { type: 'email' as const, label: 'Email', icon: Mail, description: 'Email addresses' },
    { type: 'phone' as const, label: 'Phone', icon: Phone, description: 'Phone numbers' },
    { type: 'wifi' as const, label: 'Wi-Fi', icon: Wifi, description: 'WiFi credentials' }
  ];

  const getCurrentContent = useCallback(() => {
    switch (selectedType) {
      case 'text': return textContent;
      case 'url': return urlContent;
      case 'email': return emailContent;
      case 'phone': return phoneContent;
      case 'wifi': return wifiCredentials.ssid;
      default: return '';
    }
  }, [selectedType, textContent, urlContent, emailContent, phoneContent, wifiCredentials.ssid]);

  const generatePreviewQR = useCallback(async () => {
    const content = getCurrentContent();
    if (!content.trim()) {
      setCurrentQRCode('');
      return;
    }

    setIsGenerating(true);
    try {
      const qrData: QRGenerationData = {
        type: selectedType,
        content: selectedType === 'wifi' ? JSON.stringify(wifiCredentials) : content,
        displayName: displayName.trim() || undefined
      };

      // Use enhanced QR generation with custom settings
      const qrDataUrl = await generateQRCodeWithSettings(qrData, qrSettings);
      setCurrentQRCode(qrDataUrl);
    } catch (error) {
      console.error('Failed to generate QR preview:', error);
      setCurrentQRCode('');
    } finally {
      setIsGenerating(false);
    }
  }, [selectedType, getCurrentContent, displayName, wifiCredentials, qrSettings]);

  // Debounced QR generation
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      if (showPreview) {
        generatePreviewQR();
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [generatePreviewQR, showPreview]);

  const generateQRCodeWithSettings = async (data: QRGenerationData, settings: QRSettings): Promise<string> => {
    let qrData = '';
    
    switch (data.type) {
      case 'text':
        qrData = data.content;
        break;
      case 'url':
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

    const QRCode = (await import('qrcode')).default;
    const qrDataUrl = await QRCode.toDataURL(qrData, {
      width: settings.size,
      margin: settings.margin,
      color: {
        dark: settings.foregroundColor,
        light: settings.backgroundColor
      },
      errorCorrectionLevel: settings.errorCorrectionLevel
    });
    return qrDataUrl;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    let content = '';
    switch (selectedType) {
      case 'text':
        content = textContent;
        break;
      case 'url':
        content = urlContent;
        break;
      case 'email':
        content = emailContent;
        break;
      case 'phone':
        content = phoneContent;
        break;
      case 'wifi':
        content = JSON.stringify(wifiCredentials);
        break;
    }

    if (!content.trim() || (selectedType === 'wifi' && !wifiCredentials.ssid.trim())) {
      return;
    }

    onGenerate({
      type: selectedType,
      content,
      displayName: displayName.trim() || undefined
    });

    // Reset form
    setTextContent('');
    setUrlContent('');
    setEmailContent('');
    setPhoneContent('');
    setDisplayName('');
    setWifiCredentials({ ssid: '', password: '', security: 'WPA', hidden: false });
    setCurrentQRCode('');
  };

  const isFormValid = () => {
    const content = getCurrentContent();
    return content.trim().length > 0;
  };

  const handleCopyQR = async () => {
    if (!currentQRCode) return;
    
    try {
      const response = await fetch(currentQRCode);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy QR code:', error);
    }
  };

  const handleDownloadQR = () => {
    if (!currentQRCode) return;
    
    const link = document.createElement('a');
    link.href = currentQRCode;
    link.download = `qr-${selectedType}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-6xl border border-slate-700 max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white">Generate QR Code</h2>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-slate-700 transition-colors text-slate-300"
            >
              {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showPreview ? 'Hide Result' : 'Show Result'}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-md hover:bg-slate-700 transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        <div className="flex h-full max-h-[calc(90vh-80px)]">
          {/* Left Panel - Form */}
          <div className="w-1/2 p-6 overflow-y-auto border-r border-slate-700">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Type Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">Choose Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {qrTypes.map(({ type, label, icon: Icon }) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setSelectedType(type)}
                      className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${
                        selectedType === type
                          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                          : 'border-slate-600 hover:border-slate-500 text-slate-400'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Content Input */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Content</label>
                
                {selectedType === 'text' && (
                  <textarea
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    placeholder="Input Content"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                    rows={4}
                    maxLength={500}
                  />
                )}

                {selectedType === 'url' && (
                  <input
                    type="url"
                    value={urlContent}
                    onChange={(e) => setUrlContent(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                )}

                {selectedType === 'email' && (
                  <input
                    type="email"
                    value={emailContent}
                    onChange={(e) => setEmailContent(e.target.value)}
                    placeholder="example@email.com"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                )}

                {selectedType === 'phone' && (
                  <input
                    type="tel"
                    value={phoneContent}
                    onChange={(e) => setPhoneContent(e.target.value)}
                    placeholder="+1-555-123-4567"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                )}

                {selectedType === 'wifi' && (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={wifiCredentials.ssid}
                      onChange={(e) => setWifiCredentials(prev => ({ ...prev, ssid: e.target.value }))}
                      placeholder="Network name (SSID)"
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={wifiCredentials.password}
                        onChange={(e) => setWifiCredentials(prev => ({ ...prev, password: e.target.value }))}
                        placeholder="Password"
                        className="w-full px-3 py-2 pr-10 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-300"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="flex gap-4">
                      <select
                        value={wifiCredentials.security}
                        onChange={(e) => setWifiCredentials(prev => ({ ...prev, security: e.target.value as 'WPA' | 'WEP' | 'nopass' }))}
                        className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      >
                        <option value="WPA">WPA/WPA2</option>
                        <option value="WEP">WEP</option>
                        <option value="nopass">No Password</option>
                      </select>
                      <label className="flex items-center gap-2 text-slate-300">
                        <input
                          type="checkbox"
                          checked={wifiCredentials.hidden}
                          onChange={(e) => setWifiCredentials(prev => ({ ...prev, hidden: e.target.checked }))}
                          className="rounded bg-slate-700 border-slate-600 text-indigo-600 focus:ring-indigo-500"
                        />
                        Hidden
                      </label>
                    </div>
                  </div>
                )}

                {/* Character count for text */}
                {selectedType === 'text' && (
                  <div className="text-right text-xs text-slate-400 mt-1">
                    {textContent.length}/500
                  </div>
                )}
              </div>

              {/* General Settings */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-slate-300">General Setting</h3>
                
                {/* Colors */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Color</span>
                    <div className="flex gap-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={qrSettings.foregroundColor}
                          onChange={(e) => setQRSettings(prev => ({ ...prev, foregroundColor: e.target.value }))}
                          className="w-8 h-8 rounded border border-slate-600"
                        />
                        <input
                          type="text"
                          value={qrSettings.foregroundColor}
                          onChange={(e) => setQRSettings(prev => ({ ...prev, foregroundColor: e.target.value }))}
                          className="w-20 px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-white"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={qrSettings.backgroundColor}
                          onChange={(e) => setQRSettings(prev => ({ ...prev, backgroundColor: e.target.value }))}
                          className="w-8 h-8 rounded border border-slate-600"
                        />
                        <input
                          type="text"
                          value={qrSettings.backgroundColor}
                          onChange={(e) => setQRSettings(prev => ({ ...prev, backgroundColor: e.target.value }))}
                          className="w-20 px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Space/Margin */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Space</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="10"
                        value={qrSettings.margin}
                        onChange={(e) => setQRSettings(prev => ({ ...prev, margin: parseInt(e.target.value) }))}
                        className="flex-1 max-w-32"
                      />
                      <span className="text-xs text-slate-400 w-8">{qrSettings.margin}%</span>
                    </div>
                  </div>

                  {/* Image Size */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Image Size</span>
                    <select
                      value={qrSettings.size}
                      onChange={(e) => setQRSettings(prev => ({ ...prev, size: parseInt(e.target.value) }))}
                      className="px-3 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                    >
                      <option value={256}>256x256</option>
                      <option value={512}>512x512</option>
                      <option value={768}>768x768</option>
                      <option value={1024}>1024x1024</option>
                    </select>
                  </div>

                  {/* Quality */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Quality</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Low Quality</span>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        value={qrSettings.quality === 'low' ? 0 : qrSettings.quality === 'medium' ? 1 : 2}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          const quality = val === 0 ? 'low' : val === 1 ? 'medium' : 'high';
                          setQRSettings(prev => ({ ...prev, quality }));
                        }}
                        className="flex-1 max-w-32"
                      />
                      <span className="text-xs text-slate-400">High Quality</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!isFormValid()}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors"
              >
                Generate QR Code
              </button>
            </form>
          </div>

          {/* Right Panel - Preview */}
          {showPreview && (
            <div className="w-1/2 p-6 flex flex-col items-center justify-center bg-slate-900/50">
              <div className="text-center">
                <h3 className="text-lg font-semibold text-white mb-4">Your QR code</h3>
                
                {isGenerating ? (
                  <div className="w-64 h-64 flex items-center justify-center bg-slate-700 rounded-lg">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                  </div>
                ) : currentQRCode ? (
                  <div className="space-y-4">
                    <div className="bg-white p-4 rounded-lg inline-block">
                      <img 
                        src={currentQRCode} 
                        alt="Generated QR Code" 
                        className="w-64 h-64 object-contain"
                      />
                    </div>
                    
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={handleCopyQR}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                      >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                      
                      <button
                        onClick={handleDownloadQR}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="w-64 h-64 flex items-center justify-center bg-slate-700 rounded-lg border-2 border-dashed border-slate-600">
                    <div className="text-center text-slate-400">
                      <div className="w-16 h-16 mx-auto mb-2 opacity-50">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path d="M3 11v8h8v-8H3zm2 2h4v4H5v-4zm8-10v8h8V3h-8zm2 2h4v4h-4V5zM3 3v8h8V3H3zm2 2h4v4H5V5zm11 11h3v3h-3v-3zm0 5h3v3h-3v-3zm-5-5h3v3h-3v-3z"/>
                        </svg>
                      </div>
                      <p className="text-sm">Enter content to generate QR code</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};