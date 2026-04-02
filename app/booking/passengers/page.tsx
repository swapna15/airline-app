'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { useBooking } from '@/utils/bookingStore';
import type { Passenger, ContactInfo } from '@/types/booking';

export default function PassengersPage() {
  const router = useRouter();
  const { searchParams, setPassengers, setContactInfo } = useBooking();
  const count = (searchParams?.passengers.adults ?? 1) + (searchParams?.passengers.children ?? 0);

  const [paxList, setPaxList] = useState<Passenger[]>(
    Array.from({ length: count }, (_, i) => ({
      id: uuidv4(),
      type: i < (searchParams?.passengers.adults ?? 1) ? 'adult' : 'child',
      title: 'Mr',
      firstName: '',
      lastName: '',
      dateOfBirth: '',
    }))
  );
  const [contact, setContact] = useState<ContactInfo>({
    email: '',
    phone: '',
    address: { street: '', city: '', state: '', zipCode: '', country: '' },
  });

  const updatePax = (idx: number, field: keyof Passenger, value: string) => {
    setPaxList((prev) => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPassengers(paxList);
    setContactInfo(contact);
    router.push('/booking/checkout');
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Passenger Details</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        {paxList.map((pax, idx) => (
          <div key={pax.id} className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-4">Passenger {idx + 1} ({pax.type})</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
                <select className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
                  value={pax.title} onChange={(e) => updatePax(idx, 'title', e.target.value)}>
                  {['Mr', 'Mrs', 'Ms', 'Dr'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">First Name</label>
                <input required className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
                  value={pax.firstName} onChange={(e) => updatePax(idx, 'firstName', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Last Name</label>
                <input required className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
                  value={pax.lastName} onChange={(e) => updatePax(idx, 'lastName', e.target.value)} />
              </div>
              <div className="col-span-3">
                <label className="block text-xs font-medium text-gray-500 mb-1">Date of Birth</label>
                <input required type="date" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
                  value={pax.dateOfBirth} onChange={(e) => updatePax(idx, 'dateOfBirth', e.target.value)} />
              </div>
            </div>
          </div>
        ))}

        {/* Contact */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Contact Information</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
              <input required type="email" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
                value={contact.email} onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
              <input required type="tel" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
                value={contact.phone} onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))} />
            </div>
          </div>
        </div>

        <button type="submit" className="w-full py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors">
          Continue to Checkout
        </button>
      </form>
    </div>
  );
}
