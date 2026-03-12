import React, { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { useNavigate } from 'react-router-dom';

// Component Imports
import { Sidebar } from '../components/Sidebar';
import { SettingsView } from '../components/SettingsView';
import { PendingBookings } from './PendingBookings';

// A simple placeholder for view components that haven't been created yet.
const PlaceholderView = ({ viewName }: { viewName: string }) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm animate-in fade-in duration-300">
    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{viewName}</h2>
    <p className="text-slate-500 dark:text-slate-400">This is a placeholder for the {viewName} component. You can create this component and add it to the `renderView` function.</p>
  </div>
);

export function DashboardPage() {
  const { currentUser } = useApp();
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState('dashboard');

  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
    }
  }, [currentUser, navigate]);

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <PlaceholderView viewName="Dashboard" />;
      case 'requests':
        return <PendingBookings />;
      case 'booking':
        return <PlaceholderView viewName="Book a Court" />;
      case 'my-bookings':
        return <PlaceholderView viewName="My Bookings" />;
      case 'coach-sessions':
        return <PlaceholderView viewName="Coach Sessions" />;
      case 'court-mgmt':
        return <PlaceholderView viewName="Court Management" />;
      case 'users':
        return <PlaceholderView viewName="User Management" />;
      case 'analytics':
        return <PlaceholderView viewName="Analytics" />;
      case 'notifications':
        return <PlaceholderView viewName="Notifications" />;
      case 'profile':
        return <PlaceholderView viewName="Profile" />;
      case 'settings':
        return <SettingsView />;
      case 'billing':
        return <PlaceholderView viewName="Billing" />;
      case 'pricing':
        return <PlaceholderView viewName="Pricing" />;
      default:
        return <PlaceholderView viewName="Dashboard" />;
    }
  };

  if (!currentUser) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <p className="text-slate-500">Loading user...</p>
      </div>
    );
  }

  return (
    <div className="flex bg-slate-50 dark:bg-slate-950 min-h-screen">
      <Sidebar 
        currentView={currentView} 
        onViewChange={setCurrentView} 
        role={currentUser.role} 
      />
      <main className="flex-1 ml-64 p-8">
        {renderView()}
      </main>
    </div>
  );
}