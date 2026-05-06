import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        
        {/* PWA Meta Tags for iOS - CRITICAL for standalone mode */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="NeoChef" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-180x180.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1a1a2e" />
        
        {/* Icons */}
        <link href="https://unpkg.com/ionicons@7.1.0/dist/css/ionicons.min.css" rel="stylesheet" />
        <script src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.esm.js" type="module" />
        <script src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.js" noModule />
        
        {/* Critical CSS for iOS PWA Safe Areas */}
        <style dangerouslySetInnerHTML={{ __html: `
          /* iOS PWA Safe Area Fix */
          html, body {
            background-color: #1a1a2e !important;
            margin: 0;
            padding: 0;
            min-height: 100%;
            min-height: 100vh;
            min-height: -webkit-fill-available;
          }
          body {
            padding-top: env(safe-area-inset-top, 0px);
            padding-bottom: env(safe-area-inset-bottom, 0px);
            padding-left: env(safe-area-inset-left, 0px);
            padding-right: env(safe-area-inset-right, 0px);
            box-sizing: border-box;
            position: relative;
          }
          #root {
            min-height: 100%;
            background-color: #1a1a2e !important;
          }
          /* Force background to cover entire screen including safe areas */
          body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #1a1a2e;
            z-index: -1;
            pointer-events: none;
          }
          /* Prevent white flash */
          * {
            -webkit-tap-highlight-color: transparent;
          }
        `}} />
        
        {/* Service Worker Registration */}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js')
                .then(function(registration) {
                  console.log('SW registered:', registration.scope);
                })
                .catch(function(error) {
                  console.log('SW registration failed:', error);
                });
            });
          }
        `}} />
        
        <ScrollViewStyleReset />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
