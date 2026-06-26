import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2, ArrowRight } from 'lucide-react';
import { authApi } from '@/services/api';
import { Button } from '@/components/common';

export default function VerifyEmailPage() {
  const [searchParams]            = useSearchParams();
  const [status, setStatus]       = useState('loading'); // 'loading' | 'success' | 'error'
  const [errorMessage, setError]  = useState('');

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setError('Verification link is missing a token. Please use the link sent to your email.');
      setStatus('error');
      return;
    }

    authApi.verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        const msg = err.response?.data?.message || 'Verification failed. The link may be invalid or expired.';
        setError(msg);
        setStatus('error');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
        <p className="text-sm text-muted">Verifying your email…</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-3 py-4">
          <CheckCircle className="w-14 h-14 text-emerald-400" />
          <h1 className="text-2xl font-display font-bold text-primary">Email verified</h1>
          <p className="text-sm text-muted text-center">
            Your email has been verified successfully. You can now sign in to your account.
          </p>
        </div>

        <Link to="/login">
          <Button variant="brand" size="lg" className="w-full">
            Go to Login
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3 py-4">
        <XCircle className="w-14 h-14 text-red-400" />
        <h1 className="text-2xl font-display font-bold text-primary">Verification failed</h1>
        <p className="text-sm text-muted text-center">{errorMessage}</p>
      </div>

      <Link to="/login">
        <Button variant="outline" size="lg" className="w-full">
          Back to Login
        </Button>
      </Link>
    </div>
  );
}
