import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  ArrowUpRight,
  Bot as BotIcon,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  FolderOpen,
  Layers3,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Square,
  Workflow,
  X,
} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { APP_NAME, SPECIALIST_NAMES } from '../shared/branding';
import bumblebeeIcon from './assets/bots/bumblebee.png';
import optimusIcon from './assets/bots/optimus-prime.png';
import ratchetIcon from './assets/bots/ratchet.png';
import wheeljackIcon from './assets/bots/wheeljack.png';
import arceeIcon from './assets/bots/arcee.png';
import jazzIcon from './assets/bots/jazz.png';
import type {
  Bot,
  ApiProvider,
  Command,
  ContextRecord,
  Decision,
  Run,
  Snapshot,
  Task,
  Workspace,
} from '../shared/contracts';

type View = 'conversation' | 'work' | 'bots' | 'context' | 'schedules' | 'settings';
const engineNames: Record<Bot['engine'], string> = {
  codex: 'Codex',
  'claude-code': 'Claude Code · Claude plan',
  claude: 'Claude Agent · API billing',
  grok: 'Grok · API billing',
  gemini: 'Gemini · API billing',
  demo: 'Offline demo',
};
const portraits: Record<string, string> = {
  'optimus prime': optimusIcon,
  optimus: optimusIcon,
  ratchet: ratchetIcon,
  wheeljack: wheeljackIcon,
  arcee: arceeIcon,
  jazz: jazzIcon,
};
const states: Record<string, string> = {
  queued: 'Queued',
  running: 'Working',
  waiting_children: 'Waiting for helpers',
  waiting_input: 'Needs your input',
  waiting_approval: 'Needs approval',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  interrupted: 'Interrupted',
};
const isActive = (t: Task) =>
  !['completed', 'failed', 'cancelled', 'interrupted'].includes(t.state);
