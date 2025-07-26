# PDF & Image QR Code Tools

This is a comprehensive client-side web application that allows you to both decode QR codes from PDF and image files, and generate new QR codes for various data types. All processing is done directly in your browser, ensuring your files and data are never uploaded to a server.

## Features

### Super Advanced QR Code Decoder
- **Multi-Strategy Detection:** Employs 4 parallel detection strategies for maximum accuracy:
  - **Multi-Scale Analysis:** Tests different image scales (0.4x to 1.5x) for optimal QR detection
  - **Enhanced Preprocessing:** Gaussian blur, unsharp masking, adaptive histogram equalization, and morphological operations
  - **Advanced Binarization:** Otsu's method, adaptive thresholding (Bradley-Roth), and multiple threshold values
  - **Region-Based Scanning:** Divide-and-conquer approach with overlapping regions for comprehensive coverage
- **Enhanced PDF Processing:** 
  - **Adaptive Scaling:** Intelligent scaling based on page size and content density
  - **High-DPI Rendering:** Up to 5x scale for small content and 3x for standard pages
  - **Batch Processing:** Parallel page processing with memory management
  - **Multi-Page Support:** Seamless handling of PDFs with hundreds of pages
- **Advanced Image Enhancement:**
  - **Noise Reduction:** Gaussian filtering and morphological operations
  - **Edge Enhancement:** Unsharp masking for better QR code boundary detection
  - **Contrast Optimization:** Adaptive histogram equalization for challenging lighting conditions
  - **Automatic Upscaling:** Smart upscaling for small images below 2048px
- **Performance Optimization:**
  - **Web Workers:** Non-blocking parallel processing in background threads
  - **Priority Queue:** Intelligent task scheduling with PDF pages prioritized
  - **Memory Management:** Efficient resource cleanup and transferable objects
  - **Real-time Metrics:** Processing time, strategy effectiveness, and performance analytics
- **Comprehensive Results:** 
  - **Page-Level Tracking:** Precise page identification for multi-page PDFs
  - **Strategy Attribution:** Know which detection method found each QR code
  - **Performance Metrics:** Detailed processing statistics and timing information
  - **Smart Data Display:** Automatically formats URLs, emails, phone numbers, and Wi-Fi credentials
- **Export & Analytics:** Download results as CSV with detailed metadata and performance metrics

### Enhanced QR Code Generator
- **Real-time Generation:** QR codes are generated instantly as you type, providing immediate visual feedback.
- **Advanced Customization:** Full control over QR code appearance including:
  - **Custom Colors:** Choose foreground and background colors with color picker and hex input
  - **Size Options:** Multiple size presets (256x256 to 1024x1024)
  - **Quality Settings:** Adjustable quality levels from low to high
  - **Margin Control:** Fine-tune spacing around the QR code
- **Multiple Data Types:** Support for plain text, website links, email addresses, phone numbers, and Wi-Fi network credentials.
- **Modern UI:** Split-panel interface with live preview similar to professional design tools.
- **Enhanced Wi-Fi Setup:** Advanced Wi-Fi credential configuration with security options and hidden network support.
- **Quick Actions:** Copy QR codes to clipboard or download instantly from the preview panel.
- **Visual QR Management:** View, organize, and manage your generated QR codes with an intuitive interface.
- **Export Options:** Download individual QR codes as PNG images or export all generated codes to CSV.
- **Smart Formatting:** Automatic proper formatting for different data types (e.g., adding protocols to URLs).

### General Features
- **Privacy-Focused:** All file processing and QR generation occurs client-side; no data leaves your browser.
- **Tab-Based Interface:** Easy switching between decoding and generation modes.
- **Copy to Clipboard:** Quick data copying with visual feedback.
- **Responsive Design:** Works seamlessly on desktop and mobile devices.

## Technologies Used

- **React:** Frontend library for building the user interface.
- **TypeScript:** For type-safe JavaScript development.
- **Vite:** A fast build tool for modern web projects.
- **Tailwind CSS:** A utility-first CSS framework for styling.
- **`pdfjs-dist`:** For rendering PDF documents in the browser.
- **`jsqr`:** A pure JavaScript QR code reader.
- **`qrcode`:** A JavaScript QR code generator library.
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
    -   `components/`: Reusable React UI components.
        -   `icons.tsx`: SVG icon components collection.
        -   `Spinner.tsx`: Loading animation component.
        -   `QRGenerationForm.tsx`: QR code generation form component.
        -   `GeneratedQRsView.tsx`: Generated QR codes display component.
    -   `services/`: Core logic and utilities.
        -   `qrWorker.ts`: Web Worker for background QR code scanning.
        -   `qrGenerator.ts`: QR code generation service.
        -   `qrParser.tsx`: Smart QR code data parsing and formatting.
        -   `export.ts`: CSV export functionality.
    -   `types.ts`: TypeScript type definitions.
-   `vite.config.ts`: Vite build configuration.
-   `tailwind.config.js`: Tailwind CSS configuration.
-   `postcss.config.js`: PostCSS configuration.

## Usage

### QR Code Decoder
1. Click on the "QR Decoder" tab
2. Drag and drop files or click to upload PDF or image files (PNG, JPG, WEBP)
3. The application will process your files and display any found QR codes
4. Click the copy button to copy QR code data to clipboard
5. Use "Export to CSV" to download all results

### QR Code Generator
1. Click on the "QR Generator" tab
2. Click "Generate QR Code" to open the creation form
3. Select the type of data you want to encode:
   - **Text**: Plain text content
   - **URL**: Website links (automatically adds https:// if missing)
   - **Email**: Email addresses (creates mailto: links)
   - **Phone**: Phone numbers (creates tel: links)
   - **WiFi**: Network credentials with security settings
4. Fill in the required information
5. Optionally add a custom display name
6. Click "Generate QR Code" to create your QR code
7. View, download, copy, or delete generated QR codes from the gallery

## License

This project is licensed under the MIT License.
