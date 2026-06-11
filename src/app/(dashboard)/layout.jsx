import Sidebar from '@/components/Sidebar';
import AutoSyncBanner from '@/components/AutoSyncBanner';

export default function DashboardLayout({ children }) {
  return (
    <>
      <AutoSyncBanner />
      <div className="app-container">
        <Sidebar />
        <main className="main-content">
          {children}
        </main>
      </div>
    </>
  );
}
