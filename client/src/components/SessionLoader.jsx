// Shown while a session stored in the browser is validated, so the app never
// redirects to the login screen before it knows whether the user is signed in.
export default function SessionLoader() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center">
      <p className="text-slate-500 text-sm">Checking your session…</p>
    </div>
  );
}
