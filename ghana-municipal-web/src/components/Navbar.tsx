'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  Shield,
  User,
  LogOut,
  PlusCircle,
  LogIn,
  UserPlus,
  ChevronDown,
  MapPin,
  Flame,
} from 'lucide-react';

interface NavbarProps {
  onOpenReportModal: () => void;
  onOpenAuthModal: (mode: 'signin' | 'signup') => void;
  onOpenProfileModal: () => void;
}

export default function Navbar({
  onOpenReportModal,
  onOpenAuthModal,
  onOpenProfileModal,
}: NavbarProps) {
  const { user, profile, loading, signOut } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleReportClick = () => {
    if (!user) {
      onOpenAuthModal('signin');
    } else {
      onOpenReportModal();
    }
  };

  return (
    <header className="bg-emerald-900 text-white sticky top-0 z-30 shadow-lg border-b border-emerald-800">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-4">
        {/* Brand & Location */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-inner text-emerald-950 font-black text-xl">
            🇬🇭
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg sm:text-xl tracking-tight text-white">
                NoticePoint
              </span>
              <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-700/60 border border-emerald-500/30 rounded-full text-emerald-200">
                Municipal Hub
              </span>
            </div>
            <p className="text-xs text-emerald-300 flex items-center gap-1 font-medium truncate max-w-[200px] sm:max-w-none">
              <MapPin size={12} className="text-emerald-400 shrink-0" />
              {profile?.district ? `${profile.district} • ${profile.neighborhood}` : 'Greater Accra • Municipal Updates'}
            </p>
          </div>
        </div>

        {/* Actions & User State */}
        <div className="flex items-center gap-2.5 sm:gap-4">
          <button
            onClick={handleReportClick}
            className="flex items-center gap-1.5 sm:gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm shadow-md hover:shadow-lg transition active:scale-95 cursor-pointer"
          >
            <PlusCircle size={16} className="shrink-0" />
            <span>Report Issue</span>
          </button>

          {loading ? (
            <div className="h-9 w-24 bg-emerald-800/60 rounded-xl animate-pulse" />
          ) : user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 bg-emerald-800/80 hover:bg-emerald-800 border border-emerald-700/80 rounded-xl px-2.5 py-1.5 text-left transition"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                  {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : user.email?.charAt(0).toUpperCase()}
                </div>
                <div className="hidden md:block">
                  <div className="text-xs font-bold text-white truncate max-w-[110px]">
                    {profile?.full_name || 'Citizen'}
                  </div>
                  <div className="text-[10px] text-emerald-300 uppercase tracking-wider font-semibold">
                    {profile?.role || 'Citizen'}
                  </div>
                </div>
                <ChevronDown size={14} className="text-emerald-300 hidden sm:block" />
              </button>

              {/* Dropdown Menu */}
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 py-2 text-slate-800 dark:text-slate-200 animate-in fade-in duration-150 z-50">
                  <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-xs text-slate-400 font-medium">Signed in as</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                      {profile?.full_name || user.email}
                    </p>
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium truncate mt-0.5">
                      {profile?.district || 'Ghana Resident'}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      onOpenProfileModal();
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 text-slate-700 dark:text-slate-300"
                  >
                    <User size={15} className="text-emerald-600" />
                    My Citizen Profile
                  </button>

                  <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      signOut();
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 flex items-center gap-2.5"
                  >
                    <LogOut size={15} />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                onClick={() => onOpenAuthModal('signin')}
                className="flex items-center gap-1 bg-emerald-800/80 hover:bg-emerald-800 text-emerald-100 hover:text-white text-xs sm:text-sm font-semibold px-3 py-2 rounded-xl transition"
              >
                <LogIn size={15} />
                <span className="hidden sm:inline">Sign In</span>
              </button>

              <button
                onClick={() => onOpenAuthModal('signup')}
                className="flex items-center gap-1 bg-white hover:bg-emerald-50 text-emerald-900 text-xs sm:text-sm font-bold px-3 py-2 rounded-xl shadow-sm transition"
              >
                <UserPlus size={15} />
                <span>Join</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
