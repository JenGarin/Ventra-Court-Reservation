import React, { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Search, Filter, Trash2, Mail, CheckCircle, BadgeCheck, Clock3, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export function UserManagementView() {
  const {
    users,
    adminUpdateUser,
    adminDeleteUser,
    currentUser,
    getCoachVerificationQueue,
    approveCoachVerification,
    rejectCoachVerification,
  } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [verificationFilter, setVerificationFilter] = useState<'pending' | 'verified' | 'rejected' | 'unverified'>('pending');
  const [verificationQueue, setVerificationQueue] = useState<typeof users>([]);
  const [isVerificationLoading, setIsVerificationLoading] = useState(false);
  const [verificationReviewModal, setVerificationReviewModal] = useState<{
    open: boolean;
    action: 'approve' | 'reject';
    coachId: string;
    coachName: string;
  }>({
    open: false,
    action: 'approve',
    coachId: '',
    coachName: '',
  });
  const [verificationReviewText, setVerificationReviewText] = useState('');
  const [isSubmittingVerificationReview, setIsSubmittingVerificationReview] = useState(false);

  const filteredUsers = users.filter(user => {
    const matchesSearch = (user.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
                          user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await adminUpdateUser(userId, { role: newRole });
      toast.success(`User role updated to ${newRole}`);
    } catch (error) {
      toast.error('Failed to update role');
    }
  };

  const handleDelete = async (userId: string) => {
    if (userId === currentUser?.id) {
      toast.error("You cannot delete your own account.");
      return;
    }
    if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      try {
        await adminDeleteUser(userId);
        toast.success('User deleted successfully');
      } catch (error) {
        toast.error('Failed to delete user');
      }
    }
  };

  const loadVerificationQueue = async () => {
    if (currentUser?.role !== 'admin' && currentUser?.role !== 'staff') {
      setVerificationQueue([]);
      return;
    }
    setIsVerificationLoading(true);
    try {
      const rows = await getCoachVerificationQueue({ status: verificationFilter });
      setVerificationQueue(rows);
    } catch {
      toast.error('Failed to load coach verification queue.');
    } finally {
      setIsVerificationLoading(false);
    }
  };

  useEffect(() => {
    loadVerificationQueue();
  }, [verificationFilter, currentUser?.role]);

  const openVerificationReviewModal = (
    coachId: string,
    coachName: string,
    action: 'approve' | 'reject'
  ) => {
    setVerificationReviewText('');
    setVerificationReviewModal({
      open: true,
      action,
      coachId,
      coachName,
    });
  };

  const closeVerificationReviewModal = () => {
    if (isSubmittingVerificationReview) return;
    setVerificationReviewModal((prev) => ({ ...prev, open: false }));
    setVerificationReviewText('');
  };

  const handleSubmitVerificationReview = async () => {
    const { coachId, action } = verificationReviewModal;
    if (!coachId) return;
    setIsSubmittingVerificationReview(true);
    try {
      if (action === 'approve') {
        await approveCoachVerification(coachId, verificationReviewText.trim() || undefined);
        toast.success('Coach verification approved.');
      } else {
        await rejectCoachVerification(coachId, verificationReviewText.trim() || undefined);
        toast.success('Coach verification rejected.');
      }
      setVerificationReviewModal((prev) => ({ ...prev, open: false }));
      setVerificationReviewText('');
      await loadVerificationQueue();
    } catch {
      toast.error(action === 'approve' ? 'Failed to approve coach verification.' : 'Failed to reject coach verification.');
    } finally {
      setIsSubmittingVerificationReview(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 p-6 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">User Management</h1>
          <p className="text-slate-500 dark:text-slate-400">Manage system access and user roles.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search users..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-teal-500 outline-none w-64"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select 
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="pl-10 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-teal-500 outline-none appearance-none cursor-pointer"
            >
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="staff">Staff</option>
              <option value="coach">Coach</option>
              <option value="player">Player</option>
            </select>
          </div>
        </div>
      </div>

      {(currentUser?.role === 'admin' || currentUser?.role === 'staff') && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Coach Verification Queue</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Review coach identity and credentials submissions.</p>
            </div>
            <select
              value={verificationFilter}
              onChange={(e) => setVerificationFilter(e.target.value as 'pending' | 'verified' | 'rejected' | 'unverified')}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
            >
              <option value="pending">Pending</option>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
              <option value="unverified">Unverified</option>
            </select>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {isVerificationLoading && (
              <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Loading verification queue...</p>
            )}
            {!isVerificationLoading && verificationQueue.length === 0 && (
              <p className="p-4 text-sm text-slate-500 dark:text-slate-400">No coaches found for this filter.</p>
            )}
            {!isVerificationLoading &&
              verificationQueue.map((coach) => (
                <div key={coach.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white text-sm">{coach.name || coach.email}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{coach.email}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {coach.coachVerificationMethod || 'method not set'} - {coach.coachVerificationDocumentName || 'document not set'}
                    </p>
                    {coach.coachVerificationNotes && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Notes: {coach.coachVerificationNotes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                        coach.coachVerificationStatus === 'verified'
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                          : coach.coachVerificationStatus === 'pending'
                            ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300'
                            : 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'
                      }`}
                    >
                      {coach.coachVerificationStatus === 'verified' ? <BadgeCheck size={10} /> : coach.coachVerificationStatus === 'pending' ? <Clock3 size={10} /> : <XCircle size={10} />}
                      {coach.coachVerificationStatus || 'unverified'}
                    </span>
                    {coach.coachVerificationStatus === 'pending' && (
                      <>
                        <button
                          onClick={() => openVerificationReviewModal(coach.id, coach.name || coach.email, 'approve')}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => openVerificationReviewModal(coach.id, coach.name || coach.email, 'reject')}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-colors"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">User</th>
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Role</th>
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Status</th>
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-teal-700 dark:text-teal-400 font-bold">
                        {user.avatar ? <img src={user.avatar} alt={user.name} className="w-full h-full rounded-full object-cover" /> : (user.name?.[0] || user.email[0]).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white text-sm">{user.name || 'Unnamed User'}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <Mail size={10} /> {user.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <select 
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      disabled={currentUser?.role === 'staff' && user.role === 'admin'}
                      className="text-xs font-bold uppercase bg-slate-100 dark:bg-slate-800 border-none rounded px-2 py-1 cursor-pointer focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="player">Player</option>
                      <option value="coach">Coach</option>
                      <option value="staff">Staff</option>
                      <option value="admin" disabled={currentUser?.role === 'staff'}>
                        Admin
                      </option>
                    </select>
                  </td>
                  <td className="p-4">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                      <CheckCircle size={10} /> Active
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    {currentUser?.role === 'admin' && (
                      <button 
                        onClick={() => handleDelete(user.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                        title="Delete User"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredUsers.length === 0 && (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">
            No users found matching your search.
          </div>
        )}
      </div>

      {verificationReviewModal.open && (
        <div className="fixed inset-0 z-50 bg-black/40 p-4 flex items-center justify-center">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {verificationReviewModal.action === 'approve' ? 'Approve Coach Verification' : 'Reject Coach Verification'}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {verificationReviewModal.coachName}
              </p>
            </div>
            <div className="p-5 space-y-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {verificationReviewModal.action === 'approve' ? 'Approval note (optional)' : 'Rejection reason (optional)'}
              </label>
              <textarea
                value={verificationReviewText}
                onChange={(e) => setVerificationReviewText(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none resize-none"
                placeholder={
                  verificationReviewModal.action === 'approve'
                    ? 'Add optional internal review note.'
                    : 'Explain why this verification is being rejected.'
                }
              />
            </div>
            <div className="p-5 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                onClick={closeVerificationReviewModal}
                disabled={isSubmittingVerificationReview}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSubmitVerificationReview()}
                disabled={isSubmittingVerificationReview}
                className={`px-4 py-2 rounded-lg text-white disabled:opacity-60 ${
                  verificationReviewModal.action === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {isSubmittingVerificationReview
                  ? 'Submitting...'
                  : verificationReviewModal.action === 'approve'
                    ? 'Approve'
                    : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
