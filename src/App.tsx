'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { LIVE_PRIVACY_NOTICE } from './lib/privacy';
import {
  Activity,
  Plus,
  History,
  FileText,
  Settings,
  FlaskConical,
  Cpu,
  Monitor,
  Wifi,
  Bot,
  ChevronRight,
  ShieldCheck,
  Search,
  LoaderCircle,
  MessageSquare,
  PanelRight,
  MoreHorizontal,
  Moon,
  Sun,
  ArrowRight,
  ImagePlus,
  ListChecks,
  Smartphone,
  BookOpen,
} from 'lucide-react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarGroup,
} from '@/components/ui/sidebar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Toaster, toast } from 'sonner';
import { Session } from '@/lib/diagnostic/types';
import { workspace } from '@/lib/workspace';
import { diagnose } from '@/lib/diagnose';
import { LIVE_DISABLED_MESSAGE, type PublicConfig } from '@/lib/live-config';
import { ModeIndicator } from '@/components/fixpilot/mode-indicator';
import { scenarios } from '@/lib/diagnostic/demo';
import { getSafetyCopy } from '@/lib/diagnostic/safety';
import { ChatPanel, MessageComposer } from '@/components/fixpilot/chat';
import { HypothesisPanel } from '@/components/fixpilot/diagnostic-panels';
import { SessionManager } from '@/components/fixpilot/session-manager';
import {
  draftSession,
  sessionTitle,
  sessionStatus,
  liveExample,
  sessionId,
} from '@/lib/diagnostic/session';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { ReportView } from '@/components/fixpilot/report';
const icons = [Bot, Monitor, Cpu, Wifi];
type View =
  'home' | 'diagnosis' | 'history' | 'reports' | 'settings' | 'report';
