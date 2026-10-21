import type { GuestCategory, StaffRole, TableDesignation, TicketStatus } from '../../shared/types';

export interface EventRow { id: string; slug: string; name: string; tagline: string | null; kind: string; event_date: string | null; venue: string | null; city: string | null; is_demo: boolean; status: 'draft' | 'live' | 'closed'; jotform_form_id: string | null; timezone: string }
export interface Guest {
  id: string; event_id: string; jotform_submission_id: string | null; full_name: string; display_name: string | null; first_name: string | null; credentials: string | null;
  email: string | null; phone: string | null; state: string | null; country: string | null; category: GuestCategory; book_title: string | null; additional_titles: string[];
  book_cover_url: string | null; headshot_url: string | null; marketing_permission: boolean; attendance_intent: string | null; ticket_interest: string | null;
  companion_intent: string | null; additional_guest_details: string | null; dietary: string | null; accessibility: string | null; notes: string | null; flagged: boolean;
  is_confirmed: boolean; checked_in_at: string | null; is_demo: boolean; source: string; created_at: string; updated_at: string;
}
export interface Ticket { id: string; event_id: string; guest_id: string; status: TicketStatus; kind: string | null; notes: string | null }
export interface TableRow { id: string; event_id: string; number: number; label: string | null; capacity: number; designation: TableDesignation; reserved_for: string | null; notes: string | null; pos_x: number | null; pos_y: number | null }
export interface Assignment { id: string; event_id: string; guest_id: string; table_id: string }
export interface Companion { id: string; event_id: string; host_guest_id: string; companion_guest_id: string }
export interface Flag { id: string; event_id: string; guest_id: string | null; kind: string; note: string; status: 'open' | 'resolved'; created_at: string }
export interface Assist { id: string; event_id: string; guest_id: string | null; name_given: string | null; message: string | null; status: 'open' | 'handling' | 'resolved'; created_at: string }
export interface Account { user_id: string; email: string; display_name: string | null; role: StaffRole; event_ids: string[] | null; active: boolean }
export interface AuditRow { id: number; event_id: string | null; actor_email: string | null; action: string; entity: string; entity_id: string | null; details: any; created_at: string }
