'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Complaint, Alert as AlertType } from '@/types/database';
import Navbar from '@/components/Navbar';
import AuthModal from '@/components/AuthModal';
import ProfileModal from '@/components/ProfileModal';
import {
  AlertTriangle,
  MessageSquare,
  ThumbsUp,
  X,
  PlusCircle,
  CheckCircle2,
  Filter,
  MapPin,
  Clock,
  Building,
  Radio,
  User,
  ShieldCheck,
  Flame,
  PhoneCall,
  Search,
  Sparkles,
  ChevronRight,
  Info,
  Image as ImageIcon,
  Loader2,
  Trash2,
} from 'lucide-react';

const CATEGORIES = [
  'All Categories',
  'Water Leak',
  'Power Outage',
  'Damaged Road',
  'Refuse/Sanitation',
  'Streetlight',
  'Drainage',
  'Other',
];

const GHANA_DISTRICTS = [
  'All Districts',
  'Adentan Municipal',
  'Accra Metropolitan',
  'Ayawaso West Municipal',
  'Tema Metropolitan',
  'Ga East Municipal',
  'Ga West Municipal',
  'Ga South Municipal',
  'Ga Central Municipal',
  'La Dade Kotopon Municipal',
  'Korle Klottey Municipal',
  'Kpone Katamanso Municipal',
  'Ledzokuku Municipal',
  'Weija Gbawe Municipal',
  'Ashaiman Municipal',
  'Kumasi Metropolitan',
  'La Nkwantanang-Madina Municipal',
];

