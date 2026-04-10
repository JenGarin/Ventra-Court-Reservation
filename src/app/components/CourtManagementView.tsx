import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { toast } from 'sonner';
import { cn } from '@/app/components/ui/utils';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  MoreVertical, 
  Edit2, 
  Trash2, 
  Power,
  Dribbble,
  MapPin,
  Clock,
  ShieldCheck,
  X,
  Calendar
} from 'lucide-react';
import { ImageWithFallback } from '@/app/components/figma/ImageWithFallback';
import { Court } from '@/types';

function getCourtImage(name: string) {
  const text = name.toLowerCase();
  if (text.includes('basket')) return '/basketball.png';
  if (text.includes('tennis')) return '/tennis.png';
  if (text.includes('pickle')) return '/pickle%20ball.png';
  return '/tennis.png';
}

export function CourtManagementView() {
  const { courts, addCourt, updateCourt, deleteCourt, bookings, users, currentUser, systemSetup } = useApp();
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingScheduleId, setViewingScheduleId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    courtNumber: string;
    type: 'indoor' | 'outdoor';
    surfaceType: 'hardcourt' | 'clay' | 'grass' | 'synthetic';
    status: 'active' | 'maintenance' | 'disabled';
    hourlyRate: number;
    peakHourRate: number;
    imageUrl: string;
    operatingHours: { start: string; end: string };
  }>({
    name: '',
    courtNumber: '',
    type: 'indoor',
    surfaceType: 'hardcourt',
    status: 'active',
    hourlyRate: 500,
    peakHourRate: 700,
    imageUrl: '',
    operatingHours: { start: '06:00', end: '22:00' }
  });

  const resetForm = () => {
    setFormData({
      name: '',
      courtNumber: '',
      type: 'indoor',
      surfaceType: 'hardcourt',
      status: 'active',
      hourlyRate: 500,
      peakHourRate: 700,
      imageUrl: '',
      operatingHours: { start: '06:00', end: '22:00' }
    });
    setEditingId(null);
    setIsModalOpen(false);
  };

  const handleEdit = (court: Court) => {
    setEditingId(court.id);
    setFormData({
      name: court.name,
      courtNumber: court.courtNumber,
      type: court.type as 'indoor' | 'outdoor',
      surfaceType: court.surfaceType as 'hardcourt' | 'clay' | 'grass' | 'synthetic',
      status: court.status as 'active' | 'maintenance' | 'disabled',
      hourlyRate: Number(court.hourlyRate) || 500,
      peakHourRate: Number(court.peakHourRate || court.hourlyRate) || 700,
      imageUrl: court.imageUrl || '',
      operatingHours: court.operatingHours || { start: '06:00', end: '22:00' }
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this court?')) {
      try {
        await deleteCourt(id);
        toast.success('Court deleted successfully');
      } catch (error) {
        toast.error('Failed to delete court');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const normalizedImageUrl = formData.imageUrl.trim();
      const courtData = {
        name: formData.name,
        courtNumber: formData.courtNumber,
        type: formData.type,
        surfaceType: formData.surfaceType,
        status: formData.status,
        hourlyRate: Number(formData.hourlyRate),
        peakHourRate: Number(formData.peakHourRate),
        imageUrl: normalizedImageUrl ? normalizedImageUrl : (editingId ? '' : undefined),
        operatingHours: formData.operatingHours
      };

      if (editingId) {
        await updateCourt(editingId, courtData);
        toast.success('Court updated successfully');
      } else {
        await addCourt(courtData as any);
        toast.success('Court added successfully');
      }
      resetForm();
    } catch (error) {
      toast.error(editingId ? 'Failed to update court' : 'Failed to add court');
    }
  };

  const handleEditSystemRules = () => {
    if (currentUser?.role !== 'admin') {
      toast.error('Only admins can edit system rules.');
      return;
    }
    navigate('/settings');
  };

  const handleImageSelected = (file: File | null) => {
    if (!file) {
      setFormData((prev) => ({ ...prev, imageUrl: '' }));
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        toast.error('Failed to read the selected image.');
        return;
      }
      setFormData((prev) => ({ ...prev, imageUrl: result }));
    };
    reader.onerror = () => toast.error('Failed to read the selected image.');
    reader.readAsDataURL(file);
  };

  const handleToggleActive = async (court: Court) => {
    const nextStatus = court.status === 'active' ? 'maintenance' : 'active';
    try {
      await updateCourt(court.id, { status: nextStatus });
      toast.success(`Court set to ${nextStatus}.`);
    } catch {
      toast.error('Failed to update court status.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 p-6 space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Court Management</h1>
          <p className="text-slate-500 dark:text-slate-400">Configure facilities and operational settings.</p>
        </div>
        <button 
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-teal-700 transition-all shadow-lg shadow-teal-100 dark:shadow-none"
        >
          <Plus size={20} />
          Add New Court
        </button>
      </div>

      {courts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">No Courts Configured Yet</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {systemSetup.missingTables.length > 0
              ? `The database setup is incomplete. Missing tables: ${systemSetup.missingTables.join(', ')}. Finish the schema setup first.`
              : 'Create your first active court to enable standard and quick bookings.'}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => { resetForm(); setIsModalOpen(true); }}
              className="rounded-xl bg-teal-600 px-4 py-2.5 font-semibold text-white hover:bg-teal-700"
            >
              Add First Court
            </button>
            {currentUser?.role === 'admin' ? (
              <button
                type="button"
                onClick={handleEditSystemRules}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Open Settings
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8">
        {courts.map((court) => (
          <div key={court.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden group shadow-sm hover:shadow-md transition-all">
            <div className="relative h-48">
              <ImageWithFallback 
                src={court.imageUrl || getCourtImage(court.name)}
                alt={court.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-4 right-4 flex gap-2">
                <button 
                  type="button"
                  onClick={() => handleEdit(court)}
                  className="p-2 bg-white/90 backdrop-blur rounded-lg text-slate-700 hover:bg-white transition-colors"
                >
                  <Edit2 size={16} />
                </button>
                <button 
                  type="button"
                  onClick={() => handleDelete(court.id)}
                  className="p-2 bg-white/90 backdrop-blur rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className={cn(
                "absolute bottom-4 left-4 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                court.status === 'active' ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
              )}>
                {court.status}
              </div>
            </div>

            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-teal-50 dark:bg-teal-900/30 rounded-lg flex items-center justify-center text-teal-600 dark:text-teal-400">
                    <Dribbble size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-lg">{court.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{court.type} Facility</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-400 capitalize">{court.status}</span>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(court)}
                    className={cn(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                      court.status === 'active' ? "bg-teal-600" : "bg-slate-400"
                    )}
                  >
                    <span className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition",
                      court.status === 'active' ? "translate-x-6" : "translate-x-1"
                    )} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-1">
                    <MapPin size={14} />
                    <span className="text-[10px] font-bold uppercase">Surface</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white capitalize">{court.surfaceType}</p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-1">
                    <Clock size={14} />
                    <span className="text-[10px] font-bold uppercase">Operating Hours</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{court.operatingHours?.start} - {court.operatingHours?.end}</p>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck size={18} />
                  <span className="text-xs font-bold">Maintenance Clean</span>
                </div>
                <button 
                  type="button"
                  onClick={() => setViewingScheduleId(court.id)}
                  className="text-sm font-bold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300"
                >
                  View Schedule
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-teal-900 rounded-2xl p-8 text-white relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="max-w-md">
            <h2 className="text-2xl font-bold mb-2">Global Facility Settings</h2>
            <p className="text-teal-200 text-sm">Manage opening hours, booking intervals, and peak pricing rules for all courts.</p>
          </div>
          <button
            type="button"
            onClick={handleEditSystemRules}
            className="bg-white text-teal-900 px-6 py-3 rounded-xl font-bold hover:bg-teal-50 transition-all shadow-xl"
          >
            Edit System Rules
          </button>
        </div>
        <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-64 h-64 bg-teal-500/20 rounded-full blur-3xl"></div>
      </div>

      {/* Add Court Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{editingId ? 'Edit Court' : 'Add New Court'}</h2>
              <button onClick={resetForm} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Court Photo</label>
                <div className="flex items-start gap-4">
                  <div className="h-24 w-32 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shrink-0">
                    <img
                      src={formData.imageUrl || getCourtImage(formData.name || 'tennis')}
                      alt="Court preview"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageSelected(e.target.files?.[0] || null)}
                      className="block w-full text-sm text-slate-700 dark:text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-teal-600 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-teal-700"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, imageUrl: '' }))}
                        className="text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                      >
                        Remove photo
                      </button>
                      <span className="text-xs text-slate-500 dark:text-slate-400">Stored with this court on save.</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Court Name</label>
                  <input 
                    required
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
                    placeholder="e.g. Center Court"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Court Number</label>
                  <input 
                    required
                    value={formData.courtNumber}
                    onChange={e => setFormData({...formData, courtNumber: e.target.value})}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
                    placeholder="e.g. 1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Type</label>
                  <select 
                    value={formData.type}
                    onChange={e => setFormData({...formData, type: e.target.value as 'indoor' | 'outdoor'})}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
                  >
                    <option value="indoor">Indoor</option>
                    <option value="outdoor">Outdoor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Surface</label>
                  <select 
                    value={formData.surfaceType}
                    onChange={e => setFormData({...formData, surfaceType: e.target.value as 'hardcourt' | 'clay' | 'grass' | 'synthetic'})}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
                  >
                    <option value="hardcourt">Hardcourt</option>
                    <option value="clay">Clay</option>
                    <option value="grass">Grass</option>
                    <option value="synthetic">Synthetic</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                <select 
                  value={formData.status}
                  onChange={e => setFormData({...formData, status: e.target.value as 'active' | 'maintenance' | 'disabled'})}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
                >
                  <option value="active">Active</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Hourly Rate</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.hourlyRate}
                    onChange={e => setFormData({...formData, hourlyRate: Number(e.target.value)})}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Peak Rate</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.peakHourRate}
                    onChange={e => setFormData({...formData, peakHourRate: Number(e.target.value)})}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-4 gap-3">
                <button 
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2 bg-teal-600 text-white rounded-lg font-bold hover:bg-teal-700 transition-colors shadow-lg shadow-teal-100 dark:shadow-none"
                >
                  {editingId ? 'Update Court' : 'Create Court'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Schedule Modal */}
      {viewingScheduleId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200 max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  {courts.find(c => c.id === viewingScheduleId)?.name} Schedule
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Upcoming bookings and sessions</p>
              </div>
              <button onClick={() => setViewingScheduleId(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              {bookings.filter(b => b.courtId === viewingScheduleId && b.status !== 'cancelled').length === 0 ? (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                  <Calendar size={48} className="mx-auto mb-3 opacity-20" />
                  <p>No active bookings found for this court.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {bookings
                    .filter(b => b.courtId === viewingScheduleId && b.status !== 'cancelled')
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                    .map(booking => {
                      const player = users.find(u => u.id === booking.userId);
                      return (
                        <div key={booking.id} className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center text-slate-500 shadow-sm">
                              <Calendar size={20} />
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 dark:text-white">
                                {new Date(booking.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                              </p>
                              <p className="text-sm text-slate-500 dark:text-slate-400">
                                {booking.startTime} - {booking.endTime}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-slate-900 dark:text-white">{player?.name || 'Unknown Player'}</p>
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 capitalize">
                              {booking.type}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
