import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { PASSWORD_MIN_LENGTH } from '@/config/authPolicy';
import { User, Lock, Save, Bell, Shield, BadgeCheck } from 'lucide-react';
import { toast } from 'sonner';

export function ProfileSettings() {
  const { currentUser, updateUser, updateCoachProfile, submitCoachVerification, changePassword } = useApp();
  const [isLoading, setIsLoading] = useState(false);
  
  // Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Profile State
  const [name, setName] = useState(currentUser?.name || 'Alex Johnson');
  const [email, setEmail] = useState(currentUser?.email || 'alex@example.com');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [skillLevel, setSkillLevel] = useState(currentUser?.skillLevel || 'beginner');
  const [avatar, setAvatar] = useState(currentUser?.avatar || '');
  const [coachProfile, setCoachProfile] = useState(currentUser?.coachProfile || '');
  const [coachExpertiseInput, setCoachExpertiseInput] = useState((currentUser?.coachExpertise || []).join(', '));
  const [verificationMethod, setVerificationMethod] = useState(currentUser?.coachVerificationMethod || 'certification');
  const [verificationId, setVerificationId] = useState(currentUser?.coachVerificationId || '');
  const [verificationNotes, setVerificationNotes] = useState(currentUser?.coachVerificationNotes || '');
  const [verificationDocumentName, setVerificationDocumentName] = useState(currentUser?.coachVerificationDocumentName || '');
  const isCoach = currentUser?.role === 'coach';

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be 2MB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatar(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleVerificationDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVerificationDocumentName(file.name);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const coachExpertise = coachExpertiseInput
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const hasVerificationPayload =
        verificationId.trim() !== '' ||
        verificationNotes.trim() !== '' ||
        verificationDocumentName.trim() !== '';

      await updateUser({
        name,
        email,
        phone,
        skillLevel,
        avatar,
      });

      if (isCoach) {
        await updateCoachProfile({
          avatar,
          coachProfile: coachProfile.trim(),
          coachExpertise,
        });

        if (hasVerificationPayload && verificationDocumentName.trim() !== '') {
          await submitCoachVerification({
            method: verificationMethod as 'certification' | 'license' | 'experience' | 'other',
            documentName: verificationDocumentName.trim(),
            verificationId: verificationId.trim() || undefined,
            notes: verificationNotes.trim() || undefined,
          });
        }
      }

      toast.success('Profile updated successfully');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
        toast.error('Please enter your current password');
        return;
    }
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
        toast.error(`New password must be at least ${PASSWORD_MIN_LENGTH} characters`);
        return;
    }
    if (newPassword !== confirmPassword) {
        toast.error('New passwords do not match');
        return;
    }
    setIsLoading(true);
    try {
      const result = await changePassword(currentPassword, newPassword);
      if (!result.success) {
        toast.error(result.message || 'Failed to change password');
        return;
      }
      toast.success(result.message || 'Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
        <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Profile Settings</h1>
            <p className="text-slate-600 dark:text-slate-300">Manage your account preferences and security.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-8">
                {/* Profile Information */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                        <User className="w-5 h-5 text-teal-600" />
                        Personal Information
                    </h2>
                    <form onSubmit={handleUpdateProfile} className="space-y-4">
                        <div className="grid md:grid-cols-2 gap-4">
                            {isCoach && (
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Profile Picture</label>
                                    <div className="flex items-center gap-4">
                                        <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                                            {avatar ? (
                                                <img src={avatar} alt="Coach avatar preview" className="w-full h-full object-cover" />
                                            ) : (
                                                <User className="w-7 h-7 text-slate-400" />
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handleAvatarUpload}
                                                className="w-full text-sm text-slate-700 dark:text-slate-300 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-teal-600 file:text-white hover:file:bg-teal-700"
                                            />
                                            <p className="text-xs text-slate-500 mt-1">PNG/JPG up to 2MB</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                                <input 
                                    type="text" 
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
                                <input 
                                    type="email" 
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Phone Number</label>
                                <input 
                                    type="tel" 
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                                    placeholder="+1 (555) 000-0000"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Skill Level</label>
                                <select 
                                    value={skillLevel}
                                    onChange={(e) => setSkillLevel(e.target.value as any)}
                                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                                >
                                    <option value="beginner">Beginner</option>
                                    <option value="intermediate">Intermediate</option>
                                    <option value="advanced">Advanced</option>
                                    <option value="expert">Expert</option>
                                </select>
                            </div>
                        </div>
                        {isCoach && (
                            <div className="grid md:grid-cols-1 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Coach Profile</label>
                                    <textarea
                                        value={coachProfile}
                                        onChange={(e) => setCoachProfile(e.target.value)}
                                        rows={3}
                                        className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition-all resize-none"
                                        placeholder="Describe your coaching background, style, and approach."
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Expertise (comma-separated)</label>
                                    <input
                                        type="text"
                                        value={coachExpertiseInput}
                                        onChange={(e) => setCoachExpertiseInput(e.target.value)}
                                        className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                                        placeholder="Shooting, Footwork, Defensive Drills"
                                    />
                                </div>
                                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/40">
                                    <div className="flex items-center justify-between gap-2 mb-3">
                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 inline-flex items-center gap-2">
                                            <BadgeCheck className="w-4 h-4 text-teal-600" />
                                            Coach Verification
                                        </label>
                                        <span
                                            className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase ${
                                                currentUser?.coachVerificationStatus === 'verified'
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : currentUser?.coachVerificationStatus === 'pending'
                                                        ? 'bg-amber-100 text-amber-700'
                                                        : 'bg-slate-200 text-slate-700'
                                            }`}
                                        >
                                            {currentUser?.coachVerificationStatus || 'unverified'}
                                        </span>
                                    </div>
                                    <div className="grid md:grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Verification Type</label>
                                            <select
                                                value={verificationMethod}
                                                onChange={(e) => setVerificationMethod(e.target.value as any)}
                                                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
                                            >
                                                <option value="certification">Certification</option>
                                                <option value="license">License</option>
                                                <option value="experience">Experience Proof</option>
                                                <option value="other">Other</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Certification/License ID</label>
                                            <input
                                                type="text"
                                                value={verificationId}
                                                onChange={(e) => setVerificationId(e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
                                                placeholder="Enter credential number"
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Upload Supporting Document</label>
                                            <input
                                                type="file"
                                                onChange={handleVerificationDocumentUpload}
                                                className="w-full text-sm text-slate-700 dark:text-slate-300 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-teal-600 file:text-white hover:file:bg-teal-700"
                                            />
                                            {verificationDocumentName && (
                                                <p className="text-xs text-slate-500 mt-1">Selected: {verificationDocumentName}</p>
                                            )}
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Verification Notes</label>
                                            <textarea
                                                value={verificationNotes}
                                                onChange={(e) => setVerificationNotes(e.target.value)}
                                                rows={2}
                                                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none resize-none"
                                                placeholder="Add issuing organization or credential details."
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="flex justify-end pt-4">
                            <button 
                                type="submit"
                                disabled={isLoading}
                                className="px-6 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                <Save size={18} />
                                Save Changes
                            </button>
                        </div>
                    </form>
                </div>

                {/* Password Change */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                        <Shield className="w-5 h-5 text-teal-600" />
                        Security
                    </h2>
                    <form onSubmit={handleUpdatePassword} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Current Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input 
                                    type="password" 
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                                    placeholder="Enter current password"
                                />
                            </div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">New Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input 
                                        type="password" 
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        minLength={PASSWORD_MIN_LENGTH}
                                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                                        placeholder="Enter new password"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Confirm New Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input 
                                        type="password" 
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        minLength={PASSWORD_MIN_LENGTH}
                                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                                        placeholder="Confirm new password"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end pt-4">
                            <button 
                                type="submit"
                                disabled={isLoading}
                                className="px-6 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                <Save size={18} />
                                Update Password
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <div className="space-y-6">
                <div className="bg-teal-600 rounded-2xl p-6 text-white shadow-lg shadow-teal-200 dark:shadow-none">
                    <h3 className="font-bold text-lg mb-2">Account Security</h3>
                    <p className="text-teal-100 text-sm mb-4">Enable two-factor authentication to add an extra layer of security to your account.</p>
                    <button className="w-full bg-white text-teal-600 py-2 rounded-lg font-bold text-sm hover:bg-teal-50 transition-colors">
                        Enable 2FA
                    </button>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
                    <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                        <Bell className="w-5 h-5 text-slate-400" />
                        Notifications
                    </h3>
                    <div className="space-y-3">
                        <label className="flex items-center justify-between cursor-pointer">
                            <span className="text-sm text-slate-600 dark:text-slate-400">Email Notifications</span>
                            <input type="checkbox" defaultChecked className="accent-teal-600 w-4 h-4" />
                        </label>
                        <label className="flex items-center justify-between cursor-pointer">
                            <span className="text-sm text-slate-600 dark:text-slate-400">SMS Alerts</span>
                            <input type="checkbox" className="accent-teal-600 w-4 h-4" />
                        </label>
                        <label className="flex items-center justify-between cursor-pointer">
                            <span className="text-sm text-slate-600 dark:text-slate-400">Marketing Updates</span>
                            <input type="checkbox" defaultChecked className="accent-teal-600 w-4 h-4" />
                        </label>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
}
