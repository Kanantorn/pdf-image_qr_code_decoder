import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      define: {
        'process.env.NODE_ENV': JSON.stringify(mode),
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        // Optimize bundle size
        rollupOptions: {
          output: {
            manualChunks: {
              // Separate large dependencies into their own chunks
              'pdfjs': ['pdfjs-dist'],
              'qr-libs': ['jsqr', 'qrcode'],
              'vendor': ['react', 'react-dom']
            }
          }
        },
        // Increase chunk size warning limit since we have large PDF.js
        chunkSizeWarningLimit: 2000,
        // Enable source maps for development
        sourcemap: mode === 'development',
        // Optimize for production
        minify: mode === 'production' ? 'terser' : false,
        terserOptions: mode === 'production' ? {
          compress: {
            drop_console: true, // Remove console logs in production
            drop_debugger: true,
          }
        } : undefined
      },
      optimizeDeps: {
        // Pre-bundle these dependencies
        include: ['react', 'react-dom', 'jsqr'],
        exclude: ['pdfjs-dist'] // Let pdfjs handle its own loading
      },
      worker: {
        // Optimize worker builds
        format: 'es',
        rollupOptions: {
          output: {
            format: 'es'
          }
        }
      }
    };
});
