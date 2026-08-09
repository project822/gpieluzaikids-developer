import { Suspense } from 'react';
import LoginForm from '@/components/LoginForm';

export const metadata = { title: 'Masuk — Eluzai Dev Console' };

export default function LoginPage() {
  return (
    <div className="login-wrap">
      <div className="login-card fade-in">
        <Suspense
          fallback={
            <div className="text-center py-5">
              <span className="spinner-border text-primary" role="status" aria-hidden="true" />
            </div>
          }
        >
          <LoginForm />
        </Suspense>
        <div className="login-footer-note">© GPI Eluzai · Dev Console</div>
      </div>
    </div>
  );
}
