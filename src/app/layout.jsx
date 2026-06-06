import './globals.css';
import Sidebar from '@/components/Sidebar';
import { ToastProvider } from '@/components/Toast';
import AutoSyncBanner from '@/components/AutoSyncBanner';

export const metadata = {
  title: 'Gold Price Sync Dashboard - Shopify Integration',
  description: 'Automated gold rate price calculations and Shopify product synchronizations.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ToastProvider>
          <AutoSyncBanner />
          <div className="app-container">
            <Sidebar />
            <main className="main-content">
              {children}
            </main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
