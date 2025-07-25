import React from 'react';

export const parseQRData = (data: string): React.ReactNode => {
    if (data.startsWith('http://') || data.startsWith('https://')) {
        return <a href={data} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">{data}</a>;
    }
    if (data.startsWith('mailto:')) {
        const email = data.substring(7);
        return <a href={data} className="text-indigo-400 hover:underline">Email: {email}</a>;
    }
    if (data.startsWith('tel:')) {
        const phone = data.substring(4);
        return <a href={data} className="text-indigo-400 hover:underline">Call: {phone}</a>;
    }
    if (data.startsWith('WIFI:')) {
        const ssid = data.match(/S:([^;]+);/);
        const password = data.match(/P:([^;]+);/);
        return (
            <div>
                <p><strong>Wi-Fi Network</strong></p>
                <p><strong>SSID:</strong> {ssid ? ssid[1] : 'N/A'}</p>
                <p><strong>Password:</strong> {password ? password[1] : 'N/A'}</p>
            </div>
        );
    }
    return data;
}; 