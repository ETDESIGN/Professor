import React, { useState } from 'react';
import { BookOpen, User, Lock, ArrowRight, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { signInWithPassword, signUp, UserRole, AuthUser } from '../services/AuthService';
import { useAppStore } from '../store/useAppStore';
import { supabase } from '../services/supabaseClient';

interface LoginProps {
  onLogin: (role: 'district_admin' | 'teacher' | 'student' | 'parent') => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [role, setRole] = useState<'district_admin' | 'teacher' | 'student' | 'parent'>('teacher');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  const { setUserProfile } = useAppStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        // Sign up new user
        const result = await signUp(email, password, role as UserRole);
        if (!result.success) {
          setError(result.error || 'Sign up failed');
          setIsLoading(false);
          return;
        }

        // Check if email confirmation is required
        if (result.needsEmailConfirmation) {
          // Show friendly message instead of trying to auto-login
          setError(null);
          setSuccessMessage('Sign up successful! Please check your email to confirm your account.');
          setIsLoading(false);
          return;
        }

        // If no email confirmation required, try to sign in
        const loginResult = await signInWithPassword(email, password);
        if (!loginResult.success) {
          // Don't treat as error - account was created, just tell them to login
          setSuccessMessage('Sign up successful! Please sign in with your credentials.');
          setIsLoading(false);
          setIsSignUp(false); // Switch to sign in mode
          return;
        }
        if (loginResult.user) {
          setUserProfile(loginResult.user);
        }
        onLogin(role);
      } else {
        // Sign in with Supabase Auth
        const result = await signInWithPassword(email, password);
        if (!result.success) {
          setError(result.error || 'Invalid email or password');
          setIsLoading(false);
          return;
        }

        // Check if user's role matches the selected portal
        const userRole = result.user?.role;
        if (userRole && userRole !== role && role !== 'district_admin') {
          setError(`Your account is registered as a ${userRole}. Please use the ${userRole} portal.`);
          setIsLoading(false);
          return;
        }

        // Store user in global state
        if (result.user) {
          setUserProfile(result.user);
        }

        onLogin(role);
      }
    } catch (err) {
      setError('An unexpected error occurred');
    }
    setIsLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (resetError) {
        setError(resetError.message);
      } else {
        setSuccessMessage('Password reset link sent! Check your email.');
      }
    } catch {
      setError('Failed to send reset email. Please try again.');
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
            <BookOpen className="text-white" size={32} />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900 font-display">
          Lesson Orchestrator
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          Sign in to your account
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-slate-200">

          {/* Role Selector */}
          {!isResetMode && (
          <div className="flex justify-center gap-2 mb-8 bg-slate-100 p-1 rounded-lg">
            {(['teacher', 'student', 'parent'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`flex-1 py-2 text-sm font-medium rounded-md capitalize transition-colors ${role === r
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
                  }`}
              >
                {r}
              </button>
            ))}
           </div>
          )}

          <form className="space-y-6" onSubmit={isResetMode ? handleResetPassword : handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Email address
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-md py-2 px-3 border"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {!isResetMode && (
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Password
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-md py-2 px-3 border"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            )}

            {!isResetMode && (
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded"
                  />
                  <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-900">
                    Remember me
                  </label>
                </div>

                <div className="text-sm">
                  <button type="button" onClick={() => { setIsResetMode(true); setError(null); setSuccessMessage(null); }} className="font-medium text-indigo-600 hover:text-indigo-500">
                    Forgot your password?
                  </button>
                </div>
              </div>
            )}

            {successMessage && (
              <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 p-3 rounded-md">
                <AlertCircle size={16} />
                {successMessage}
              </div>
            )}
            {error && !successMessage && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-md">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="animate-spin" size={20} /> : isResetMode ? 'Send Reset Link' : isSignUp ? 'Sign up' : 'Sign in'}
              </button>
            </div>

            <div className="text-center">
              {isResetMode ? (
                <button
                  type="button"
                  onClick={() => { setIsResetMode(false); setError(null); setSuccessMessage(null); }}
                  className="text-sm text-indigo-600 hover:text-indigo-500 flex items-center justify-center gap-1"
                >
                  <ArrowLeft size={14} /> Back to sign in
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { setIsSignUp(!isSignUp); setError(null); setSuccessMessage(null); }}
                  className="text-sm text-indigo-600 hover:text-indigo-500"
                >
                  {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                </button>
              )}
            </div>
          </form>

        </div>
      </div>
    </div>
  );
};

export default Login;
