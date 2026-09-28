import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api } from "./api";
import { useAuth } from "./auth";
import { OnboardingFlow } from "./OnboardingFlow";
import { PaidSetup } from "./PaidSetup";
import { actionButton, routeForAction } from "./home-navigation";
import { LearnExperience } from "./LearnExperience";
import { MarkedWords, SavedNotes } from "./LearningLibrary";
import { MyWork } from "./MyWork";
import { BillingPage,HelpPage,ProfilePage,SettingsPage } from "./AccountPages";

type NavItem = { to: string; label: string; icon: string };
const primaryNav: NavItem[] = [
  { to: "/home", label: "Home", icon: "⌂" },
  { to: "/learn", label: "Learn", icon: "▤" },
  { to: "/work", label: "My Work", icon: "▣" },
  { to: "/you", label: "You", icon: "♙" },
];
const secondaryNav: NavItem[] = [
  { to: "/notes", label: "Saved Notes", icon: "▧" },
  { to: "/marked-words", label: "Marked Words", icon: "Aa" },
  { to: "/billing", label: "Billing", icon: "◇" },
  { to: "/settings", label: "Settings", icon: "⚙" },
  { to: "/help", label: "Help & Support", icon: "?" },
];

export function App() {
  const auth = useAuth();
  if (auth.status === "loading") return <CenteredState title="Loading your workspace" detail="Restoring your saved AdaptiveSkills session…" busy />;
  if (auth.status === "error") return <CenteredState title="We couldn’t open your workspace" detail={auth.error} action="Try again" onAction={() => void auth.retry()} />;
  return <Routes>
    <Route path="/login" element={auth.status === "authenticated" ? <Navigate to="/home" replace /> : <Login />} />
    <Route element={<RequireSession />}>
      <Route element={<WorkspaceShell />}>
        <Route path="/home" element={<Home />} />
        <Route path="/learn" element={<LearnExperience />} />
        <Route path="/work" element={<MyWork />} />
        <Route path="/you" element={<ProfilePage />} />
        <Route path="/notes" element={<SavedNotes />} />
        <Route path="/marked-words" element={<MarkedWords />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/onboarding" element={<OnboardingFlow />} />
        <Route path="/setup" element={<PaidSetup />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to={auth.status === "authenticated" ? "/home" : "/login"} replace />} />
  </Routes>;
}

function RequireSession() {
  return useAuth().status === "authenticated" ? <Outlet /> : <Navigate to="/login" replace />;
}

function Login() {
  const auth = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!email.includes("@")) return setError("Enter a valid email address.");
    if (password.length < 12) return setError("Password must contain at least 12 characters.");
    setBusy(true);
    try {
      const session = mode === "login" ? await api.login(email, password) : await api.signup(email, password);
      await auth.authenticate(session.token);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }
  return <main className="auth-page">
    <section className="auth-intro">
      <Brand />
      <div className="auth-copy"><span className="eyebrow">LEARN. BUILD. GROW.</span><h1>Your adaptive learning path, now with room to work.</h1><p>Continue the same profile, progress, notes, labs, and evidence you use on mobile.</p></div>
    </section>
    <section className="auth-panel">
      <form className="auth-card" onSubmit={submit}>
        <span className="eyebrow">ADAPTIVESKILLS WEB</span>
        <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2>
        <p className="muted">Use the same account as the AdaptiveSkills mobile app.</p>
        <label>Email<input autoFocus type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></label>
        <label>Password<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={event => setPassword(event.target.value)} placeholder="12 or more characters" /></label>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}<span>→</span></button>
        <button className="text-button" type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>{mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}</button>
      </form>
    </section>
  </main>;
}

function WorkspaceShell() {
  const auth = useAuthenticated();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [location.pathname]);
  const title = [...primaryNav, ...secondaryNav].find(item => item.to === location.pathname)?.label ?? "AdaptiveSkills";
  const initial = (auth.onboarding.profile.displayName || "L").trim().charAt(0).toUpperCase();
  return <div className="workspace">
    <button className={`sidebar-backdrop ${open ? "visible" : ""}`} aria-label="Close navigation" onClick={() => setOpen(false)} />
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <Brand compact />
      <nav aria-label="Primary navigation" className="nav-list">{primaryNav.map(item => <SidebarLink key={item.to} item={item} />)}</nav>
      <div className="sidebar-divider" />
      <nav aria-label="Secondary navigation" className="nav-list secondary">{secondaryNav.map(item => <SidebarLink key={item.to} item={item} />)}</nav>
      <div className="sidebar-account"><div className="avatar">{initial}</div><div><strong>{auth.onboarding.profile.displayName || "Learner"}</strong><span>{auth.onboarding.profile.currentRole || "Adaptive learner"}</span></div></div>
      <button className="sign-out" onClick={() => void auth.signOut()}><span>↪</span> Sign out</button>
    </aside>
    <div className="workspace-main">
      <header className="top-header">
        <button className="menu-button" aria-label="Open navigation" onClick={() => setOpen(true)}>☰</button>
        <div><span className="header-kicker">YOUR WORKSPACE</span><h1>{title}</h1></div>
        <div className="header-actions"><span className={`access-pill ${auth.home?.trial.status === "ACTIVE" ? "active" : ""}`}>● {accessLabel(auth.home?.trial.status)}</span><div className="avatar small">{initial}</div></div>
      </header>
      <main className="page"><Outlet /></main>
    </div>
  </div>;
}

