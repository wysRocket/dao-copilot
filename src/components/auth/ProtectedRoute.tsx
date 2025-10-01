import React from 'react';
import {useAuth} from '@/contexts/AuthContext';
import Login from './Login';

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function ProtectedRoute({
  children,
  fallback,
}: ProtectedRouteProps) {
  const {user, loading} = useAuth();

  if (loading) {
    return (
      fallback || (
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="mb-2 text-lg">Loading...</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Please wait while we verify your authentication
            </div>
          </div>
        </div>
      )
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Login />
      </div>
    );
  }

  return <>{children}</>;
}