export default function CommunityDashboard() {
  const { user, profile } = useAuth();

  // Data states
  const [alerts, setAlerts] = useState<AlertType[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [userUpvotes, setUserUpvotes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Modals
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup'>('signin');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [previewImageModal, setPreviewImageModal] = useState<string | null>(null);

  // Filters & Search
  const [selectedDistrict, setSelectedDistrict] = useState('All Districts');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [searchQuery, setSearchQuery] = useState('');

  // Form State for Report Issue
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [formError, setFormError] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    category: 'Water Leak',
    district: 'Adentan Municipal',
    neighborhood: '',
    description: '',
  });

  // Sync default location from user profile into form
  useEffect(() => {
    if (profile) {
      setFormData((prev) => ({
        ...prev,
        district: profile.district || 'Adentan Municipal',
        neighborhood: profile.neighborhood || '',
      }));
    }
  }, [profile]);

  // Handle image file selection and preview
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setImageFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    } else {
      setImagePreview(null);
    }
  };

  const clearSelectedImage = () => {
    setImageFile(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
    }
  };

  // Load Alerts and Complaints
  const loadData = useCallback(async () => {
    try {
      // 1. Fetch Alerts
      const { data: alertsData, error: alertsError } = await supabase
        .from('alerts')
        .select('*')
        .order('created_at', { ascending: false });

      if (!alertsError && alertsData) {
        setAlerts(alertsData as AlertType[]);
      }

      // 2. Fetch Complaints (with profiles join)
      const { data: complaintsData, error: complaintsError } = await supabase
        .from('complaints')
        .select('*, profiles(full_name, district, neighborhood, role)')
        .order('created_at', { ascending: false });

      if (!complaintsError && complaintsData) {
        setComplaints(complaintsData as Complaint[]);
      } else {
        // Fallback without join
        const { data: rawComplaints } = await supabase
          .from('complaints')
          .select('*')
          .order('created_at', { ascending: false });
        if (rawComplaints) setComplaints(rawComplaints as Complaint[]);
      }

      // 3. Fetch User Upvotes if logged in
      if (user?.id) {
        const { data: upvoteData } = await supabase
          .from('complaint_upvotes')
          .select('complaint_id')
          .eq('user_id', user.id);

        if (upvoteData) {
          const upvotedIds = new Set<string>(upvoteData.map((u: any) => u.complaint_id));
          setUserUpvotes(upvotedIds);
        }
      } else {
        setUserUpvotes(new Set());
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();

    // Supabase Realtime Subscriptions
    const complaintsChannel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'complaints' },
        () => loadData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'alerts' },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(complaintsChannel);
    };
  }, [loadData]);

  // Handle lodging new complaint
  const handleSubmitComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setAuthModalMode('signin');
      setIsAuthModalOpen(true);
      return;
    }

    setSubmitting(true);
    setSuccessMsg('');
    setFormError('');

    try {
      let imageUrl: string | null = null;

      // 1. Upload image if selected
      if (imageFile) {
        try {
          const fileExt = imageFile.name.split('.').pop();
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from('complaint-images')
            .upload(fileName, imageFile);

          if (uploadError) {
            console.warn('Image upload note (check if complaint-images bucket exists):', uploadError.message);
          } else {
            const { data: publicUrlData } = supabase.storage
              .from('complaint-images')
              .getPublicUrl(fileName);
            imageUrl = publicUrlData.publicUrl;
          }
        } catch (uploadErr) {
          console.warn('Failed to upload image asset:', uploadErr);
        }
      }

      // 2. Insert complaint once into database
      const { error: insertError } = await supabase.from('complaints').insert([
        {
          user_id: user.id,
          title: formData.title.trim(),
          category: formData.category,
          district: formData.district,
          neighborhood: formData.neighborhood.trim(),
          description: formData.description.trim(),
          image_url: imageUrl,
          status: 'pending',
          upvote_count: 0,
        },
      ]);

      if (insertError) throw insertError;

      setSuccessMsg('Complaint lodged successfully and broadcast to district!');
      setFormData({
        title: '',
        category: 'Water Leak',
        district: profile?.district || 'Adentan Municipal',
        neighborhood: profile?.neighborhood || '',
        description: '',
      });
      clearSelectedImage();
      await loadData();

      setTimeout(() => {
        setIsReportModalOpen(false);
        setSuccessMsg('');
      }, 1500);
    } catch (err: any) {
      setFormError(err.message || 'Error submitting report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Upvote toggle
  const handleUpvote = async (complaintId: string, currentCount: number) => {
    if (!user) {
      setAuthModalMode('signin');
      setIsAuthModalOpen(true);
      return;
    }

    const hasUpvoted = userUpvotes.has(complaintId);
    const newUpvotes = new Set(userUpvotes);

    // Optimistic UI updates
    if (hasUpvoted) {
      newUpvotes.delete(complaintId);
      setUserUpvotes(newUpvotes);
      setComplaints((prev) =>
        prev.map((c) =>
          c.id === complaintId ? { ...c, upvote_count: Math.max(0, (c.upvote_count || 1) - 1) } : c
        )
      );

      try {
        await supabase
          .from('complaint_upvotes')
          .delete()
          .match({ user_id: user.id, complaint_id: complaintId });

        await supabase
          .from('complaints')
          .update({ upvote_count: Math.max(0, currentCount - 1) })
          .eq('id', complaintId);
      } catch (err) {
        console.error('Error removing upvote:', err);
      }
    } else {
      newUpvotes.add(complaintId);
      setUserUpvotes(newUpvotes);
      setComplaints((prev) =>
        prev.map((c) =>
          c.id === complaintId ? { ...c, upvote_count: (c.upvote_count || 0) + 1 } : c
        )
      );

      try {
        await supabase.from('complaint_upvotes').insert([
          {
            user_id: user.id,
            complaint_id: complaintId,
          },
        ]);

        await supabase
          .from('complaints')
          .update({ upvote_count: currentCount + 1 })
          .eq('id', complaintId);
      } catch (err) {
        console.error('Error registering upvote:', err);
      }
    }
  };

  // Filter complaints
  const filteredComplaints = complaints.filter((c) => {
    const matchesDistrict =
      selectedDistrict === 'All Districts' ||
      c.district?.toLowerCase().includes(selectedDistrict.toLowerCase());
    const matchesCategory =
      selectedCategory === 'All Categories' || c.category === selectedCategory;
    const matchesSearch =
      !searchQuery ||
      c.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.neighborhood?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesDistrict && matchesCategory && matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'resolved':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200';
      case 'investigating':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200';
      case 'under_review':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200';
      default:
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Navigation Header */}
      <Navbar
        onOpenReportModal={() => setIsReportModalOpen(true)}
        onOpenAuthModal={(mode) => {
          setAuthModalMode(mode);
          setIsAuthModalOpen(true);
        }}
        onOpenProfileModal={() => setIsProfileModalOpen(true)}
      />

      {/* Hero Banner / Quick Stats */}
      <div className="bg-gradient-to-b from-emerald-900 via-emerald-800 to-emerald-900 text-white pb-12 pt-6 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-700/60 border border-emerald-500/30 text-emerald-200 text-xs font-semibold mb-3">
                <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
                Live District Utility & Incident Feed
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
                Empowering Ghanaian Communities
              </h1>
              <p className="text-emerald-100/90 text-sm sm:text-base max-w-2xl mt-1.5 leading-relaxed">
                Connect directly with your municipal assembly, monitor utility outages (GWCL, ECG), and track citizen infrastructure reports in real-time.
              </p>
            </div>

            {!user && (
              <div className="bg-white/10 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-white/15 shadow-xl max-w-sm">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <Sparkles size={16} className="text-yellow-300" /> Resident Profile
                </h3>
                <p className="text-xs text-emerald-100 mt-1">
                  Create a profile with your district and neighborhood to lodge verified complaints and receive localized alerts.
                </p>
                <button
                  onClick={() => {
                    setAuthModalMode('signup');
                    setIsAuthModalOpen(true);
                  }}
                  className="mt-3 w-full bg-white hover:bg-emerald-50 text-emerald-950 font-bold py-2 px-3 rounded-xl text-xs shadow transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  Create Citizen Account <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 -mt-6 flex-1 w-full pb-16">
        {/* Filters Bar */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/90 mb-8 flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="flex-1 w-full relative">
            <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search reports by title, street, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex flex-wrap sm:flex-nowrap gap-2.5 w-full md:w-auto">
            <select
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              className="flex-1 sm:flex-none text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {GHANA_DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="flex-1 sm:flex-none text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Content Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Feed: 2 Columns */}
          <div className="lg:col-span-2 space-y-8">
            {/* Utility Alerts Section */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800">
                  <AlertTriangle className="text-amber-500 w-5 h-5" /> Official Utility Notices
                </h2>
                <span className="text-xs font-semibold text-slate-500">
                  {alerts.length} Active {alerts.length === 1 ? 'Notice' : 'Notices'}
                </span>
              </div>

              {loading ? (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400 text-sm animate-pulse">
                  Syncing official utility notices...
                </div>
              ) : alerts.length === 0 ? (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 text-slate-500 text-sm flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  <span>No active utility outage alerts reported by GWCL or ECG at this time.</span>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="bg-white p-5 rounded-2xl border border-amber-200/70 shadow-sm relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-amber-500" />
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-extrabold uppercase px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200">
                            {alert.source}
                          </span>
                          <span className="text-xs font-semibold text-slate-500">
                            {alert.category}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Clock size={12} />
                          {new Date(alert.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                      <h3 className="font-bold text-base text-slate-900 mb-1">{alert.title}</h3>
                      <p className="text-slate-600 text-sm leading-relaxed">{alert.message}</p>
                      {alert.target_district && (
                        <div className="mt-3 text-xs text-emerald-700 font-semibold flex items-center gap-1">
                          <MapPin size={12} /> Target: {alert.target_district}
                          {alert.target_neighborhood ? ` (${alert.target_neighborhood})` : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Community Reports Feed */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800">
                  <MessageSquare className="text-emerald-600 w-5 h-5" /> Resident Infrastructure Reports
                </h2>
                <button
                  onClick={() => {
                    if (!user) {
                      setAuthModalMode('signin');
                      setIsAuthModalOpen(true);
                    } else {
                      setIsReportModalOpen(true);
                    }
                  }}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                >
                  <PlusCircle size={14} /> Lodge Report
                </button>
              </div>

              {loading ? (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400 text-sm animate-pulse">
                  Loading resident reports...
                </div>
              ) : filteredComplaints.length === 0 ? (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
                  <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700 text-sm">No reports matching criteria</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Be the first in your neighborhood to lodge an incident for your local assembly.
                  </p>
                  <button
                    onClick={() => {
                      if (!user) {
                        setAuthModalMode('signin');
                        setIsAuthModalOpen(true);
                      } else {
                        setIsReportModalOpen(true);
                      }
                    }}
                    className="mt-4 inline-flex items-center gap-1.5 bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow hover:bg-emerald-600 transition cursor-pointer"
                  >
                    <PlusCircle size={14} /> Report Issue Now
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredComplaints.map((c) => {
                    const isUpvoted = userUpvotes.has(c.id);
                    return (
                      <div
                        key={c.id}
                        className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:border-emerald-200 transition"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                                {c.category}
                              </span>
                              <span
                                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${getStatusBadge(
                                  c.status
                                )}`}
                              >
                                {c.status ? c.status.replace('_', ' ') : 'Pending'}
                              </span>
                              <span className="text-xs text-slate-400 ml-auto flex items-center gap-1">
                                <Clock size={12} />
                                {new Date(c.created_at).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            </div>

                            <h3 className="font-bold text-base text-slate-900 mb-1">{c.title}</h3>
                            <p className="text-slate-600 text-sm leading-relaxed">{c.description}</p>

                            {/* Image attachment thumbnail if present */}
                            {c.image_url && (
                              <div className="mt-3">
                                <button
                                  type="button"
                                  onClick={() => setPreviewImageModal(c.image_url!)}
                                  className="group relative rounded-xl overflow-hidden border border-slate-200 inline-block focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                >
                                  <img
                                    src={c.image_url}
                                    alt={c.title}
                                    className="h-28 w-44 object-cover group-hover:scale-105 transition duration-200 rounded-xl"
                                    onError={(e) => {
                                      // Hide broken image gracefully
                                      (e.target as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-semibold">
                                    View Full Photo
                                  </div>
                                </button>
                              </div>
                            )}

                            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
                              <div className="flex items-center gap-1.5 text-emerald-800 font-medium">
                                <MapPin size={13} className="text-emerald-600" />
                                <span>
                                  {c.neighborhood ? `${c.neighborhood}, ` : ''}
                                  {c.district}
                                </span>
                              </div>

                              {c.profiles?.full_name && (
                                <div className="flex items-center gap-1 text-slate-400 text-[11px]">
                                  <User size={12} /> Lodged by {c.profiles.full_name}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Upvote Button */}
                          <button
                            onClick={() => handleUpvote(c.id, c.upvote_count || 0)}
                            className={`flex flex-col items-center justify-center min-w-[54px] py-2.5 px-2 rounded-xl border font-bold text-xs transition cursor-pointer ${
                              isUpvoted
                                ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                                : 'bg-slate-50 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 text-slate-700 border-slate-200'
                            }`}
                            title={isUpvoted ? 'Remove endorsement' : 'Endorse this issue'}
                          >
                            <ThumbsUp size={16} className={isUpvoted ? 'fill-white' : ''} />
                            <span className="mt-1">{c.upvote_count || 0}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Sidebar Info & Helplines */}
          <aside className="space-y-6">
            {/* User District Status Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm">
              <h3 className="font-bold text-sm text-slate-900 mb-3 flex items-center gap-2">
                <Building size={16} className="text-emerald-700" /> Monitored Assembly
              </h3>
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-100 rounded-xl">
                <p className="text-[11px] uppercase tracking-wider font-bold text-emerald-800">
                  Primary Jurisdiction
                </p>
                <p className="text-base font-extrabold text-emerald-950 mt-0.5">
                  {profile?.district || selectedDistrict}
                </p>
                <p className="text-xs text-emerald-700 mt-1">
                  Local Area: <strong>{profile?.neighborhood || 'All Neighborhoods'}</strong>
                </p>
              </div>

              {!user && (
                <button
                  onClick={() => {
                    setAuthModalMode('signup');
                    setIsAuthModalOpen(true);
                  }}
                  className="mt-4 w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <User size={14} /> Join My Local District
                </button>
              )}
            </div>

            {/* Emergency Utility Contacts */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm">
              <h3 className="font-bold text-sm text-slate-900 mb-3 flex items-center gap-2">
                <PhoneCall size={16} className="text-emerald-700" /> Utility Emergency Contacts
              </h3>
              <ul className="space-y-2.5 text-xs">
                <li className="p-2.5 bg-slate-50 rounded-xl flex justify-between items-center border border-slate-100">
                  <div>
                    <span className="font-bold text-slate-800 block">Electricity Co. of Ghana</span>
                    <span className="text-slate-400 text-[11px]">Power Outages & Faults</span>
                  </div>
                  <span className="font-mono font-bold text-emerald-700 bg-white px-2 py-1 rounded border border-slate-200">
                    0302 611 611
                  </span>
                </li>

                <li className="p-2.5 bg-slate-50 rounded-xl flex justify-between items-center border border-slate-100">
                  <div>
                    <span className="font-bold text-slate-800 block">Ghana Water Company</span>
                    <span className="text-slate-400 text-[11px]">Pipe Bursts & Supply</span>
                  </div>
                  <span className="font-mono font-bold text-emerald-700 bg-white px-2 py-1 rounded border border-slate-200">
                    0800 40 000
                  </span>
                </li>

                <li className="p-2.5 bg-slate-50 rounded-xl flex justify-between items-center border border-slate-100">
                  <div>
                    <span className="font-bold text-slate-800 block">Ghana National Fire</span>
                    <span className="text-slate-400 text-[11px]">Emergency Response</span>
                  </div>
                  <span className="font-mono font-bold text-rose-700 bg-white px-2 py-1 rounded border border-slate-200">
                    192 / 112
                  </span>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </main>

      {/* Report Modal */}
      {isReportModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative border border-slate-200 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsReportModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                <PlusCircle size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Lodge Municipal Report</h2>
                <p className="text-xs text-slate-500">Notice will be submitted under your verified profile</p>
              </div>
            </div>

            {successMsg ? (
              <div className="p-4 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 size={20} /> {successMsg}
              </div>
            ) : (
              <form onSubmit={handleSubmitComplaint} className="space-y-4">
                {formError && (
                  <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200">
                    {formError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                    Category <span className="text-emerald-600">*</span>
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option>Water Leak</option>
                    <option>Power Outage</option>
                    <option>Damaged Road</option>
                    <option>Refuse/Sanitation</option>
                    <option>Streetlight</option>
                    <option>Drainage</option>
                    <option>Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                    Issue Title <span className="text-emerald-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Burst pipe flooding market junction"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                      District <span className="text-emerald-600">*</span>
                    </label>
                    <select
                      value={formData.district}
                      onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                      className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    >
                      {GHANA_DISTRICTS.filter((d) => d !== 'All Districts').map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                      Neighborhood / Landmark <span className="text-emerald-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Danfa / Near Clinic"
                      value={formData.neighborhood}
                      onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                      className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                    Description & Exact Location <span className="text-emerald-600">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Provide details to assist technicians and municipal crews..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                {/* Photo Upload Section */}
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 mb-1 flex items-center justify-between">
                    <span>Attach Photo (Optional)</span>
                    {imageFile && (
                      <button
                        type="button"
                        onClick={clearSelectedImage}
                        className="text-rose-600 hover:text-rose-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 size={12} /> Remove
                      </button>
                    )}
                  </label>

                  {imagePreview ? (
                    <div className="relative rounded-xl border border-slate-200 p-2 bg-slate-50 flex items-center gap-3">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="w-16 h-16 object-cover rounded-lg border border-slate-300"
                      />
                      <div className="text-xs text-slate-600 truncate flex-1">
                        <p className="font-semibold truncate">{imageFile?.name}</p>
                        <p className="text-slate-400 text-[11px]">
                          {(imageFile ? imageFile.size / 1024 : 0).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                  ) : (
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                    />
                  )}
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white font-bold py-3 rounded-xl text-sm shadow-md transition disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Submitting Report...
                    </>
                  ) : (
                    'Broadcast Report to Assembly'
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Full Photo Modal */}
      {previewImageModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewImageModal(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl">
            <button
              onClick={() => setPreviewImageModal(null)}
              className="absolute top-3 right-3 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full z-10 cursor-pointer"
            >
              <X size={20} />
            </button>
            <img
              src={previewImageModal}
              alt="Full Report Photo"
              className="max-h-[85vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* Auth Modal (Login & Signup) */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        initialMode={authModalMode}
      />

      {/* Citizen Profile Modal */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />
    </div>
  );
}