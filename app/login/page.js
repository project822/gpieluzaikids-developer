import { Suspense } from 'react';
import LoginForm from '@/components/LoginForm';
import ThemeToggle from '@/components/ThemeToggle';

export const metadata = { title: 'Masuk — Eluzai Dev Console' };

export default function LoginPage() {
  return (
    <div className="login-wrap">
      {/* Kartu login meniru halaman login admin website utama (D:\church) */}
      <div className="login-card fade-in">
        <div className="position-absolute" style={{ top: 14, right: 14 }}>
          <ThemeToggle />
        </div>
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
