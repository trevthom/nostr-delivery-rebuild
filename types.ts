export enum PkgSize { ENVELOPE='envelope', SMALL='small', MEDIUM='medium', LARGE='large', EXTRA_LARGE='extra_large' }
export interface PackageInfo { size: PkgSize; description: string; fragile: boolean; requires_signature: boolean; }
export interface Location { address: string; instructions?: string; }
export interface ProofOfDelivery { images: string[]; signature_name?: string; timestamp: number; comments?: string; }
export interface PersonsInfo { adults: number; children: number; carSeatRequested: boolean; luggage: { hasLuggage: boolean; dimensions: string; weight: string } }
export interface DeliveryBid { id: string; courier: string; amount: number; estimated_time: string; reputation: number; completed_deliveries: number; message?: string; created_at: number; }
export interface DeliveryRequest {
  id: string; sender: string; pickup: Location; dropoff: Location; packages: PackageInfo[];
  persons?: PersonsInfo; offer_amount: number; insurance_amount?: number; time_window: string;
  expires_at?: number; status: string; bids: DeliveryBid[]; accepted_bid?: string; created_at: number;
  proof_of_delivery?: ProofOfDelivery; sender_feedback?: string; sender_rating?: number; completed_at?: number;
}
export interface UserProfile { npub: string; display_name?: string; reputation: number; completed_deliveries: number; verified_identity: boolean; dark_mode?: boolean; encrypted_nwc_url?: string; }
export enum Mode { SENDER='sender', COURIER='courier' }
export type View = 'create' | 'awaiting' | 'pending' | 'transport' | 'done' | 'browse' | 'active' | 'completed';

export const fmtDate = (d: Date) => d.toLocaleDateString();
export const fmtTime = (d: Date) => `${d.toLocaleTimeString()} ${d.toLocaleTimeString('en-US',{timeZoneName:'short'}).split(' ').pop()||''}`;

export interface FormState {
  pickupAddr: string; pickupInst: string; dropoffAddr: string; dropoffInst: string;
  packages: PackageInfo[];
  persons: PersonsInfo;
  offer: string; insurance: string; timeWindow: string; customDate: string;
}

export function getStyles(darkMode: boolean) {
  const dm = darkMode;
  const bg = dm ? 'bg-gray-800 text-white' : 'bg-white';
  const inp = `w-full px-4 py-3 border ${dm ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400' : 'border-gray-300 bg-white'} rounded-lg focus:ring-2 focus:ring-orange-500`;
  const card = `${dm ? 'bg-gray-800 text-white' : 'bg-white'} rounded-xl shadow-lg p-6`;
  const sub = dm ? 'text-gray-400' : 'text-gray-500';
  const txt = dm ? 'text-white' : 'text-gray-900';
  const sec = dm ? 'bg-gray-700' : 'bg-gray-50';
  return { dm, bg, inp, card, sub, txt, sec };
}
