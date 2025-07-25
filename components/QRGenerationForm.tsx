import React, { useState } from 'react';
import { QRGenerationData, WiFiCredentials } from '../types';
import { Type, Globe, Mail, Phone, Wifi, X } from './icons';

interface QRGenerationFormProps {
  onGenerate: (data: QRGenerationData) => void;
  onClose: () => void;
}

export const QRGenerationForm: React.FC<QRGenerationFormProps> = ({ onGenerate, onClose }) => {
  const [selectedType, setSelectedType] = useState<'text' | 'url' | 'email' | 'phone' | 'wifi'>('text');
  const [textContent, setTextContent] = useState('');
  const [urlContent, setUrlContent] = useState('');
  const [emailContent, setEmailContent] = useState('');
  const [phoneContent, setPhoneContent] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [wifiCredentials, setWifiCredentials] = useState<WiFiCredentials>({
    ssid: '',
    password: '',
    security: 'WPA',
    hidden: false
  });

  const qrTypes = [
    { type: 'text' as const, label: 'Text', icon: Type, description: 'Plain text content' },
    { type: 'url' as const, label: 'URL', icon: Globe, description: 'Website links' },
    { type: 'email' as const, label: 'Email', icon: Mail, description: 'Email addresses' },
    { type: 'phone' as const, label: 'Phone', icon: Phone, description: 'Phone numbers' },
    { type: 'wifi' as const, label: 'WiFi', icon: Wifi, description: 'WiFi credentials' }
  ];

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
  };

  const getCurrentContent = () => {
    switch (selectedType) {
      case 'text': return textContent;
      case 'url': return urlContent;
      case 'email': return emailContent;
      case 'phone': return phoneContent;
      case 'wifi': return wifiCredentials.ssid;
      default: return '';
    }
  };

  const isFormValid = () => {
    const content = getCurrentContent();
    return content.trim().length > 0;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-md border border-slate-700">
        <div className="flex justify-between items-center p-6 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white">Generate QR Code</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Type Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-3">QR Code Type</label>
            <div className="grid grid-cols-2 gap-2">
              {qrTypes.map(({ type, label, icon: Icon, description }) => (
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
            <label className="block text-sm font-medium text-slate-300 mb-2">
              {qrTypes.find(t => t.type === selectedType)?.description}
            </label>
            
            {selectedType === 'text' && (
              <textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Enter your text content..."
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                rows={3}
                required
              />
            )}

            {selectedType === 'url' && (
              <input
                type="url"
                value={urlContent}
                onChange={(e) => setUrlContent(e.target.value)}
                placeholder="https://example.com"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              />
            )}

            {selectedType === 'email' && (
              <input
                type="email"
                value={emailContent}
                onChange={(e) => setEmailContent(e.target.value)}
                placeholder="example@email.com"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              />
            )}

            {selectedType === 'phone' && (
              <input
                type="tel"
                value={phoneContent}
                onChange={(e) => setPhoneContent(e.target.value)}
                placeholder="+1-555-123-4567"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
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
                  required
                />
                <input
                  type="password"
                  value={wifiCredentials.password}
                  onChange={(e) => setWifiCredentials(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Password"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
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
          </div>

          {/* Optional Display Name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Display Name <span className="text-slate-500">(optional)</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Custom name for this QR code"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
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
    </div>
  );
};