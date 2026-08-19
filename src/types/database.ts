export type UserRole = 'citizen' | 'official' | 'admin';

export interface Profile {
  id: string; // uuid, references auth.users(id)
  full_name: string | null;
  phone_number: string | null;
  district: string;
  neighborhood: string;
  role?: UserRole | string | null;
  created_at: string;
}

export type ComplaintCategory =
  | 'Water Leak'
  | 'Power Outage'
  | 'Damaged Road'
  | 'Refuse/Sanitation'
  | 'Streetlight'
  | 'Drainage'
  | 'Other';

export type ComplaintStatus = 'pending' | 'under_review' | 'investigating' | 'resolved';

export interface Complaint {
  id: string; // uuid
  user_id: string; // uuid, references profiles(id)
  category: ComplaintCategory | string;
  title: string;
  description: string;
  image_url?: string | null;
  district: string;
  neighborhood: string;
  status: ComplaintStatus | string;
  upvote_count: number;
  created_at: string;
  // joined relations
  profiles?: Profile | null;
}

export interface ComplaintUpvote {
  user_id: string; // uuid
  complaint_id: string; // uuid
  created_at: string;
}

export interface Alert {
  id: string; // uuid
  source: string; // e.g. 'GWCL', 'ECG', 'AdMA'
  title: string;
  message: string;
  category: string;
  target_district?: string | null;
  target_neighborhood?: string | null;
  severity?: 'low' | 'medium' | 'high' | 'critical' | string | null;
  created_at: string;
}
