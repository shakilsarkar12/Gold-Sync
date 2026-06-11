import './globals.css';
import { ToastProvider } from '@/components/Toast';

export const metadata = {
  title: 'Gold Price Sync Dashboard - Shopify Integration',
  description: 'Automated gold rate price calculations and Shopify product synchronizations.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