function SidebarLink({ item }: { item: NavItem }) {
  return <NavLink to={item.to} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}><span className="nav-icon">{item.icon}</span><span>{item.label}</span></NavLink>;
}

function Home() {
  const auth = useAuthenticated();
  const { onboarding, home } = auth;
  const navigate = useNavigate();
  const goal = onboarding.goal?.target || "Your learning goal";
  const action = home?.primaryAction.type;
  const actionRoute = !onboarding.completed ? "/onboarding" : routeForAction(action);
  const actionLabel = !onboarding.completed ? "Resume setup" : actionButton(action);
  async function primaryAction() {
    if (action === "WAIT_REFRESH") return auth.refresh();
    navigate(actionRoute);
  }
  return <div className="content-grid">
    <section className="content-column">
      <div className="welcome-row"><div><span className="eyebrow">WELCOME BACK</span><h2>{onboarding.profile.displayName || "Learner"}</h2><p>Continue with the same saved learning state from any device.</p></div><div className="welcome-mark">✦</div></div>
      {!onboarding.completed ? <Notice><strong>Your profile setup is in progress.</strong><br />Continue from {readable(onboarding.currentStep)}. Your exact backend version is saved.</Notice> : null}
      <article className="primary-card">
        <div className="card-icon">🚀</div><div className="card-copy"><span className="eyebrow">YOUR NEXT STEP</span><h3>{home ? actionTitle(home.primaryAction.type) : "Continue setup"}</h3><p>{home ? homeDescription(home.primaryAction.type, home.learningState || home.trial.status) : "Finish your learner setup to prepare your learning path."}</p></div>
        <button className="primary-button compact" onClick={() => void primaryAction()}>{actionLabel}<span>→</span></button>
      </article>
      <section className="section-card"><div className="section-heading"><div><span className="eyebrow">CURRENT DIRECTION</span><h3>{goal}</h3></div><span className="personal-pill">✦ Just for you</span></div><div className="summary-grid"><Summary label="Current role" value={onboarding.profile.currentRole || "Not set"} /><Summary label="Timeline" value={onboarding.preferences.timelineDays ? `${onboarding.preferences.timelineDays} days` : "Not set"} /><Summary label="Pace" value={readable(onboarding.preferences.pace || "Not set")} /><Summary label="Skills saved" value={String(onboarding.skills.length)} /></div></section>
    </section>
    <aside className="context-column">
      <section className="context-card"><span className="eyebrow">ACCESS</span><h3>{accessLabel(home?.trial.status)}</h3><p>{home ? `Backend state: ${readable(home.learningState || home.state)}.` : "Your access state will appear after onboarding is complete."}</p><NavLink to="/billing" className="inline-link">View billing →</NavLink></section>
      <section className="context-card"><span className="eyebrow">SYNCED ACCOUNT</span><h3>One learning record</h3><p>Profile, progress, notes, evidence, and continuation state stay owned by the existing backend.</p></section>
    </aside>
  </div>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="summary"><span>{label}</span><strong>{value}</strong></div>;
}

function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" }) {
  return <div className={`notice ${tone}`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}

function CenteredState({ title, detail, busy = false, action, onAction }: { title: string; detail: string; busy?: boolean; action?: string; onAction?: () => void }) {
  return <main className="centered-state"><Brand /><div className="state-card">{busy ? <div className="spinner" /> : <div className="state-icon">!</div>}<h1>{title}</h1><p>{detail}</p>{action ? <button className="primary-button" onClick={onAction}>{action}<span>→</span></button> : null}</div></main>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? "compact" : ""}`}><div className="brand-mark">A</div><div><strong>Adaptive<span>Skills</span></strong><small>Learn. Build. Grow.</small></div></div>;
}

function useAuthenticated() {
  const auth = useAuth();
  if (auth.status !== "authenticated") throw new Error("Authenticated route rendered without a session");
  return auth;
}

function accessLabel(status?: string) {
  if (status === "ACTIVE" || status === "ACTIVE_SETUP_PENDING") return "Trial active";
  if (status === "COMPLETED") return "Runway complete";
  if (status === "PURCHASE_PENDING") return "Purchase pending";
  return "Profile ready";
}

function actionTitle(action: string) {
  if (action === "START_LAB") return "Start your practical lab";
  if (action === "RESUME_LAB") return "Resume your practical lab";
  if (action === "DOUBT_CLEARANCE") return "Clear your learning doubts";
  if (action === "REVIEW_NEXT_RUNWAY" || action === "VIEW_NEXT_RUNWAY") return "Review your next runway";
  if (action === "CONTINUE_TRIAL_SETUP") return "Continue trial setup";
  return "Continue learning";
}

function homeDescription(action: string, state: string) {
  const saved = `Your saved state is ${readable(state)}.`;
  if (action === "CONTINUE_TRIAL_SETUP") return `${saved} Continue target analysis and learning-scope confirmation.`;
  if (action === "START_TRIAL_PURCHASE") return `${saved} Your profile is complete and trial access is available.`;
  if (action === "WAIT_FOR_PURCHASE") return `${saved} Purchase reconciliation is still in progress.`;
  if (action === "START_LAB" || action === "RESUME_LAB") return `${saved} Your practical work is saved with the current unit.`;
  if (action === "REVIEW_NEXT_RUNWAY" || action === "VIEW_NEXT_RUNWAY") return `${saved} Your existing continuation proposal is ready to review.`;
  return `${saved} Continue from the position prepared by the backend.`;
}

function readable(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/^./, character => character.toUpperCase());
}
