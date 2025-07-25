# PDF & Image QR Code Decoder

This is a client-side web application that allows you to quickly and securely decode QR codes from PDF and various image files. All processing is done directly in your browser, ensuring your files are never uploaded to a server.

## Features

- **Decode QR Codes:** Extract QR code data from PDF, PNG, JPG, and WEBP files.
- **Bulk Uploads:** Process multiple files at once.
- **Advanced Scanning:** Utilizes techniques like image binarization and multi-pass scanning to find QR codes even in complex or low-contrast images/PDFs.
- **Responsive UI:** A smooth user experience with a non-blocking interface, even during heavy processing, thanks to Web Workers.
- **Smart Data Display:** Automatically formats common QR code data (URLs, emails, phone numbers, Wi-Fi credentials) into interactive elements.
- **Export Results:** Download all decoded QR code data as a CSV file.
- **Privacy-Focused:** All file processing occurs client-side; no data leaves your browser.

## Technologies Used

- **React:** Frontend library for building the user interface.
- **TypeScript:** For type-safe JavaScript development.
- **Vite:** A fast build tool for modern web projects.
- **Tailwind CSS:** A utility-first CSS framework for styling.
- **`pdfjs-dist`:** For rendering PDF documents in the browser.
- **`jsqr`:** A pure JavaScript QR code reader.
- **Web Workers:** For offloading heavy computational tasks to background threads, keeping the UI responsive.

## Getting Started

Follow these steps to set up and run the project locally.

### Prerequisites

- Node.js (v18 or higher recommended)
- npm (Node Package Manager)

### Installation

1.  **Clone the repository (if you haven't already):**

    ```bash
    git clone https://github.com/Kanantorn/pdf-image_qr_code_decoder.git
    cd pdf-image_qr_code_decoder
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

### Running the Application

To start the development server:

```bash
npm run dev
```

This will usually open the application in your browser at `http://localhost:5173` (or another available port).

### Building for Production

To create a production-ready build:

```bash
npm run build
```

The build artifacts will be placed in the `dist/` directory.

### Previewing the Production Build

To preview the built application locally:

```bash
npm run preview
```

## Project Structure

-   `public/`: Static assets.
-   `src/`: Application source code.
    -   `App.tsx`: Main React component and application logic.
    -   `index.html`: Main HTML file.
    -   `index.css`: Tailwind CSS entry point.
    -   `components/`: Reusable React UI components (e.g., icons, spinner).
    -   `services/`: Core logic and utilities.
        -   `qrWorker.ts`: Web Worker for background QR code scanning.
        -   `export.ts`: CSV export functionality.
        -   `qrParser.tsx`: Smart QR code data parsing and formatting.
    -   `types.ts`: TypeScript type definitions.
-   `vite.config.ts`: Vite build configuration.
-   `tailwind.config.js`: Tailwind CSS configuration.
-   `postcss.config.js`: PostCSS configuration.

## License

This project is licensed under the MIT License.
