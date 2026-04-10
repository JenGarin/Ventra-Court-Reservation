import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Edit, Trash2, MapPin, Settings as SettingsIcon, Inbox, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type { Court, CourtType, SurfaceType, CourtStatus } from '@/types';
import { PendingBookings } from './PendingBookings';

export function AdminPanel() {
  const { courts, addCourt, updateCourt, deleteCourt, config, updateConfig, bookings } = useApp();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'courts' | 'config' | 'requests'>('courts');
  const [editingCourt, setEditingCourt] = useState<Court | null>(null);
  const [showCourtForm, setShowCourtForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;
  const [selectedCourts, setSelectedCourts] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [courtToDelete, setCourtToDelete] = useState<string | null>(null);

  const [courtForm, setCourtForm] = useState<Partial<Court>>({
    name: '',
    courtNumber: '',
    type: 'indoor',
    surfaceType: 'hardcourt',
    hourlyRate: 30,
    peakHourRate: 45,
    status: 'active',
    operatingHours: { start: '08:00', end: '22:00' },
  });

  const pendingCount = bookings.filter(b => b.status === 'pending').length;

  const filteredCourts = courts.filter(court => 
    court.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    court.courtNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredCourts.length / itemsPerPage);
  const paginatedCourts = filteredCourts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleCourtSubmit = async () => {
    if (!courtForm.name || !courtForm.courtNumber) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      if (editingCourt) {
        await updateCourt(editingCourt.id, courtForm);
        toast.success('Court updated successfully');
      } else {
        await addCourt(courtForm as Omit<Court, 'id'>);
        toast.success('Court added successfully');
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save court');
      return;
    }

    setShowCourtForm(false);
    setEditingCourt(null);
    setCourtForm({
      name: '',
      courtNumber: '',
      type: 'indoor',
      surfaceType: 'hardcourt',
      hourlyRate: 30,
      peakHourRate: 45,
      status: 'active',
      operatingHours: { start: '08:00', end: '22:00' },
    });
  };

  const handleEdit = (court: Court) => {
    setEditingCourt(court);
    setCourtForm(court);
    setShowCourtForm(true);
  };

  const handleDelete = (courtId: string) => {
    setCourtToDelete(courtId);
    setShowDeleteConfirm(true);
  };

  const handleConfigChange = async (updates: Parameters<typeof updateConfig>[0]) => {
    try {
      await updateConfig(updates);
    } catch (error) {
      console.error('Failed to update facility config:', error);
      toast.error('Failed to save configuration changes');
    }
  };

  const confirmDelete = () => {
    if (courtToDelete) {
      deleteCourt(courtToDelete);
      toast.success('Court deleted successfully');
      setShowDeleteConfirm(false);
      setCourtToDelete(null);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedCourts(filteredCourts.map(c => c.id));
    } else {
      setSelectedCourts([]);
    }
  };

  const handleSelectCourt = (courtId: string) => {
    setSelectedCourts(prev => 
      prev.includes(courtId) 
        ? prev.filter(id => id !== courtId)
        : [...prev, courtId]
    );
  };

  const handleBulkDelete = () => {
    setShowBulkDeleteConfirm(true);
  };

  const confirmBulkDelete = () => {
    selectedCourts.forEach(id => deleteCourt(id));
    setSelectedCourts([]);
    toast.success('Courts deleted successfully');
    setShowBulkDeleteConfirm(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-2xl">Admin Panel</h1>
            <p className="text-gray-600 text-sm">Manage courts and settings</p>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {[
            { id: 'courts', label: 'Court Management', icon: MapPin },
            { id: 'requests', label: 'Requests', icon: Inbox, count: pendingCount },
            { id: 'config', label: 'Facility Settings', icon: SettingsIcon },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-6 py-3 rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-teal-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              <tab.icon className="w-5 h-5 inline mr-2" />
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Courts Tab */}
        {activeTab === 'courts' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-4">
                <h2 className="text-xl">Courts ({filteredCourts.length})</h2>
                {filteredCourts.length > 0 && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedCourts.length === filteredCourts.length && filteredCourts.length > 0}
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                      id="select-all-courts"
                    />
                    <label htmlFor="select-all-courts" className="text-sm text-gray-600 cursor-pointer">Select All</label>
                  </div>
                )}
              </div>
              <div className="flex gap-3 w-full md:w-auto">
                {selectedCourts.length > 0 && (
                  <button
                    onClick={handleBulkDelete}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 whitespace-nowrap"
                  >
                    <Trash2 className="w-5 h-5" />
                    Delete ({selectedCourts.length})
                  </button>
                )}
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search courts..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <button
                  onClick={() => {
                    setEditingCourt(null);
                    setShowCourtForm(true);
                  }}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                  <Plus className="w-5 h-5" />
                  Add Court
                </button>
              </div>
            </div>

            {/* Court Form Modal */}
            {showCourtForm && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-lg mb-4">{editingCourt ? 'Edit Court' : 'Add New Court'}</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm mb-2">Court Name *</label>
                    <input
                      type="text"
                      value={courtForm.name}
                      onChange={(e) => setCourtForm({ ...courtForm, name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      placeholder="e.g., Center Court"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-2">Court Number *</label>
                    <input
                      type="text"
                      value={courtForm.courtNumber}
                      onChange={(e) => setCourtForm({ ...courtForm, courtNumber: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      placeholder="e.g., 1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-2">Type</label>
                    <select
                      value={courtForm.type}
                      onChange={(e) => setCourtForm({ ...courtForm, type: e.target.value as CourtType })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="indoor">Indoor</option>
                      <option value="outdoor">Outdoor</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm mb-2">Surface Type</label>
                    <select
                      value={courtForm.surfaceType}
                      onChange={(e) => setCourtForm({ ...courtForm, surfaceType: e.target.value as SurfaceType })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="hardcourt">Hardcourt</option>
                      <option value="clay">Clay</option>
                      <option value="grass">Grass</option>
                      <option value="synthetic">Synthetic</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm mb-2">Hourly Rate (₱)</label>
                    <input
                      type="number"
                      value={courtForm.hourlyRate}
                      onChange={(e) => setCourtForm({ ...courtForm, hourlyRate: Number(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      min="0"
                      step="5"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-2">Peak Hour Rate (₱)</label>
                    <input
                      type="number"
                      value={courtForm.peakHourRate}
                      onChange={(e) => setCourtForm({ ...courtForm, peakHourRate: Number(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      min="0"
                      step="5"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-2">Opening Time</label>
                    <input
                      type="time"
                      value={courtForm.operatingHours?.start}
                      onChange={(e) =>
                        setCourtForm({
                          ...courtForm,
                          operatingHours: { ...courtForm.operatingHours!, start: e.target.value },
                        })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-2">Closing Time</label>
                    <input
                      type="time"
                      value={courtForm.operatingHours?.end}
                      onChange={(e) =>
                        setCourtForm({
                          ...courtForm,
                          operatingHours: { ...courtForm.operatingHours!, end: e.target.value },
                        })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-2">Status</label>
                    <select
                      value={courtForm.status}
                      onChange={(e) => setCourtForm({ ...courtForm, status: e.target.value as CourtStatus })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="active">Active</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={handleCourtSubmit}
                    className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                  >
                    {editingCourt ? 'Update' : 'Add'} Court
                  </button>
                  <button
                    onClick={() => {
                      setShowCourtForm(false);
                      setEditingCourt(null);
                    }}
                    className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Bulk Delete Confirmation Modal */}
            {showBulkDeleteConfirm && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full">
                  <h3 className="text-lg font-bold mb-2">Confirm Bulk Delete</h3>
                  <p className="text-gray-600 mb-6">
                    Are you sure you want to delete {selectedCourts.length} courts? This action cannot be undone.
                  </p>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setShowBulkDeleteConfirm(false)}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmBulkDelete}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      Delete Courts
                    </button>
                  </div>
                </div>
              </div>
            )}

          {/* Single Delete Confirmation Modal */}
          {showDeleteConfirm && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full">
                <h3 className="text-lg font-bold mb-2">Confirm Delete</h3>
                <p className="text-gray-600 mb-6">
                  Are you sure you want to delete this court? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Delete Court
                  </button>
                </div>
              </div>
            </div>
          )}

            {/* Courts List */}
            <div className="grid md:grid-cols-2 gap-4">
              {paginatedCourts.map((court) => (
                <div key={court.id} className="bg-white rounded-xl shadow-lg p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedCourts.includes(court.id)}
                        onChange={() => handleSelectCourt(court.id)}
                        className="mt-1.5 w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                      />
                      <div>
                        <h3 className="text-xl mb-1">{court.name}</h3>
                        <p className="text-gray-600 text-sm">Court #{court.courtNumber}</p>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-sm ${
                        court.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : court.status === 'maintenance'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {court.status}
                    </span>
                  </div>
                  <div className="space-y-2 text-sm mb-4">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Type:</span>
                      <span className="capitalize">{court.type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Surface:</span>
                      <span className="capitalize">{court.surfaceType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Standard Rate:</span>
                      <span>₱{court.hourlyRate}/hr</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Peak Rate:</span>
                      <span>₱{court.peakHourRate}/hr</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Hours:</span>
                      <span>
                        {court.operatingHours.start} - {court.operatingHours.end}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(court)}
                      className="flex-1 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors flex items-center justify-center gap-2"
                    >
                      <Edit className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(court.id)}
                      className="flex-1 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-6">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-sm font-medium text-gray-600">Page {currentPage} of {totalPages}</span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Requests Tab */}
        {activeTab === 'requests' && (
          <div className="space-y-6">
            <PendingBookings />
          </div>
        )}

        {/* Config Tab */}
        {activeTab === 'config' && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl mb-6">Facility Configuration</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm mb-2">Opening Time</label>
                <input
                  type="time"
                  value={config.openingTime}
                  onChange={(e) => void handleConfigChange({ openingTime: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm mb-2">Closing Time</label>
                <input
                  type="time"
                  value={config.closingTime}
                  onChange={(e) => void handleConfigChange({ closingTime: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm mb-2">Booking Interval (minutes)</label>
                <select
                  value={config.bookingInterval}
                  onChange={(e) => void handleConfigChange({ bookingInterval: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value={30}>30 minutes</option>
                  <option value={60}>60 minutes</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-2">Buffer Time (minutes)</label>
                <input
                  type="number"
                  value={config.bufferTime}
                  onChange={(e) => void handleConfigChange({ bufferTime: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  min="0"
                  step="5"
                />
              </div>
              <div>
                <label className="block text-sm mb-2">Max Booking Duration (minutes)</label>
                <input
                  type="number"
                  value={config.maxBookingDuration}
                  onChange={(e) => void handleConfigChange({ maxBookingDuration: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  min="30"
                  step="30"
                />
              </div>
              <div>
                <label className="block text-sm mb-2">Advance Booking Days</label>
                <input
                  type="number"
                  value={config.advanceBookingDays}
                  onChange={(e) => void handleConfigChange({ advanceBookingDays: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  min="1"
                  max="30"
                />
              </div>
              <div>
                <label className="block text-sm mb-2">Cancellation Cut-off (hours)</label>
                <input
                  type="number"
                  value={config.cancellationCutoffHours}
                  onChange={(e) => void handleConfigChange({ cancellationCutoffHours: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  min="0"
                />
              </div>
            </div>
            <div className="mt-6 p-4 bg-green-50 rounded-lg">
              <p className="text-green-700">All changes are saved automatically</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
