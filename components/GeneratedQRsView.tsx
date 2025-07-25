import React from 'react';
import { GeneratedQR } from '../types';
import { downloadQRCode, exportGeneratedQRsToCSV } from '../services/qrGenerator';
import { Download, Trash2, Copy, Check, Type, Globe, Mail, Phone, Wifi } from './icons';

interface GeneratedQRsViewProps {
  qrs: GeneratedQR[];
  onDelete: (id: string) => void;
  copiedId: string | null;
  onCopy: (data: string, id: string) => void;
}

export const GeneratedQRsView: React.FC<GeneratedQRsViewProps> = ({ 
  qrs, 
  onDelete, 
  copiedId, 
  onCopy 
}) => {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'text': return Type;
      case 'url': return Globe;
      case 'email': return Mail;
      case 'phone': return Phone;
      case 'wifi': return Wifi;
      default: return Type;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'text': return 'text-blue-400';
      case 'url': return 'text-green-400';
      case 'email': return 'text-yellow-400';
      case 'phone': return 'text-purple-400';
      case 'wifi': return 'text-indigo-400';
      default: return 'text-slate-400';
    }
  };

  const formatDisplayData = (qr: GeneratedQR): string => {
    if (qr.type === 'wifi') {
      try {
        const wifi = JSON.parse(qr.data);
        return `WiFi: ${wifi.ssid}`;
      } catch {
        return qr.displayName;
      }
    }
    return qr.data.length > 50 ? `${qr.data.substring(0, 50)}...` : qr.data;
  };

  if (qrs.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 bg-slate-700 rounded-full flex items-center justify-center">
          <Type className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-medium text-slate-300 mb-2">No QR Codes Generated</h3>
        <p className="text-slate-500">Your generated QR codes will appear here</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-indigo-400">Generated QR Codes</h2>
        {qrs.length > 0 && (
          <button 
            onClick={() => exportGeneratedQRsToCSV(qrs)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {qrs.map((qr) => {
          const IconComponent = getTypeIcon(qr.type);
          const typeColor = getTypeColor(qr.type);
          
          return (
            <div key={qr.id} className="bg-slate-900/50 rounded-lg border border-slate-700 overflow-hidden">
              {/* QR Code Image */}
              <div className="bg-white p-4 flex justify-center">
                <img 
                  src={qr.qrDataUrl} 
                  alt={`QR Code for ${qr.displayName}`}
                  className="w-32 h-32 object-contain"
                />
              </div>
              
              {/* QR Code Info */}
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <IconComponent className={`w-4 h-4 ${typeColor}`} />
                  <span className={`text-xs font-medium uppercase tracking-wide ${typeColor}`}>
                    {qr.type}
                  </span>
                </div>
                
                <h3 className="font-semibold text-slate-100 mb-1 truncate">
                  {qr.displayName}
                </h3>
                
                <p className="text-sm text-slate-400 mb-3 break-all">
                  {formatDisplayData(qr)}
                </p>
                
                <p className="text-xs text-slate-500 mb-4">
                  Created: {qr.createdAt.toLocaleDateString()} {qr.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => onCopy(qr.data, qr.id)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-md transition-colors text-sm"
                    title="Copy data to clipboard"
                  >
                    {copiedId === qr.id ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-slate-300" />
                    )}
                    Copy
                  </button>
                  
                  <button
                    onClick={() => downloadQRCode(qr)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors text-sm"
                    title="Download QR code image"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                  
                  <button
                    onClick={() => onDelete(qr.id)}
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                    title="Delete QR code"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};