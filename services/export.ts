import { DecodedFileResult } from '../types';

export const exportToCsv = (results: DecodedFileResult[]): void => {
    const headers = ['File Name', 'Page', 'QR Code Data'];
    const rows = results.flatMap(result => {
        if (result.status === 'success') {
            return result.qrs.map(qr => [
                `"${result.fileName.replace(/"/g, '""')}"`,
                qr.page,
                `"${qr.data.replace(/"/g, '""')}"`
            ]);
        }
        return [];
    });

    if (rows.length === 0) {
        console.warn('No successful results to export');
        return;
    }

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    try {
        link.href = url;
        link.download = `qr-code-export-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } finally {
        // Always clean up URL to prevent memory leaks
        URL.revokeObjectURL(url);
    }
}; 