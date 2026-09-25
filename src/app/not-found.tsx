import Link from 'next/link';
import { MapPin, Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-slate-900 text-white">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg text-3xl mb-6">
        🇬🇭
      </div>
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mb-4">
        <MapPin className="w-3.5 h-3.5" /> NoticePoint Ghana
      </span>
      <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-3">
        404 - Page Not Found
      </h1>
      <p className="text-slate-400 max-w-md mb-8 text-sm sm:text-base leading-relaxed">
        The municipal district page or report you are looking for doesn't exist or has been moved.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-md transition-all active:scale-95"
        >
          <Home className="w-4 h-4" /> Return to Dashboard
        </Link>
      </div>
    </main>
  );
}
