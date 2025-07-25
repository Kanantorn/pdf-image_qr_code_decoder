import { DecodedFileResult } from '../types';

export const exportToCsv = (results: DecodedFileResult[]) => {
    const headers = ['File Name', 'Page', 'QR Code Data'];
    const rows = results.flatMap(result => {
        if (result.status === 'success') {
            return result.qrs.map(qr => [
                `"${result.fileName}"`,
                qr.page,
                `"${qr.data.replace(/"/g, '""')}"`
            ]);
        }
        return [];
    });

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.href) {
        URL.revokeObjectURL(link.href);
    }
    link.href = URL.createObjectURL(blob);
    link.download = `qr-code-export-${new Date().toISOString()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}; 