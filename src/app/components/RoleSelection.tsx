import { useNavigate } from 'react-router-dom';

type Role = 'coach' | 'player' | 'admin';

export function RoleSelection() {
  const navigate = useNavigate();

  const goToSignIn = (role: Role) => {
    navigate(`/sign-in?role=${role}`, { state: { role } });
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-cover bg-center relative"
      style={{ backgroundImage: `url('/landing-bg.png')` }}
    >
      <div className="absolute inset-0 bg-indigo-900/40 backdrop-blur-sm" />

      <div className="bg-[#73b8b4]/50 rounded-[56px] shadow-[0_20px_60px_rgba(0,0,0,0.38)] w-full max-w-md p-8 relative z-10 border border-black/10">
        <div className="text-center mb-8">
          <img src="/ventra-logo.png" alt="Ventra" className="h-36 w-auto mx-auto mb-6" />
          <h1 className="text-3xl text-gray-900 mb-2">Log In As</h1>
          <p className="text-gray-700">Choose your account type to continue</p>
        </div>

        <div className="space-y-4">
          <button
            onClick={() => goToSignIn('coach')}
            className="w-full bg-[#4d7f7b] text-white py-4 rounded-full shadow-md border-2 border-black-100 hover:bg-[#426d6a] hover:border-white transition-colors font-semibold uppercase tracking-wide"
          >
            Coach
          </button>
          <button
            onClick={() => goToSignIn('player')}
            className="w-full bg-[#4d7f7b] text-white py-4 rounded-full shadow-md border-2 border-black-100 hover:bg-[#426d6a] hover:border-white transition-colors font-semibold uppercase tracking-wide"
          >
            Player
          </button>
          <button
            onClick={() => goToSignIn('admin')}
            className="w-full bg-[#4d7f7b] text-white py-4 rounded-full shadow-md border-2 border-black-100 hover:bg-[#426d6a] hover:border-white transition-colors font-semibold uppercase tracking-wide"
          >
            Admin
          </button>
        </div>
      </div>
    </div>
  );
}