const time = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const date = (value: string) =>
  new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`mark ${small ? 'small' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 32 32">
        <path d="m6 25 10-19 10 19M10 19h12M16 6v7" />
      </svg>
    </span>
  );
}
function Status({ state }: { state: string }) {
  return (
    <span className={`status ${state}`}>
      <i />
      {states[state] ?? state.replaceAll('_', ' ')}
    </span>
  );
}
function BotAvatar({ bot, big = false }: { bot: Bot; big?: boolean }) {
  const name = bot.name.trim().toLowerCase();
  const icon =
    name === 'bumblebee' || name === 'bumbelbee'
      ? { src: bumblebeeIcon, box: '42 10 486 505', width: 570, height: 624 }
      : portraits[name]
        ? { src: portraits[name], box: '0 0 1254 1254', width: 1254, height: 1254 }
        : null;
  return (
    <span className={`avatar ${big ? 'big' : ''}`} data-bot-name={bot.name} aria-hidden="true">
      {icon ? (
        <svg className="character-icon" viewBox={icon.box}>
          <image href={icon.src} width={icon.width} height={icon.height} />
        </svg>
      ) : (
        bot.name
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0])
          .join('')
      )}
    </span>
  );
}
function Prose({ text, onError }: { text: string; onError: (s: string) => void }) {
  return (
    <div className="prose">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault();
                if (href) void window.relay.openExternal(href).catch((e) => onError(String(e)));
              }}
            >
              {children}
              <ArrowUpRight size={12} />
            </a>
          ),
          img: ({ alt }) => <span>[Image omitted: {alt}]</span>,
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
export function App() {
  const [workspace, setWorkspace] = useState<Workspace>('personal');
  const [view, setView] = useState<View>('conversation');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [botId, setBotId] = useState('orchestrator');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [streams, setStreams] = useState<Record<string, string>>({});
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [editBot, setEditBot] = useState<Bot | null>(null);
  const [details, setDetails] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const input = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const currentWorkspace = useRef(workspace);
  currentWorkspace.current = workspace;
  const refreshing = useRef(false);
  const refreshAgain = useRef(false);
  const latestRefresh = useRef<() => Promise<void>>(async () => {});
  const refresh = useCallback(async () => {
    if (refreshing.current) {
      refreshAgain.current = true;
      return;
    }
    refreshing.current = true;
    try {
      const result = await window.relay.invoke<Snapshot>(workspace, { action: 'snapshot' });
      if (currentWorkspace.current === workspace) {
        setSnapshot(result);
        setStreams((previous) =>
          Object.fromEntries(
            Object.entries(previous).filter(([id]) =>
              result.runs.some(
                (run) =>
                  run.id === id &&
                  !['completed', 'failed', 'cancelled', 'interrupted'].includes(run.state),
              ),
            ),
          ),
        );
      }
    } catch (e) {
      setError(String(e));
    } finally {
      refreshing.current = false;
      if (refreshAgain.current) {
        refreshAgain.current = false;
        setTimeout(() => void latestRefresh.current(), 100);
      }
    }
  }, [workspace]);
  latestRefresh.current = refresh;
  const invoke = async <T,>(command: Command): Promise<T | undefined> => {
    try {
      const result = await window.relay.invoke<T>(workspace, command);
      await refresh();
      return result;
    } catch (e) {
      setError(String(e).replace(/^Error: /, ''));
      return undefined;
    }
  };
  useEffect(() => {
    setSnapshot(null);
    setBotId('orchestrator');
    setSelectedTask(null);
    setStreams({});
    setDraft('');
    setView('conversation');
    setDetails(false);
    void refresh();
  }, [workspace, refresh]);
  useEffect(
    () =>
      window.relay.subscribe((event) => {
        if (event.kind === 'runtime_error') {
          setError(event.text ?? 'Runtime error');
          return;
        }
        if (event.workspace !== workspace) return;
        if (event.kind === 'delta' && event.runId)
          setStreams((prev) => ({ ...prev, [event.runId!]: event.text ?? '' }));
        else void refresh();
      }),
    [workspace, refresh],
  );
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      if (dialog && event.key === 'Tab') {
        const controls = [
          ...dialog.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, a[href]',
          ),
        ].filter((el) => el.getClientRects().length > 0);
        const first = controls[0],
          last = controls.at(-1);
        if (
          first &&
          last &&
          (!dialog.contains(document.activeElement) ||
            (event.shiftKey && document.activeElement === first) ||
            (!event.shiftKey && document.activeElement === last))
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setView('conversation');
        input.current?.focus();
      }
      if (event.key === 'Escape') {
        setEditBot(null);
        setSelectedTask(null);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  useEffect(() => {
    let current: Element | null = null;
    let previous: HTMLElement | null = null;
    const observer = new MutationObserver(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog === current) return;
      if (dialog) {
        previous = document.activeElement as HTMLElement;
        queueMicrotask(() => dialog.querySelector<HTMLElement>('input, textarea, button')?.focus());
      } else if (previous?.isConnected) previous.focus();
      current = dialog;
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (nearBottom.current && transcript.current)
      transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [streams, snapshot?.messages.length, snapshot?.decisions.length, botId]);
  if (!snapshot)
    return (
      <div className="loading">
        <Mark />
        <h1>Opening your workspace</h1>
        <p>Connecting to the local runtime…</p>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  const bot = snapshot.bots.find((b) => b.id === botId) ?? snapshot.bots[0];
  const pending = snapshot.decisions.filter((d) => d.state === 'pending');
  const active = snapshot.tasks.filter(isActive);
  const engine = snapshot.engines.find((e) => e.engine === bot.engine);
  const selected = snapshot.tasks.find((t) => t.id === selectedTask);
  const send = async (text = draft) => {
    if (!text.trim() || sending) return;
    setSending(true);
    nearBottom.current = true;
    const result = await invoke({ action: 'send', botId: bot.id, text: text.trim() });
    if (result) setDraft('');
    setSending(false);
    input.current?.focus();
  };
  const chooseBot = (id: string) => {
    setBotId(id);
    setView('conversation');
    nearBottom.current = true;
  };
  const createBot = () => {
    chooseBot('orchestrator');
    setDraft('Create a bot that ');
    requestAnimationFrame(() => input.current?.focus());
  };
  const latestRun = (taskId: string) => snapshot.runs.filter((r) => r.taskId === taskId).at(-1);
  const answer = (decision: Decision, value: string) =>
    invoke({
      action: 'decision',
      decisionId: decision.id,
      fingerprint: decision.fingerprint,
      answer: value,
    });
  const openArtifact = (id: string) =>
    void window.relay.openArtifact(workspace, id).catch((e) => setError(String(e)));
  return (
    <div
      className={`app ${workspace === 'demo' ? 'demo' : ''} ${sidebar ? '' : 'sidebar-collapsed'}`}
    >
      <aside className="sidebar" aria-label="Bots and workspace" hidden={!sidebar}>
        <div className="brand">
          <Mark small />
          <span>{APP_NAME}</span>
          <button
            className="icon-button"
            aria-label="Hide sidebar"
            title="Hide sidebar"
            onClick={() => setSidebar(false)}
          >
            <PanelLeftClose size={17} />
          </button>
        </div>
        <div className="sidebar-label">
          <span>Bots</span>
          <button title="Create a bot" aria-label="Create a bot" onClick={createBot}>
            <Plus size={17} />
          </button>
        </div>
        <div className="bot-nav">
          {snapshot.bots
            .filter((b) => !b.archived && !b.temporary)
            .map((b) => (
              <button
                key={b.id}
                className={`bot-link ${view === 'conversation' && bot.id === b.id ? 'selected' : ''}`}
                onClick={() => chooseBot(b.id)}
                aria-current={view === 'conversation' && bot.id === b.id ? 'page' : undefined}
                title={b.role}
              >
                <BotAvatar bot={b} />
                <span>
                  {b.name}
                  <small>{b.id === 'orchestrator' ? 'Your orchestrator' : b.role}</small>
                </span>
                {snapshot.tasks.some((t) => t.botId === b.id && isActive(t)) && (
                  <i className="working-dot" />
                )}
              </button>
            ))}
        </div>
        <div className="sidebar-bottom">
          <nav aria-label="Workspace navigation">
            {(
              [
                { id: 'work', label: 'Work', icon: Workflow },
                { id: 'context', label: 'Shared context', icon: Layers3 },
                { id: 'schedules', label: 'Schedules', icon: Clock3 },
                { id: 'bots', label: 'Manage bots', icon: BotIcon },
              ] as const
            ).map((n) => (
              <button
                key={n.id}
                className={`nav ${view === n.id ? 'active' : ''}`}
                onClick={() => setView(n.id)}
              >
                <n.icon size={16} />
                {n.label}
                {n.id === 'work' && (pending.length > 0 || active.length > 0) && (
                  <span className={`count ${pending.length ? 'attention' : ''}`}>
                    {pending.length || active.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <button
            className={`nav ${view === 'settings' ? 'active' : ''}`}
            onClick={() => setView('settings')}
          >
            <Settings2 size={16} />
            Settings
          </button>
          <button
            className="demo-toggle"
            onClick={() => setWorkspace(workspace === 'demo' ? 'personal' : 'demo')}
          >
            {workspace === 'demo' ? 'Leave demo' : 'Try offline demo'}
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            {!sidebar && (
              <button
                className="icon-button"
                aria-label="Show sidebar"
                title="Show sidebar"
                onClick={() => setSidebar(true)}
              >
                <PanelLeftOpen size={18} />
              </button>
            )}
            {view === 'conversation' && <BotAvatar bot={bot} />}
            <h1>
              {view === 'conversation'
                ? bot.name
                : (
                    {
                      work: 'Work',
                      bots: 'Bots',
                      context: 'Shared context',
                      schedules: 'Schedules',
                      settings: 'Settings',
                    } as const
                  )[view]}
            </h1>
            {view === 'conversation' && (
              <span className="header-role">
                {bot.id === 'orchestrator' ? 'Orchestrator' : bot.role}
              </span>
            )}
          </div>
          <div className="topbar-actions">
            {pending.length > 0 && (
              <button className="attention-button" onClick={() => setView('work')}>
                <CircleHelp size={15} />
                {pending.length} needs you
              </button>
            )}
            {view === 'conversation' && (
              <>
                <button
                  className="icon-button"
                  aria-label="Configure bot"
                  title="Configure bot"
                  onClick={() => setEditBot(bot)}
                >
                  <Settings2 size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Toggle details pane"
                  aria-expanded={details}
                  title="Work, context & files"
                  onClick={() => setDetails(!details)}
                >
                  <PanelRightClose size={18} />
                </button>
              </>
            )}
          </div>
        </header>
        {workspace === 'demo' && (
          <div className="demo-banner">
            <span>OFFLINE DEMO</span> Simulated responses · separate workspace
          </div>
        )}
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError('')}>
              <X size={16} />
            </button>
          </div>
        )}
        <div className="body-layout">
          <section className="main-panel">
            {view === 'conversation' && (
              <>
                <div
                  className="transcript"
                  ref={transcript}
                  onScroll={() => {
                    const el = transcript.current!;
                    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
                  }}
                >
                  {snapshot.messages.filter((m) => m.botId === bot.id).length === 0 &&
                    !snapshot.tasks.some((t) => t.botId === bot.id && t.parentId) && (
                      <div className="welcome">
                        <Mark />
                        <h2>
                          {bot.id === 'orchestrator'
                            ? 'What can we get done?'
                            : `Message ${bot.name}`}
                        </h2>
                        <p>
                          {bot.id === 'orchestrator'
                            ? `Ask ${bot.name}. Your bots will take it from there.`
                            : bot.role}
                        </p>
                        {bot.id === 'orchestrator' && (
                          <div className="suggestions">
                            {(workspace === 'demo'
                              ? [
                                  'Delegate a comparison to a researcher and reviewer',
                                  'Show an approval',
                                  'Demonstrate helper failure and recovery',
                                ]
                              : [
                                  'Create a research bot that checks claims against evidence.',
                                  'What context and decisions do we have in this workspace?',
                                  'Help me turn a rough idea into a clear project brief.',
                                ]
                            ).map((s, i) => (
                              <button
                                key={s}
                                onClick={() => {
                                  setDraft(s);
                                  input.current?.focus();
                                }}
                              >
                                {workspace === 'demo'
                                  ? ['Try delegation', 'Try an approval', 'Try recovery'][i]
                                  : ['Create a bot', 'Recall a decision', 'Plan a project'][i]}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  {snapshot.messages
                    .filter((m) => m.botId === bot.id && m.role === 'user')
                    .map((m) => {
                      const task = snapshot.tasks.find((t) => t.id === m.taskId);
                      const run = task && latestRun(task.id);
                      const response = snapshot.messages.find(
                        (r) => r.taskId === m.taskId && r.role === 'assistant',
                      );
                      const text = response?.text ?? (run && (streams[run.id] ?? run.text));
                      const createdBots = snapshot.events.filter(
                        (e) => e.taskId === task?.id && e.kind === 'bot_created',
                      );
                      const children = snapshot.tasks.filter((c) => c.parentId === task?.id);
                      return (
                        <article className="exchange" key={m.id}>
                          <div className="message user-message">
                            <div className="message-meta">
                              <span className="user-avatar">You</span>
                              <time>{time(m.createdAt)}</time>
                            </div>
                            <Prose text={m.text} onError={setError} />
                          </div>
                          {task && (
                            <div className="message assistant-message">
                              <div className="message-meta">
                                <BotAvatar bot={bot} />
                                <strong>{bot.name}</strong>
                                {isActive(task) && <Status state={task.state} />}
                              </div>
                              {createdBots.map((e) => (
                                <button
                                  className="inline-card"
                                  key={e.seq}
                                  onClick={() => setView('bots')}
                                >
                                  <BotIcon size={17} />
                                  <span>{e.text.split(' · ')[0]}</span>
                                  <ChevronRight size={14} />
                                </button>
                              ))}
                              {children.length > 0 && (
                                <details className="helper-group">
                                  <summary>
                                    <Workflow size={14} />
                                    {children.length} helpers ·{' '}
                                    {children.filter((c) => c.state === 'completed').length}{' '}
                                    complete
                                    {children.some((c) =>
                                      [
                                        'failed',
                                        'interrupted',
                                        'waiting_approval',
                                        'waiting_input',
                                      ].includes(c.state),
                                    ) && <span className="helper-attention">Needs attention</span>}
                                    <ChevronRight size={14} />
                                  </summary>
                                  {children.map((child) => (
                                    <TaskCard
                                      key={child.id}
                                      task={child}
                                      bot={snapshot.bots.find((b) => b.id === child.botId)}
                                      onClick={() => setSelectedTask(child.id)}
                                      compact
                                    />
                                  ))}
                                </details>
                              )}
                              {text ? (
                                <Prose text={text} onError={setError} />
                              ) : isActive(task) ? (
                                <p className="working-copy">
                                  {task.state === 'queued'
                                    ? 'Your request is queued.'
                                    : task.state === 'waiting_children'
                                      ? 'Waiting for helpers…'
                                      : task.state.startsWith('waiting')
                                        ? 'A decision is needed below.'
                                        : 'Working on your request…'}
                                </p>
                              ) : null}
                              {pending
                                .filter((d) => d.taskId === task.id)
                                .map((d) => (
                                  <DecisionCard
                                    key={d.id}
                                    decision={d}
                                    bot={bot.name}
                                    onAnswer={(value) => void answer(d, value)}
                                  />
                                ))}
                              {task.error && (
                                <div className="task-error">
                                  <CircleHelp size={16} />
                                  <span>{task.error}</span>
                                </div>
                              )}
                              {snapshot.artifacts
                                .filter((a) => a.taskId === task.id)
                                .map((a) => (
                                  <button
                                    className="artifact-row artifact-inline"
                                    key={a.id}
                                    onClick={() => openArtifact(a.id)}
                                  >
                                    <FileText size={16} />
                                    <span>{a.name}</span>
                                    <ArrowUpRight size={14} />
                                  </button>
                                ))}
                              <div className="response-footer">
                                <button
                                  onClick={() => setSelectedTask(task.id)}
                                  className="text-button"
                                >
                                  <Workflow size={13} />
                                  Inspect work
                                  <ChevronRight size={12} />
                                </button>
                                {!isActive(task) && <Status state={task.state} />}
                                {isActive(task) ? (
                                  <button
                                    className="text-button"
                                    onClick={() =>
                                      void invoke({ action: 'cancel', taskId: task.id })
                                    }
                                  >
                                    <Square size={12} />
                                    Stop
                                  </button>
                                ) : (
                                  task.state !== 'completed' && (
                                    <button
                                      className="text-button"
                                      onClick={() =>
                                        void invoke({ action: 'retry', taskId: task.id })
                                      }
                                    >
                                      <RotateCcw size={13} />
                                      Retry
                                    </button>
                                  )
                                )}
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  {bot.id !== 'orchestrator' &&
                    snapshot.tasks
                      .filter((t) => t.botId === bot.id && t.parentId)
                      .map((t) => (
                        <TaskCard key={t.id} task={t} onClick={() => setSelectedTask(t.id)} />
                      ))}
                </div>
                <div className="composer-wrap">
                  {engine && !['ready', 'installed'].includes(engine.state) && (
                    <div className="readiness-inline">
                      <CircleHelp size={15} />
                      <span>{engine.detail}</span>
                      <button onClick={() => setView('settings')}>Set up</button>
                    </div>
                  )}
                  <form
                    className="composer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send();
                    }}
                  >
                    <label className="sr-only" htmlFor="message-input">
                      Message {bot.name}
                    </label>
                    <textarea
                      id="message-input"
                      ref={input}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={`Message ${bot.name}…`}
                      rows={2}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                    />
                    <div className="composer-bottom">
                      <button type="button" className="engine-chip" onClick={() => setEditBot(bot)}>
                        <i />
                        {workspace === 'demo'
                          ? 'Offline demo'
                          : bot.model || engineNames[bot.engine]}
                        <ChevronDown size={12} />
                      </button>
                      <button
                        type="submit"
                        className="send"
                        disabled={!draft.trim() || sending || bot.archived}
                        aria-label="Send message"
                      >
                        <ArrowUp size={19} />
                      </button>
                    </div>
                  </form>
                </div>
              </>
            )}
            {view === 'work' && (
              <div className="page-scroll">
                <PageTitle
                  title="Tasks & results"
                  text="Open a task to see its progress, files, and run history."
                />
                {pending.map((d) => (
                  <DecisionCard
                    key={d.id}
                    decision={d}
                    bot={
                      snapshot.bots.find(
                        (b) => b.id === snapshot.tasks.find((t) => t.id === d.taskId)?.botId,
                      )?.name ?? 'Bot'
                    }
                    onAnswer={(value) => void answer(d, value)}
                  />
                ))}
                {!snapshot.tasks.length && (
                  <Empty
                    icon={<Workflow />}
                    title="Nothing in the queue yet"
                    text={`Message ${snapshot.bots.find((b) => b.id === 'orchestrator')?.name ?? 'your orchestrator'} to start something.`}
                  />
                )}
                {snapshot.tasks
                  .filter((t) => !t.parentId)
                  .toReversed()
                  .map((t) => (
                    <div className="task-tree" key={t.id}>
                      <TaskCard
                        task={t}
                        bot={snapshot.bots.find((b) => b.id === t.botId)}
                        onClick={() => setSelectedTask(t.id)}
                      />
                      {snapshot.tasks
                        .filter((c) => c.parentId === t.id)
                        .map((c) => (
                          <div className="tree-child" key={c.id}>
                            <TaskCard
                              task={c}
                              bot={snapshot.bots.find((b) => b.id === c.botId)}
                              onClick={() => setSelectedTask(c.id)}
                              compact
                            />
                          </div>
                        ))}
                    </div>
                  ))}
              </div>
            )}
            {view === 'bots' && (
              <div className="page-scroll">
                <PageTitle
                  title="Your bots"
                  text="Create a specialist in conversation, or edit one here."
                />
                <button className="primary" onClick={createBot}>
                  <Plus size={16} />
                  Create through conversation
                </button>
                <div className="bot-grid">
                  {snapshot.bots
                    .filter((b) => !b.temporary)
                    .map((b) => (
                      <div className={`bot-config-card ${b.archived ? 'archived' : ''}`} key={b.id}>
                        <BotAvatar bot={b} big />
                        <h3>
                          {b.name}
                          {b.archived && <small>Archived</small>}
                        </h3>
                        <p>{b.role}</p>
                        <dl>
                          <dt>Engine</dt>
                          <dd>{b.engine}</dd>
                          <dt>Model</dt>
                          <dd>{b.model || 'Provider default'}</dd>
                          <dt>Environment</dt>
                          <dd>Local scoped tools</dd>
                          <dt>Access</dt>
                          <dd>
                            {b.scope.files ? 'Selected folder' : 'Workspace context'}
                            {b.scope.web ? ' + public web' : ''}
                          </dd>
                        </dl>
                        <div className="row">
                          <button className="text-button" onClick={() => chooseBot(b.id)}>
                            Open conversation
                            <ArrowUpRight size={13} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Configure ${b.name}`}
                            onClick={() => setEditBot(b)}
                          >
                            <Settings2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
            {view === 'context' && (
              <ContextView snapshot={snapshot} invoke={invoke} onError={setError} />
            )}
            {view === 'schedules' && <ScheduleView snapshot={snapshot} invoke={invoke} />}
            {view === 'settings' && (
              <SettingsView
                snapshot={snapshot}
                invoke={invoke}
                refresh={refresh}
                onError={setError}
              />
            )}
          </section>
          {details && view === 'conversation' && (
            <aside className="details-pane">
              <div className="details-title">
                <span>Details</span>
                <button aria-label="Hide details" onClick={() => setDetails(false)}>
                  <X size={14} />
                </button>
              </div>
              <div className="detail-section">
                <div className="section-label">
                  CURRENT WORK
                  <button onClick={() => setView('work')}>
                    View all
                    <ArrowUpRight size={12} />
                  </button>
                </div>
                {active.length ? (
                  active.slice(0, 5).map((t) => (
                    <button className="mini-task" key={t.id} onClick={() => setSelectedTask(t.id)}>
                      <Status state={t.state} />
                      <strong>{t.title}</strong>
                      <small>{snapshot.bots.find((b) => b.id === t.botId)?.name}</small>
                    </button>
                  ))
                ) : (
                  <p className="subtle">Nothing running.</p>
                )}
              </div>
              <div className="detail-section">
                <div className="section-label">
                  SHARED CONTEXT
                  <button onClick={() => setView('context')}>
                    Inspect
                    <ArrowUpRight size={12} />
                  </button>
                </div>
                {snapshot.memories
                  .filter((m) => !m.excluded && ['decision', 'preference'].includes(m.kind))
                  .slice(-3)
                  .map((m) => (
                    <div className="memory-mini" key={m.id}>
                      <span>
                        {m.kind} · {m.authority}
                      </span>
                      <p>{m.text}</p>
                    </div>
                  ))}
                {!snapshot.memories.some(
                  (m) => !m.excluded && ['decision', 'preference'].includes(m.kind),
                ) && (
                  <p className="subtle">
                    No confirmed decisions yet. Add what matters in Shared context.
                  </p>
                )}
              </div>
              <div className="detail-section">
                <div className="section-label">RECENT RESULTS</div>
                {snapshot.artifacts
                  .slice(-3)
                  .toReversed()
                  .map((a) => (
                    <button className="artifact-mini" key={a.id} onClick={() => openArtifact(a.id)}>
                      <FileText size={17} />
                      <span>
                        {a.name}
                        <small>{date(a.createdAt)}</small>
                      </span>
                      <ArrowUpRight size={13} />
                    </button>
                  ))}
                {!snapshot.artifacts.length && (
                  <p className="subtle">Files and final results will appear here.</p>
                )}
              </div>
              <div className="local-reminder">
                <Clock3 size={15} />
                <span>Schedules run while Autobase and this computer are available.</span>
              </div>
            </aside>
          )}
        </div>
      </main>
      {editBot && (
        <BotEditor
          bot={editBot}
          snapshot={snapshot}
          close={() => setEditBot(null)}
          save={async (patch) => {
            const result = await invoke({ action: 'update_bot', botId: editBot.id, patch });
            if (result) setEditBot(null);
          }}
        />
      )}
      {selected && (
        <TaskDetail
          task={selected}
          snapshot={snapshot}
          streams={streams}
          close={() => setSelectedTask(null)}
          invoke={invoke}
          onError={setError}
          openArtifact={openArtifact}
          onAnswer={answer}
        />
      )}
    </div>
  );
}
function PageTitle({ title, text }: { title: string; text: string }) {
  return (
    <div className="page-title">
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
function Empty({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="empty-state">
      {icon}
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function TaskCard({
  task,
  bot,
  onClick,
  compact,
}: {
  task: Task;
  bot?: Bot;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button className={`task-card ${compact ? 'compact' : ''}`} onClick={onClick}>
      <span className="task-card-icon">
        {task.state === 'completed' ? <Check size={17} /> : <Workflow size={17} />}
      </span>
      <span className="task-card-content">
        <strong>{task.title}</strong>
        <small>
          {bot?.name ?? 'Assignment'} · {date(task.createdAt)}
        </small>
      </span>
      <Status state={task.state} />
      <ChevronRight size={15} />
    </button>
  );
}
function DecisionCard({
  decision: d,
  bot,
  onAnswer,
}: {
  decision: Decision;
  bot: string;
  onAnswer: (answer: string) => void;
}) {
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  return (
    <div className="decision-card">
      <div className="eyebrow">
        <ShieldCheck size={14} />
        {d.kind === 'approval' ? 'YOUR APPROVAL' : 'YOUR INPUT'} · {bot}
      </div>
      <h3>{d.action}</h3>
      <code>{d.target}</code>
      <p>{d.reason}</p>
      <div className="decision-options">
        {d.options.map((option) => (
          <button
            disabled={submitted}
            key={option}
            onClick={() => {
              setSubmitted(true);
              onAnswer(option);
            }}
          >
            {option}
          </button>
        ))}
      </div>
      {d.kind === 'question' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (answer.trim()) {
              setSubmitted(true);
              onAnswer(answer.trim());
            }
          }}
        >
          <input
            aria-label="Your answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Write an answer…"
          />
          <button disabled={submitted || !answer.trim()} type="submit">
            Reply
          </button>
        </form>
      )}
      <small>
        Only this action · expires {time(d.expiresAt)} · task {d.taskId.slice(-8)}
      </small>
    </div>
  );
}
type Invoke = <T = unknown>(command: Command) => Promise<T | undefined>;
function BotEditor({
  bot,
  snapshot,
  close,
  save,
}: {
  bot: Bot;
  snapshot: Snapshot;
  close: () => void;
  save: (patch: any) => Promise<void>;
}) {
  const [form, setForm] = useState(bot);
  const modelList = snapshot.engines.find((e) => e.engine === form.engine)?.models ?? [];
  const field = (key: keyof Bot, value: unknown) => setForm({ ...form, [key]: value });
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Configure bot"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-title">
          <h2>Configure {bot.name}</h2>
          <button aria-label="Close configuration" onClick={close}>
            <X size={20} />
          </button>
        </div>
        <p className="subtle">
          Changes apply to future runs. Each attempt keeps its original configuration.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save({
              name: form.name,
              role: form.role,
              instructions: form.instructions,
              engine: form.engine,
              model: form.model,
              effort: form.effort,
              scope: form.scope,
              archived: form.archived,
            });
          }}
        >
          <label>
            Name
            <select
              autoFocus={bot.id !== 'orchestrator'}
              required
              disabled={bot.id === 'orchestrator'}
              value={form.name}
              onChange={(e) => field('name', e.target.value)}
            >
              {[...new Set([bot.name, ...SPECIALIST_NAMES])].map((name) => (
                <option
                  key={name}
                  disabled={snapshot.bots.some(
                    (b) => b.id !== bot.id && !b.archived && b.name === name,
                  )}
                >
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Role
            <input
              autoFocus={bot.id === 'orchestrator'}
              required
              maxLength={180}
              value={form.role}
              onChange={(e) => field('role', e.target.value)}
            />
          </label>
          <label>
            Instructions
            <textarea
              rows={4}
              value={form.instructions}
              onChange={(e) => field('instructions', e.target.value)}
            />
          </label>
          <div className="form-grid">
            <label>
              Engine
              <select
                value={form.engine}
                onChange={(e) =>
                  setForm({ ...form, engine: e.target.value as Bot['engine'], model: '' })
                }
              >
                {snapshot.workspace === 'demo' ? (
                  <option value="demo">Offline fixture</option>
                ) : (
                  <>
                    <option value="codex">Codex</option>
                    <option value="claude-code">Claude Code · Claude plan</option>
                    <option value="claude">Claude Agent · API billing</option>
                    <option value="grok">Grok · API billing</option>
                    <option value="gemini">Gemini · API billing</option>
                  </>
                )}
              </select>
            </label>
            <label>
              Reasoning
              <select
                disabled={['grok', 'gemini'].includes(form.engine)}
                value={form.effort}
                onChange={(e) => field('effort', e.target.value)}
              >
                {['low', 'medium', 'high', 'xhigh', 'max'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              {['grok', 'gemini'].includes(form.engine) && <small>Uses provider default.</small>}
            </label>
          </div>
          <label>
            Model
            {modelList.length ? (
              <select value={form.model} onChange={(e) => field('model', e.target.value)}>
                <option value="">Provider default</option>
                {modelList.map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                placeholder="Provider default, or a model ID (required for API engines)"
                value={form.model}
                onChange={(e) => field('model', e.target.value)}
              />
            )}
          </label>
          <fieldset>
            <legend>Tool permissions</legend>
            <label className="check-label">
              <input
                type="checkbox"
                checked={form.scope.files}
                onChange={(e) => field('scope', { ...form.scope, files: e.target.checked })}
              />
              Read the selected project folder
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={form.scope.web}
                onChange={(e) => field('scope', { ...form.scope, web: e.target.checked })}
              />
              Read public HTTPS pages without asking each time
            </label>
            <small>
              Helpers inherit the intersection of their own scope and the parent’s. No shell or host
              desktop access.
            </small>
          </fieldset>
          {bot.id !== 'orchestrator' && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={form.archived}
                onChange={(e) => field('archived', e.target.checked)}
              />
              Archive bot and retain its history
            </label>
          )}
          <div className="modal-actions">
            <button type="button" onClick={close}>
              Cancel
            </button>
            <button className="primary" type="submit">
              Save configuration
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
function TaskDetail({
  task,
  snapshot,
  streams,
  close,
  invoke,
  onError,
  openArtifact,
  onAnswer,
}: {
  task: Task;
  snapshot: Snapshot;
  streams: Record<string, string>;
  close: () => void;
  invoke: Invoke;
  onError: (s: string) => void;
  openArtifact: (id: string) => void;
  onAnswer: (d: Decision, a: string) => unknown;
}) {
  const runs = snapshot.runs.filter((r) => r.taskId === task.id).toReversed();
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        className="modal task-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Task detail"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-title">
          <span className="eyebrow">INSPECT WORK</span>
          <button aria-label="Close task detail" onClick={close}>
            <X size={20} />
          </button>
        </div>
        <h2>{task.title}</h2>
        <Status state={task.state} />
        <p>{task.criteria}</p>
        <div className="id-row">{task.id}</div>
        {task.error && <p className="task-error">{task.error}</p>}
        {snapshot.decisions
          .filter((d) => d.taskId === task.id)
          .map((d) =>
            d.state === 'pending' ? (
              <DecisionCard
                key={d.id}
                decision={d}
                bot={snapshot.bots.find((b) => b.id === task.botId)?.name ?? 'Bot'}
                onAnswer={(a) => void onAnswer(d, a)}
              />
            ) : (
              <div className="decision-history" key={d.id}>
                {d.action} · {d.answer ?? d.state}
              </div>
            ),
          )}
        <div className="row actions">
          {isActive(task) ? (
            <button onClick={() => void invoke({ action: 'cancel', taskId: task.id })}>
              <Square size={13} />
              Cancel task & helpers
            </button>
          ) : (
            task.state !== 'completed' && (
              <button onClick={() => void invoke({ action: 'retry', taskId: task.id })}>
                <RotateCcw size={14} />
                Retry with a new attempt
              </button>
            )
          )}
        </div>
        {task.outcome && (
          <div className="outcome">
            <h3>Recorded outcome</h3>
            <Prose text={task.outcome.summary} onError={onError} />
            {task.outcome.evidence.length > 0 && (
              <>
                <h4>Evidence</h4>
                <ul>
                  {task.outcome.evidence.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            {task.outcome.uncertainty.length > 0 && (
              <>
                <h4>Limitations</h4>
                <ul>
                  {task.outcome.uncertainty.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        <h3>Artifacts</h3>
        {snapshot.artifacts
          .filter((a) => a.taskId === task.id)
          .map((a) => (
            <button className="artifact-row" key={a.id} onClick={() => openArtifact(a.id)}>
              <FileText size={17} />
              <span>
                {a.name}
                <small>
                  {a.bytes.toLocaleString()} bytes · SHA-256 {a.sha256.slice(0, 12)}
                </small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          ))}
        {!snapshot.artifacts.some((a) => a.taskId === task.id) && (
          <p className="subtle">No output files registered.</p>
        )}
        <h3>Run history</h3>
        {runs.map((r, index) => (
          <details className="run-detail" key={r.id} open={index === 0}>
            <summary>
              Attempt {r.attempt} · {r.snapshot.engine} ·{' '}
              {r.resolvedModel || r.snapshot.model || 'provider default'}
              <Status state={r.state} />
            </summary>
            <dl>
              <dt>Started</dt>
              <dd>{date(r.startedAt)}</dd>
              <dt>Adapter</dt>
              <dd>{r.adapterVersion}</dd>
              <dt>Session</dt>
              <dd>{r.providerSession ?? 'Not started'}</dd>
              <dt>Usage</dt>
              <dd>
                {r.usage
                  ? `${r.usage.input.toLocaleString()} input / ${r.usage.output.toLocaleString()} output tokens`
                  : 'Not available'}
              </dd>
              <dt>Cost</dt>
              <dd>
                {r.usage?.costUsd !== undefined
                  ? `$${r.usage.costUsd.toFixed(4)} (provider reported)`
                  : 'Not available'}
              </dd>
            </dl>
            <details>
              <summary>Context sent to this run</summary>
              <pre>{r.handoff}</pre>
            </details>
            <details>
              <summary>Frozen configuration</summary>
              <pre>{JSON.stringify(r.snapshot, null, 2)}</pre>
            </details>
            <Prose text={streams[r.id] ?? r.text} onError={onError} />
          </details>
        ))}
        <h3>Activity</h3>
        <ol className="timeline">
          {snapshot.events
            .filter((e) => e.taskId === task.id)
            .map((e) => (
              <li key={e.seq}>
                <time>{time(e.createdAt)}</time>
                <div>
                  <strong>{e.kind.replaceAll('_', ' ')}</strong>
                  <pre>{e.text}</pre>
                </div>
              </li>
            ))}
        </ol>
      </section>
    </div>
  );
}
function ContextView({
  snapshot,
  invoke,
}: {
  snapshot: Snapshot;
  invoke: Invoke;
  onError: (s: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContextRecord[] | null>(null);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'decision' | 'preference' | 'fact'>('decision');
  const [editing, setEditing] = useState<ContextRecord | null>(null);
  const records = results ?? snapshot.memories.toReversed();
  return (
    <div className="page-scroll">
      <PageTitle
        title="Workspace memory"
        text="Find past work, save a decision, or correct what your bots remember."
      />
      <form
        className="search-bar"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await invoke<ContextRecord[]>({ action: 'search', query });
          if (r) setResults(r);
        }}
      >
        <Search size={18} />
        <input
          aria-label="Search shared context"
          placeholder="Search decisions, conversations, and results…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value) setResults(null);
          }}
        />
        <button>Search</button>
      </form>
      <form
        className="memory-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (text.trim()) {
            const r = await invoke({ action: 'memory', text: text.trim(), kind });
            if (r) {
              setText('');
              setResults(null);
            }
          }
        }}
      >
        <label className="sr-only" htmlFor="memory-text">
          Confirmed memory
        </label>
        <input
          id="memory-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="A decision or preference worth remembering…"
        />
        <select
          aria-label="Memory type"
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
        >
          <option value="decision">Decision</option>
          <option value="preference">Preference</option>
          <option value="fact">Fact</option>
        </select>
        <button className="primary" disabled={!text.trim()}>
          <Plus size={14} />
          Save
        </button>
      </form>
      {!records.length && (
        <Empty
          icon={<Layers3 />}
          title="A clean slate"
          text="Conversation and task records are indexed with sources. Confirmed decisions are yours to add and correct."
        />
      )}
      <div className="context-list">
        {records.map((r) => (
          <article className={`context-card ${r.excluded ? 'excluded' : ''}`} key={r.id}>
            <div className="context-meta">
              <span>{r.kind}</span>
              <strong>
                {r.authority === 'user'
                  ? 'Owner-confirmed'
                  : r.authority === 'agent'
                    ? 'Agent-reported'
                    : 'Observed'}
              </strong>
              <time>{date(r.createdAt)}</time>
              {r.excluded && <b>Excluded</b>}
            </div>
            <p>{r.snippet ?? r.text}</p>
            <small>
              Source {r.sourceId}
              {r.supersedes ? ` · supersedes ${r.supersedes}` : ''}
            </small>
            {snapshot.memories.some((x) => x.supersedes === r.id) && (
              <div className="subtle">A newer owner record supersedes this one.</div>
            )}
            <div className="context-actions">
              <button onClick={() => setEditing(r)}>Inspect / correct</button>
              <button
                onClick={async () => {
                  await invoke({ action: 'context_edit', id: r.id, excluded: !r.excluded });
                  setResults(null);
                }}
              >
                {r.excluded ? 'Include in retrieval' : 'Exclude from retrieval'}
              </button>
              <button onClick={() => setEditing({ ...r })}>Delete…</button>
            </div>
          </article>
        ))}
      </div>
      {editing && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit context"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(null);
            }}
          >
            <div className="modal-title">
              <h2>Inspect context</h2>
              <button aria-label="Close context" onClick={() => setEditing(null)}>
                <X size={19} />
              </button>
            </div>
            <p className="subtle">
              Source: {editing.sourceId} · {editing.authority}. Corrections to a decision create a
              superseding owner record and retain history.
            </p>
            <textarea
              aria-label="Source content"
              rows={8}
              value={editing.text}
              onChange={(e) => setEditing({ ...editing, text: e.target.value })}
            />
            <div className="modal-actions">
              <button
                className="danger"
                onClick={async () => {
                  const r = await invoke({ action: 'context_edit', id: editing.id, delete: true });
                  if (r) {
                    setEditing(null);
                    setResults(null);
                  }
                }}
              >
                Delete this source & index
              </button>
              <button
                className="primary"
                onClick={async () => {
                  const r = await invoke(
                    ['decision', 'preference', 'fact'].includes(editing.kind)
                      ? {
                          action: 'memory',
                          text: editing.text,
                          kind: editing.kind as 'decision',
                          supersedes: editing.id,
                        }
                      : { action: 'context_edit', id: editing.id, text: editing.text },
                  );
                  if (r) {
                    setEditing(null);
                    setResults(null);
                  }
                }}
              >
                Save correction
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function ScheduleView({ snapshot, invoke }: { snapshot: Snapshot; invoke: Invoke }) {
  const [editingId, setEditingId] = useState<string | undefined>();
  const [objective, setObjective] = useState('');
  const [kind, setKind] = useState<'once' | 'daily' | 'weekdays'>('weekdays');
  const [at, setAt] = useState('09:00');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [botId, setBotId] = useState('orchestrator');
  return (
    <div className="page-scroll">
      <PageTitle
        title="Recurring work"
        text="Autobase must be running and the computer awake. Missed runs catch up once per schedule."
      />
      <form
        className="schedule-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await invoke({
            action: 'schedule',
            id: editingId,
            botId,
            objective,
            spec: { kind, at, timezone },
          });
          if (r) {
            setObjective('');
            setEditingId(undefined);
          }
        }}
      >
        <label>
          What should happen?
          <textarea
            rows={2}
            required
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="Summarize changes in the selected project folder…"
          />
        </label>
        <div className="form-grid">
          <label>
            Bot
            <select value={botId} onChange={(e) => setBotId(e.target.value)}>
              {snapshot.bots
                .filter((b) => !b.archived)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Repeat
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as typeof kind);
                setAt(e.target.value === 'once' ? '' : '09:00');
              }}
            >
              <option value="weekdays">Weekdays</option>
              <option value="daily">Every day</option>
              <option value="once">Once</option>
            </select>
          </label>
          <label>
            {kind === 'once' ? 'Local date & time' : 'Local time'}
            <input
              required
              type={kind === 'once' ? 'datetime-local' : 'time'}
              value={at}
              onChange={(e) => setAt(e.target.value)}
            />
          </label>
          <label>
            Timezone
            <input required value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </label>
        </div>
        <button className="primary" disabled={!objective.trim()}>
          <Plus size={15} />
          {editingId ? 'Save schedule changes' : 'Create local schedule'}
        </button>
      </form>
      {snapshot.schedules.map((s) => (
        <article className="schedule-card" key={s.id}>
          <div>
            <Clock3 size={19} />
            <h3>{s.objective}</h3>
            <button
              onClick={() => {
                setEditingId(s.id);
                setObjective(s.objective);
                setBotId(s.botId);
                setKind(s.spec.kind);
                setAt(s.spec.at);
                setTimezone(s.spec.timezone);
                document.querySelector('.schedule-form')?.scrollIntoView({ block: 'start' });
              }}
            >
              Edit
            </button>
            <button
              onClick={() =>
                void invoke({ action: 'schedule_toggle', id: s.id, enabled: !s.enabled })
              }
            >
              {s.enabled ? 'Disable' : 'Enable'}
            </button>
          </div>
          <p>
            {s.spec.kind} at {s.spec.at} · {s.spec.timezone}
          </p>
          <small>
            {s.enabled && s.nextAt
              ? `Next: ${new Date(s.nextAt).toLocaleString([], { timeZone: s.spec.timezone })} (${s.spec.timezone})`
              : 'Disabled'}{' '}
            · {s.missed} missed occurrences coalesced
          </small>
        </article>
      ))}
      {snapshot.occurrences.length > 0 && (
        <>
          <h3>Execution history</h3>
          {snapshot.occurrences.toReversed().map((o) => (
            <div className="occurrence" key={o.id}>
              {date(o.firedAt)} · {o.disposition}
              <small>{o.taskId ?? 'No task queued'}</small>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
function SettingsView({
  snapshot,
  invoke,
  refresh,
  onError,
}: {
  snapshot: Snapshot;
  invoke: Invoke;
  refresh: () => Promise<void>;
  onError: (s: string) => void;
}) {
  const [key, setKey] = useState('');
  const [apiProvider, setApiProvider] = useState<ApiProvider>('claude');
  const [loginHint, setLoginHint] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  return (
    <div className="page-scroll">
      <PageTitle
        title="Workspace settings"
        text="Connect engines and choose what your bots can access."
      />
      <div className="section-heading">
        <h2>Engines</h2>
        <button onClick={() => void invoke({ action: 'readiness' })}>
          <RotateCcw size={14} />
          Check readiness
        </button>
      </div>
      {snapshot.engines.map((e) => (
        <article className="engine-card" key={e.engine}>
          <div className="row">
            <h3>{engineNames[e.engine]}</h3>
            <Status state={e.state} />
          </div>
          <p>{e.detail}</p>
          <small>{e.version}</small>
          {['codex', 'claude-code'].includes(e.engine) && e.state !== 'ready' && (
            <button
              onClick={async () => {
                try {
                  await window.relay.signIn(e.engine as 'codex' | 'claude-code');
                  setLoginHint(
                    'Finish native sign-in in your browser, then click Check readiness.',
                  );
                } catch (error) {
                  onError(String(error));
                }
              }}
            >
              Sign in
            </button>
          )}
          {e.models.length > 0 && (
            <details>
              <summary>{e.models.length} provider-reported models</summary>
              <p>{e.models.map((m) => m.id).join(' · ')}</p>
            </details>
          )}
        </article>
      ))}
      {loginHint && <p role="status">{loginHint}</p>}
      {snapshot.workspace !== 'demo' && (
        <form
          className="key-form"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await window.relay.setApiKey(apiProvider, key);
              setKey('');
              setKeySaved(true);
              await invoke({ action: 'readiness' });
            } catch (e) {
              onError(String(e));
            }
          }}
        >
          <label>
            API provider
            <select
              value={apiProvider}
              onChange={(e) => {
                setApiProvider(e.target.value as ApiProvider);
                setKey('');
                setKeySaved(false);
              }}
            >
              <option value="claude">Anthropic</option>
              <option value="grok">xAI · Grok</option>
              <option value="gemini">Google AI Studio · Gemini</option>
            </select>
          </label>
          <label>
            API key
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setKeySaved(false);
              }}
              placeholder={{ claude: 'sk-ant-…', grok: 'xai-…', gemini: 'AIza…' }[apiProvider]}
            />
          </label>
          <p className="subtle">
            Stored with Windows encryption. API tasks use separate provider billing. Codex and
            Claude Code use native sign-in above; they do not need a key here.
          </p>
          <div className="row">
            <button className="primary" disabled={!key.trim()}>
              Save API key
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await window.relay.setApiKey(apiProvider, '');
                  setKeySaved(false);
                  await invoke({ action: 'readiness' });
                } catch (error) {
                  onError(String(error));
                }
              }}
            >
              Remove stored key
            </button>
            {keySaved && <span>Key stored securely.</span>}
          </div>
        </form>
      )}
      <h2>Workspace access</h2>
      <div className="settings-box">
        <p>{snapshot.settings.folder ?? 'No project folder selected.'}</p>
        <button
          onClick={async () => {
            try {
              await window.relay.selectFolder(snapshot.workspace);
              await refresh();
            } catch (e) {
              onError(String(e));
            }
          }}
        >
          <FolderOpen size={16} />
          Select a project folder
        </button>
        <p className="subtle">
          Grants the orchestrator read access to this folder. Bots cannot expand their own scope.
          Artifacts are written to Autobase’s managed storage.
        </p>
      </div>
      <h2>Execution limits</h2>
      <div className="settings-box form-grid">
        {(
          [
            { key: 'concurrency', label: 'Concurrent execution slots', min: 1, max: 3 },
            { key: 'maxHelpers', label: 'Helpers per parent', min: 0, max: 2 },
            { key: 'maxRunSeconds', label: 'Run time limit (seconds)', min: 20, max: 1800 },
            { key: 'maxToolCalls', label: 'Tool / turn limit', min: 4, max: 100 },
          ] as const
        ).map((f) => (
          <label key={f.key}>
            {f.label}
            <input
              type="number"
              min={f.min}
              max={f.max}
              defaultValue={snapshot.settings[f.key]}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v >= f.min && v <= f.max)
                  void invoke({ action: 'settings', patch: { [f.key]: v } });
              }}
            />
          </label>
        ))}
      </div>
      <h2>Shared context & storage</h2>
      <div className="settings-box">
        <label className="check-label">
          <input
            type="checkbox"
            checked={snapshot.settings.indexConversations}
            onChange={(e) =>
              void invoke({ action: 'settings', patch: { indexConversations: e.target.checked } })
            }
          />
          Index new conversation messages for retrieval
        </label>
        <p className="subtle">
          Existing records can be excluded or deleted in Shared context. Credentials are never
          indexed.
        </p>
        <code className="data-path">{snapshot.dataPath}</code>
      </div>
      <h2>Optional local computer</h2>
      <div className="settings-box">
        <p>{snapshot.computer.detail}</p>
        <button onClick={() => void invoke({ action: 'computer_probe' })}>
          <RotateCcw size={15} />
          Check prerequisites
        </button>
        <p className="subtle">
          No guest is provisioned. A project folder is not a sandbox or virtual machine.
        </p>
      </div>
      <h2>When you close Autobase</h2>
      <p className="subtle">
        The local runtime exits. Active work becomes interrupted and can be retried after
        inspection. Queued work and schedules resume on launch. There is no tray service or
        server-backed execution.
      </p>
    </div>
  );
}