export default function Home() {
  const [view, setView] = useState<View>('home'),
    [session, setSession] = useState<Session | null>(null),
    [sessions, setSessions] = useState<Session[]>([]),
    [reports, setReports] = useState<
      {
        id: string;
        session: Session;
        created_at: string;
      }[]
    >([]),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(''),
    [error, setError] = useState(''),
    [liveLimit, setLiveLimit] = useState<{
      id: string;
      message: string;
    } | null>(null),
    [loading, setLoading] = useState(true),
    [config, setConfig] = useState<PublicConfig | null>(null),
    [query, setQuery] = useState(''),
    [demos, setDemos] = useState(false),
    [reportSession, setReportSession] = useState<Session | null>(null),
    [retryText, setRetryText] = useState<{
      text: string;
      image?: string;
    } | null>(null),
    [pending, setPending] = useState<{
      text: string;
      image?: string;
    } | null>(null),
    [evidenceOpen, setEvidenceOpen] = useState(false),
    [starterPrompt, setStarterPrompt] = useState('');
  const requestInFlight = useRef(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [managed, setManaged] = useState<Session | null>(null),
    [mobile, setMobile] = useState(false),
    [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width:900px)');
    const update = () => {
      setMobile(mq.matches);
      setEvidenceOpen(!mq.matches);
    };
    update();
    mq.addEventListener('change', update);
    const theme = localStorage.getItem('fixpilot-theme');
    setDark(
      theme
        ? theme === 'dark'
        : true,
    );
    return () => mq.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  function toggleTheme() {
    setDark(!dark);
    localStorage.setItem('fixpilot-theme', !dark ? 'dark' : 'light');
  }
  function updateSession(s: Session) {
    setSessions((prev) => prev.map((x) => (x.id === s.id ? s : x)));
    if (session?.id === s.id) setSession(s);
  }
  function removeSession(id: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setReports((prev) => prev.filter((r) => r.session.id !== id));
    if (session?.id === id) {
      setSession(null);
      setView('home');
    }
  }
  const refreshConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/config', { cache: 'no-store' });
      if (!response.ok) throw new Error('Configuration unavailable');
      setConfig(await response.json());
    } catch {
      // Preserve a known model name, but never retain stale enabled/quota state.
      setConfig((previous) => previous ? { ...previous, liveAI: false, usage: null } : null);
    }
  }, []);
  useEffect(() => {
    if (!config?.liveAI) return;
    const refresh = () => { if (document.visibilityState === 'visible') void refreshConfig(); };
    const timer = window.setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [config?.liveAI, refreshConfig]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [saved, reports] = await Promise.all([
        workspace.sessions(),
        workspace.reports(),
      ]);
      setSessions(saved);
      setReports(reports);
      await refreshConfig();
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [refreshConfig]);
  useEffect(() => {
    void load();
    setEvidenceOpen(window.matchMedia('(min-width:901px)').matches);
  }, [load]);
  const start = useCallback(
    async (mode: 'demo' | 'live', scenario = 'robot') => {
      if (requestInFlight.current) return;
      const s = draftSession(mode, scenario);
      setSession(s);
      setView('diagnosis');
      setDemos(false);
      setRetryText(null);
      setError('');
      setLiveLimit(null);
      return s;
    },
    [],
  );
  async function send(text: string, image?: string, target = session) {
    if (!target || requestInFlight.current) return false;
    requestInFlight.current = true;
    setBusy(true);
    setError('');
    setLiveLimit(null);
    setRetryText({ text, image });
    setPending({ text, image });
    setStatus(
      target.mode === 'demo'
        ? 'Updating the guided diagnosis…'
        : 'Reviewing your evidence with Gemini…',
    );
    try {
      const result = await diagnose(target, text, image, config?.liveAI === true);
      if (result.type === 'live_disabled') {
        toast.info(result.message);
        setRetryText(null);
        return false;
      }
      if (result.type === 'live_limit') {
        setLiveLimit({ id: target.id, message: result.message });
        setRetryText(null);
        return false;
      }
      if (result.type === 'needs_details') {
        const now = new Date().toISOString();
        setSession({
          ...target,
          messages: [
            ...target.messages,
            { id: sessionId(), role: 'user', text, created_at: now },
            {
              id: sessionId(),
              role: 'assistant',
              text: result.message,
              created_at: now,
            },
          ],
        });
      } else {
        setSession(result.session);
        setSessions((prev) => [
          result.session,
          ...prev.filter((s) => s.id !== result.session.id),
        ]);
      }
      setRetryText(null);
      return true;
    } catch (e) {
      setError(
        e instanceof Error && ['TimeoutError', 'AbortError'].includes(e.name)
          ? 'The request took too long. Your saved diagnosis has not changed. Try again later.'
          : e instanceof Error
            ? e.message
            : 'Unable to complete this diagnosis.',
      );
      return false;
    } finally {
      requestInFlight.current = false;
      setBusy(false);
      setStatus('');
      setPending(null);
      if (target.mode === 'live' && config?.liveAI) void refreshConfig();
    }
  }
  async function begin(text: string, image?: string) {
    if (!config?.liveAI) {
      toast.info(LIVE_DISABLED_MESSAGE);
      return false;
    }
    const created = await start('live');
    return created ? send(text, image, created) : false;
  }
  async function generateReport() {
    if (!session || session.persisted === false || requestInFlight.current)
      return;
    requestInFlight.current = true;
    setBusy(true);
    try {
      const data = await workspace.report(session);
      setReports((prev) => [data, ...prev]);
      setReportSession(data.session);
      setView('report');
      toast.success('Diagnostic report saved');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }
  function nav(v: View) {
    if (requestInFlight.current) return;
    setView(v);
    setError('');
    if (v === 'history' || v === 'reports') void load();
  }
  return (
    <SidebarProvider
      style={{ '--sidebar-width': '246px' } as React.CSSProperties}
    >
      <Sidebar className={'fix-sidebar ' + (view === 'home' ? 'sidebar-home' : '')}>
        <SidebarHeader>
          <button className="brand" onClick={() => nav('home')}>
            <span className="brand-mark brand-mark-image">
              <img src="/fixpilot-app-icon.svg" alt="" width="44" height="44" />
            </span>
            <span className="brand-copy"><strong>FixPilot</strong></span>
          </button>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <button
              className="new-diagnosis"
              disabled={busy}
              onClick={() => void start('live')}
            >
              <Plus size={17} /> New diagnosis
            </button>
            <div className="nav-label">WORKSPACE</div>
            <SidebarMenu>
              {(
                [
                  { v: 'home', label: 'Diagnosis', icon: MessageSquare },
                  { v: 'history', label: 'History', icon: History },
                  { v: 'reports', label: 'Saved Reports', icon: FileText },
                ] as const
              ).map((n) => (
                <SidebarMenuItem key={n.v}>
                  <SidebarMenuButton
                    disabled={busy}
                    isActive={
                      view === n.v || (n.v === 'home' && view === 'diagnosis')
                    }
                    onClick={() => nav(n.v)}
                  >
                    <n.icon size={17} />
                    <span>{n.label}</span>
                    {n.v === 'history' && <small>{sessions.length}</small>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton disabled={busy} onClick={() => setDevicesOpen(true)}>
                  <Smartphone size={17} /><span>Devices</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton disabled={busy} onClick={() => setDemos(true)}>
                  <BookOpen size={17} /><span>Guides</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton disabled={busy} isActive={view === 'settings'} onClick={() => nav('settings')}>
                  <Settings size={17} /><span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <div className="nav-label recent-label">RECENT DIAGNOSES</div>
            <div className="recent-sessions">
              {sessions.slice(0, 8).map((s) => (
                <div className="recent-row" key={s.id}>
                  <button
                    disabled={busy}
                    className={
                      session?.id === s.id && view === 'diagnosis'
                        ? 'active'
                        : ''
                    }
                    key={s.id}
                    onClick={() => {
                      setSession(s);
                      setView('diagnosis');
                      setError('');
                      setRetryText(null);
                    }}
                  >
                    <span
                      className={
                        'session-dot ' +
                        (s.state.status === 'diagnosed' ? 'complete' : '')
                      }
                    />
                    <span>
                      {sessionTitle(s)}
                      <small>
                        {sessionStatus(s)} ·{' '}
                        {new Date(s.updated_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </small>
                    </span>
                  </button>
                  <button
                    className="session-menu icon-button"
                    aria-label={'Manage ' + sessionTitle(s)}
                    onClick={() => setManaged(s)}
                    disabled={busy}
                  >
                    <MoreHorizontal size={17} />
                  </button>
                </div>
              ))}
              {!sessions.length && (
                <p className="tiny empty-recent">
                  Your diagnoses will appear here.
                </p>
              )}
            </div>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="profile">
            <div>
              Personal workspace<small>Evidence-driven engineering</small>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <main
        className={
          'app-main ' + (view === 'diagnosis' ? 'in-conversation' : '')
        }
      >
        {view !== 'diagnosis' && view !== 'home' && (
          <header className="topbar">
            <div>
              <SidebarTrigger className="sidebar-toggle" />
              <span>Workspace</span>
              <ChevronRight size={14} />
              <strong>
                {view === 'history'
                    ? 'Diagnosis history'
                    : view === 'reports'
                      ? 'Saved reports'
                      : view === 'report'
                        ? 'Diagnostic report'
                        : 'Settings'}
              </strong>
            </div>
            <div className="topbar-right">
              <ModeIndicator config={config} onRefresh={() => void refreshConfig()} />
              <ShieldCheck size={14} />
              <span>Your session data</span>
              <button
                className="icon-button"
                onClick={toggleTheme}
                aria-label={dark ? 'Use light mode' : 'Use dark mode'}
              >
                {dark ? <Sun size={17} /> : <Moon size={17} />}
              </button>
            </div>
          </header>
        )}
        {view === 'home' && (
          <div className="welcome-page vercel-home">
            <header className="welcome-top-actions">
              <SidebarTrigger className="sidebar-toggle" />
              <div className="welcome-actions-right">
                <ModeIndicator config={config} onRefresh={() => void refreshConfig()} />
                <button className="icon-button theme-switch" onClick={toggleTheme} aria-label={dark ? 'Use light mode' : 'Use dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>
                  {dark ? <Sun size={19} /> : <Moon size={19} />}
                </button>
              </div>
            </header>
            <div className="welcome-inner">
              <div className="intro-label"><span className="status-dot" /> Your Technical Thinking Partner</div>
              <h1>Diagnose hardware and software problems,<br /><span>one test at a time.</span></h1>
              <p className="welcome-description">
                Describe your issue, share details, and FixPilot will ask the right questions,<br className="desktop-break" />
                analyze the evidence, and guide you step by step to a solution.
              </p>
              <MessageComposer
                busy={busy}
                onSend={begin}
                prompt={starterPrompt}
                onPromptUsed={() => setStarterPrompt('')}
              />
              <div className="composer-shortcuts" aria-label="Helpful ways to start">
                <button type="button" onClick={() => document.querySelector<HTMLInputElement>('.welcome-inner input[type=file]')?.click()}><ImagePlus size={17} /> Add images</button>
                <button type="button" onClick={() => setStarterPrompt('Device type: \nBrand and model: \nWhat happened: ')}><Monitor size={17} /> Device info</button>
                <button type="button" onClick={() => setStarterPrompt('Device: \nError message or code: \nWhen it appears: ')}><FileText size={17} /> Error messages</button>
                <button type="button" onClick={() => setStarterPrompt('Problem: \nSteps I already tried: \nWhat I observed: ')}><ListChecks size={17} /> Steps you tried</button>
              </div>
            </div>
            <div className="home-explore">
              <div className="demo-home-label">
                <h2>Try an example</h2>
                <div className="example-header-actions">
                  {config?.liveAI && (
                    <button className="example-link" disabled={busy} title="Sends a sample request to Gemini and uses the shared daily allowance" onClick={() => void begin(liveExample)}>Try a live example <ArrowRight size={15} /></button>
                  )}
                  <button className="example-link" onClick={() => setDemos(true)}>View all examples <ArrowRight size={15} /></button>
                </div>
              </div>
              <div className="starter-grid demo-home-grid">
                {[
                  { id: 'laptop', Icon: Monitor, category: 'PC / Laptop', title: 'Black screen', meta: 'Hardware + software' },
                  { id: 'sensor', Icon: Cpu, category: 'Electronics', title: 'Sensor reads zero', meta: 'Arduino / sensors' },
                  { id: 'wifi', Icon: Wifi, category: 'Networking', title: 'No internet', meta: 'Router / Wi-Fi' },
                  { id: 'robot', Icon: Bot, category: 'Robotics', title: 'Motor not working', meta: 'Motors / controllers' },
                ].map((item) => (
                  <button type="button" disabled={busy} key={item.id} onClick={() => void start('demo', item.id)} aria-label={'Start guided demo: ' + item.title}>
                    <span className="example-icon"><item.Icon size={22} /></span>
                    <span className="example-copy">
                      <small>{item.category}</small>
                      <strong>{item.title}</strong>
                      <span>Guided demo · {item.meta}</span>
                    </span>
                    <span className="example-arrow"><ArrowRight size={18} /></span>
                  </button>
                ))}
              </div>
              <section className="home-banner" aria-labelledby="device-banner-title">
                <div className="home-banner-copy">
                  <h2 id="device-banner-title">From laptops to robots</h2>
                  <p>Explore guided troubleshooting for computers, networks, electronics, and robotics systems.</p>
                </div>
                <img
                  src="/fixpilot-from-laptops.webp"
                  alt="A laptop, wheeled robot and microcontroller on an electronics workbench"
                  width={1200}
                  height={675}
                  loading="lazy"
                  decoding="async"
                />
              </section>
              {!loading && !config?.liveAI && (
                <p className="live-demo-notice" role="status">
                  Live mode is not enabled in this public demo; guided demos are available.
                </p>
              )}
              <p className="welcome-privacy">
                <ShieldCheck size={14} />
                {config?.liveAI
                  ? LIVE_PRIVACY_NOTICE
                  : 'Use non-sensitive information. Guided demos run locally; history stays in this browser.'}
              </p>
            </div>
          </div>
        )}
        {view === 'diagnosis' && session && (
          <>
            <div className="session-toolbar">
              <SidebarTrigger className="sidebar-toggle" />
              <div className="session-identity">
                <span className="session-symbol">
                  <Activity size={19} />
                </span>
                <div>
                  <h1>
                    {session.persisted === false
                      ? 'New diagnosis'
                      : sessionTitle(session)}
                  </h1>
                  <span>
                    {session.mode === 'demo'
                      ? 'Guided demo'
                      : session.state.status === 'diagnosed'
                        ? 'Provisional diagnosis'
                        : session.state.status === 'safety_stop'
                          ? getSafetyCopy(session.state.safety_warning).paused
                          : busy
                            ? 'Investigating your evidence…'
                            : 'Live conversation'}
                    <span className="case-number">
                      {' '}
                      · CASE {session.id.slice(0, 6).toUpperCase()}
                    </span>
                  </span>
                </div>
              </div>
              <div className="session-actions">
                <ModeIndicator config={config} guided={session.mode === 'demo'} onRefresh={() => void refreshConfig()} />
                {session.persisted !== false && (
                  <button
                    className="icon-button"
                    disabled={busy}
                    onClick={() => setManaged(session)}
                    aria-label="Manage this conversation"
                  >
                    <MoreHorizontal size={18} />
                  </button>
                )}
                <button
                  className="icon-button"
                  onClick={toggleTheme}
                  aria-label={dark ? 'Use light mode' : 'Use dark mode'}
                >
                  {dark ? <Sun size={17} /> : <Moon size={17} />}
                </button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="report-button-wrapper"
                      tabIndex={
                        busy || session.persisted === false ? 0 : undefined
                      }
                      aria-label={
                        busy
                          ? 'Save report unavailable while a reply is being prepared.'
                          : session.persisted === false
                            ? 'Save report unavailable. Send a device problem or complete a guided demo step first.'
                            : undefined
                      }
                    >
                      <button
                        className="text-button"
                        onClick={() => void generateReport()}
                        disabled={busy || session.persisted === false}
                      >
                        <FileText size={16} />
                        <span>Save report</span>
                      </button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {busy
                      ? 'Wait for the current reply before saving a report.'
                      : session.persisted === false
                        ? 'Send a device problem or complete a guided demo step first. There is no saved diagnosis to report yet.'
                        : 'Save a snapshot of this diagnosis and its evidence.'}
                  </TooltipContent>
                </Tooltip>
                <button
                  className={
                    'evidence-toggle ' + (evidenceOpen ? 'selected' : '')
                  }
                  aria-label="Toggle evidence panel"
                  aria-expanded={evidenceOpen}
                  onClick={() => setEvidenceOpen(!evidenceOpen)}
                >
                  <PanelRight size={18} />
                  <span>Evidence</span>
                </button>
              </div>
            </div>
            <div
              className={
                'diagnosis-workspace ' +
                (!evidenceOpen || mobile ? 'evidence-hidden' : '')
              }
            >
              <ChatPanel
                onStartOwn={() => void start('live')}
                onResolved={async () => {
                  try {
                    updateSession(
                      await workspace.update(session.id, {
                        resolved: !session.resolved_at,
                      }),
                    );
                  } catch {
                    toast.error(
                      'Connection failed. Your saved session is unchanged.',
                    );
                  }
                }}
                session={session}
                busy={busy}
                status={status}
                error={error}
                liveLimit={
                  liveLimit?.id === session.id ? liveLimit.message : ''
                }
                onGuidedDemo={() => setDemos(true)}
                pending={pending}
                onSend={send}
                onRetry={() => {
                  if (retryText) void send(retryText.text, retryText.image);
                }}
                onReport={() => void generateReport()}
              />
              {evidenceOpen && !mobile && (
                <HypothesisPanel state={session.state} mode={session.mode} />
              )}
            </div>
            <Sheet open={mobile && evidenceOpen} onOpenChange={setEvidenceOpen}>
              <SheetContent
                className="evidence-drawer"
                onOpenAutoFocus={(e) => {
                  e.preventDefault();
                  (e.target as HTMLElement)?.focus?.();
                }}
              >
                <SheetHeader>
                  <SheetTitle>Evidence notebook</SheetTitle>
                  <SheetDescription>
                    Evidence, estimated causes and the test timeline.
                  </SheetDescription>
                </SheetHeader>
                <HypothesisPanel state={session.state} mode={session.mode} />
              </SheetContent>
            </Sheet>
            {session.mode === 'live' && config?.provider === 'gemini' && (
              <p className="provider-notice">
                18+ · {LIVE_PRIVACY_NOTICE}
              </p>
            )}
          </>
        )}
        {(view === 'history' || view === 'reports') && (
          <div className="standard-page">
            <div className="page-heading">
              <div className="eyebrow">YOUR WORKSPACE</div>
              <h1>
                {view === 'history' ? 'Your diagnoses.' : 'Saved reports.'}
              </h1>
              <p>
                {view === 'history'
                  ? 'Pick up where you left off, or revisit a diagnosis.'
                  : 'Saved snapshots of your diagnostic findings and repair plans.'}
              </p>
            </div>
            <label className="search-box">
              <Search size={17} />
              <input
                placeholder="Search device or problem…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {error && (
              <div className="inline-error">
                {error}
                <button onClick={() => void load()}>Retry</button>
              </div>
            )}
            {loading ? (
              <div className="loading-grid">
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
              </div>
            ) : (
              <div className="history-list">
                {(view === 'history' ? sessions : reports.map((r) => r.session))
                  .filter((s) =>
                    (s.state.device + s.state.problem_summary)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((s, i) => (
                    <button
                      className="history-card"
                      key={s.id + '-' + i}
                      onClick={() => {
                        if (view === 'reports') {
                          setReportSession(s);
                          setView('report');
                        } else {
                          setSession(s);
                          setView('diagnosis');
                        }
                      }}
                    >
                      <span className="history-icon">
                        {view === 'reports' ? (
                          <FileText size={23} />
                        ) : (
                          <Activity size={23} />
                        )}
                      </span>
                      <div>
                        <h3>{sessionTitle(s)}</h3>
                        <p>{s.state.problem_summary}</p>
                        <small>
                          {new Date(s.updated_at).toLocaleDateString()} ·{' '}
                          {s.mode === 'demo' ? 'Guided demo' : 'Live mode'}
                        </small>
                      </div>
                      <div className="history-status">
                        <span>{sessionStatus(s)}</span>
                      </div>
                    </button>
                  ))}
                {(view === 'history' ? sessions : reports).length === 0 && (
                  <div className="empty-state">
                    <History size={32} />
                    <h2>
                      {view === 'history'
                        ? 'Your next answer starts here.'
                        : 'No reports saved yet.'}
                    </h2>
                    <p>
                      {view === 'history'
                        ? 'Start a diagnosis to build your diagnostic history.'
                        : 'Generate a report from any diagnostic session.'}
                    </p>
                    <button
                      className="primary"
                      onClick={() => void start('demo', 'robot')}
                    >
                      Try the robot demo
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {view === 'settings' && (
          <div className="standard-page">
            <div className="page-heading">
              <div className="eyebrow">PREFERENCES & CONNECTIONS</div>
              <h1>Your diagnostic workspace.</h1>
            </div>
            <div className="settings-card">
              <h2>Gemini connection</h2>
              <span
                className={
                  'connection-badge ' + (config?.liveAI ? 'connected' : '')
                }
              >
                {config?.liveAI ? 'Configured' : 'Awaiting owner setup'}
              </span>
              <p>
                {config?.liveAI
                  ? 'The server connection is configured. Live diagnosis is subject to the provider’s quota and availability.'
                  : 'Interactive demos are available now. Live conversations and image analysis are awaiting the site owner’s Gemini connection.'}
              </p>
              <div className="setting-row">
                <span>Provider</span>
                <b>Google Gemini</b>
              </div>
              <div className="setting-row">
                <span>Model</span>
                <b>{config?.model || 'Loading…'}</b>
              </div>
              <div className="setting-row">
                <span>API key</span>
                <b>Server-side only · never requested from visitors</b>
              </div>
              <button className="secondary" onClick={() => void load()}>
                Check configuration
              </button>
            </div>
            <div className="settings-card">
              <h2>Storage & privacy</h2>
              <p>
                {LIVE_PRIVACY_NOTICE}
              </p>
              <p>
                Conversations, report snapshots and images are stored only in
                this browser’s IndexedDB. Nothing syncs to other browsers or
                devices. Live requests are processed temporarily by a Netlify
                Function and Google Gemini. The application does not store or
                log their contents on the server. Anonymous usage counters
                enforce live limits.
              </p>
              <button
                className="danger-button"
                onClick={() => setClearConfirm(true)}
              >
                Delete all my data…
              </button>
              <p>
                Delete a diagnosis from its menu, or delete all local data here.
                Clearing this site's browser storage also removes your history.
                This cannot erase data already processed by Google. Netlify may
                retain normal infrastructure request metadata; this app adds no
                analytics or request-body logging.
              </p>
              {config?.provider === 'gemini' && (
                <p>
                  Use non-sensitive sample device problems and avoid personal or
                  confidential information.
                </p>
              )}
              <div className="setting-row">
                <span>Session history</span>
                <b>This browser · IndexedDB</b>
              </div>
              <div className="setting-row">
                <span>Uploaded images</span>
                <b>This browser · IndexedDB</b>
              </div>
              <div className="setting-row">
                <span>Appearance</span>
                <button className="secondary" onClick={toggleTheme}>
                  {dark ? 'Switch to light mode' : 'Switch to dark mode'}
                </button>
              </div>
            </div>
            <div className="settings-card">
              <ShieldCheck size={24} />
              <h2>Safety comes first.</h2>
              <p>
                FixPilot provides a model-assisted provisional diagnosis, not
                certified repair advice. High-voltage equipment, damaged
                batteries and dangerous machinery require qualified
                professionals.
              </p>
            </div>
          </div>
        )}
        {view === 'report' && reportSession && (
          <ReportView session={reportSession} />
        )}
      </main>
      <Dialog open={devicesOpen} onOpenChange={setDevicesOpen}>
        <DialogContent className="demos-dialog">
          <DialogHeader>
            <DialogTitle>Supported devices</DialogTitle>
            <DialogDescription>Explore an interactive diagnostic scenario or begin a live diagnosis. Guided cases use simulated evidence.</DialogDescription>
          </DialogHeader>
          <div className="modal-scenarios">
            {[
              { key:'laptop',Icon:Monitor,title:'PCs and laptops',details:'Display, startup, system issues' },
              { key:'sensor',Icon:Cpu,title:'Electronics and Arduino',details:'Sensors, boards and embedded systems' },
              { key:'wifi',Icon:Wifi,title:'Networks and Wi-Fi',details:'Routers, connectivity and DNS' },
              { key:'robot',Icon:Bot,title:'Robotics and motors',details:'Drivers, wheels and controllers' }
            ].map(({key,Icon,title,details}) => (
              <button key={key} disabled={busy} onClick={() => { setDevicesOpen(false); void start('demo',key); }}>
                <Icon size={22} /><span><b>{title}</b><small>{details}</small></span><ChevronRight size={16}/>
              </button>
            ))}
            {config?.liveAI && (
              <button disabled={busy} onClick={() => { setDevicesOpen(false); void start('live'); }}>
                <Smartphone size={22}/><span><b>Smartphones and other devices</b><small>Ask FixPilot through live diagnosis</small></span><ChevronRight size={16}/>
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={demos} onOpenChange={setDemos}>
        <DialogContent
          className="demos-dialog"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.target as HTMLElement)?.focus?.();
          }}
        >
          <DialogHeader>
            <DialogTitle>Guided demos</DialogTitle>
            <DialogDescription>
              See how a good diagnosis works, then try your own. Outcomes are
              simulated.
            </DialogDescription>
          </DialogHeader>
          <div className="modal-scenarios">
            {scenarios.map((s, i) => {
              const Icon = icons[i];
              return (
                <button
                  key={s.id}
                  disabled={busy}
                  onClick={() => void start('demo', s.id)}
                >
                  <Icon size={22} />
                  <span>
                    <b>{s.name}</b>
                    <small>
                      {s.detail} ·{' '}
                      {s.id === 'robot' ? '1–3' : s.id === 'wifi' ? '1' : '1–2'}{' '}
                      {s.id === 'wifi' ? 'test' : 'tests'}
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={clearConfirm} onOpenChange={setClearConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete all your data?</DialogTitle>
            <DialogDescription>
              This permanently deletes your conversations, reports and uploaded
              images from this app. It cannot remove data already processed by
              Google. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="manage-actions">
            <button
              className="secondary"
              onClick={() => setClearConfirm(false)}
            >
              Cancel
            </button>
            <button
              className="danger-button"
              onClick={async () => {
                try {
                  await workspace.clear();
                  setSessions([]);
                  setReports([]);
                  setSession(null);
                  setReportSession(null);
                  setManaged(null);
                  setPending(null);
                  setRetryText(null);
                  setClearConfirm(false);
                  setView('home');
                  toast.success('Your local data was deleted');
                } catch {
                  toast.error(
                    'Browser storage could not be cleared. Please retry.',
                  );
                }
              }}
            >
              Delete all my data
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <SessionManager
        key={managed?.id || 'none'}
        session={managed}
        onClose={() => setManaged(null)}
        onChange={updateSession}
        onDelete={removeSession}
      />
      <Toaster theme={dark ? 'dark' : 'light'} richColors />
      {busy && view !== 'diagnosis' && (
        <div className="busy-indicator" role="status">
          <LoaderCircle size={16} className="spin" /> Preparing your workspace…
        </div>
      )}
    </SidebarProvider>
  );
}
