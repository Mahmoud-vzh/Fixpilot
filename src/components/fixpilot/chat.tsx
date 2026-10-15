'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Paperclip,
  X,
  LoaderCircle,
  Terminal,
  ShieldCheck,
  Activity,
  Copy,
  Check,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Session } from '@/lib/diagnostic/types';
import { TestCard, FinalDiagnosis } from './diagnostic-panels';
import { SafetyWarning } from './safety-warning';
import { getSafetyCopy } from '@/lib/diagnostic/safety';
export function FormattedText({ text }: { text: string }) {
  return (
    <div dir="auto">
      {text.split(/(```[\s\S]*?```)/g).map((part, i) =>
        part.startsWith('```') ? (
          <pre key={i} dir="ltr">
            <code>{part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '')}</code>
          </pre>
        ) : (
          <div className="message-text" key={i}>
            {part
              .split(/(\*\*[^*]+\*\*)/g)
              .map((p, j) =>
                p.startsWith('**') ? (
                  <strong key={j}>{p.slice(2, -2)}</strong>
                ) : (
                  p
                ),
              )}
          </div>
        ),
      )}
    </div>
  );
}
export function MessageComposer({
  busy,
  stopped = false,
  safetyText = '',
  demo = false,
  observing = false,
  onSend,
  prompt,
  onPromptUsed,
}: {
  busy: boolean;
  stopped?: boolean;
  safetyText?: string;
  demo?: boolean;
  observing?: boolean;
  onSend: (text: string, image?: string) => Promise<boolean>;
  prompt?: string;
  onPromptUsed?: () => void;
}) {
  const [input, setInput] = useState(''),
    [attachment, setAttachment] = useState<{
      id: string;
      url: string;
    } | null>(null);
  const [uploading, setUploading] = useState(false),
    [uploadError, setUploadError] = useState('');
  const [validation, setValidation] = useState('');
  const sending = useRef(false),
    file = useRef<HTMLInputElement>(null),
    textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (prompt) {
      setInput(prompt);
      textarea.current?.focus();
      onPromptUsed?.();
    }
  }, [prompt, onPromptUsed]);
  useEffect(() => {
    const el = textarea.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 180) + 'px';
    }
  }, [input]);
  useEffect(() => {
    if (!busy && !stopped) {
      textarea.current?.focus({ preventScroll: true });
    }
  }, [busy, stopped]);
  async function submit() {
    if (!input.trim() && !attachment) {
      setValidation('Describe the problem or attach an image first.');
      return;
    }
    if (!demo && !navigator.onLine) {
      setValidation('You are offline. Reconnect before sending.');
      return;
    }
    setValidation('');
    if (sending.current || busy || uploading || stopped) return;
    sending.current = true;
    try {
      if (
        await onSend(
          input.trim() || 'Please examine this image.',
          attachment?.id,
        )
      ) {
        setInput('');
        setAttachment(null);
      }
    } finally {
      sending.current = false;
    }
  }
  async function upload(f: File) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) {
      setUploadError('Use a PNG, JPEG or WebP image.');
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      setUploadError('This image is too large. Choose an image under 2 MB.');
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read this image.'));
        reader.readAsDataURL(f);
      });
      setAttachment({ id: url, url });
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="composer-wrap">
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {attachment && (
          <div className="image-preview">
            <img src={attachment.url} alt="Pending evidence upload" />
            <span>
              {demo
                ? 'Image ready · stays in this browser'
                : 'Image ready to analyze'}
            </span>
            <button
              type="button"
              onClick={() => setAttachment(null)}
              aria-label="Remove image"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {validation && (
          <p className="inline-error" role="alert">
            {validation}
          </p>
        )}
        {uploadError && (
          <p className="inline-error" role="alert">
            {uploadError}
          </p>
        )}
        <textarea
          ref={textarea}
          dir="auto"
          aria-label="Message FixPilot"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            stopped
              ? getSafetyCopy(safetyText).composer
              : observing
                ? 'Or describe what you observed…'
                : demo
                  ? 'Describe the result or ask about this diagnosis…'
                  : 'Tell me what’s happening with your device…'
          }
          rows={2}
          maxLength={12000}
          disabled={busy || stopped}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <div className="composer-bottom">
          <div>
            <button
              type="button"
              className="icon-button"
              onClick={() => file.current?.click()}
              disabled={uploading || busy || stopped}
              title="Attach an image"
              aria-label="Attach image"
            >
              {uploading ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <Paperclip size={18} />
              )}
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="icon-button"
                  title="Add a log or error code"
                  aria-label="Add code block"
                  disabled={busy || stopped}
                  onClick={() => {
                    setInput(input + '\n```\nPaste logs here\n```');
                    textarea.current?.focus();
                  }}
                >
                  <Terminal size={18} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Add a code block for logs or error messages. Treat personal
                information as private.
              </TooltipContent>
            </Tooltip>
            <span className="composer-hint">Images · logs · observations</span>
          </div>
          <button
            type="submit"
            className="send-button"
            aria-label="Send message"
            disabled={busy || uploading || stopped}
          >
            {busy ? (
              <LoaderCircle size={18} className="spin" />
            ) : (
              <ArrowUp size={20} />
            )}
          </button>
        </div>
        <input
          type="file"
          ref={file}
          hidden
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = '';
          }}
        />
      </form>
      <div className="chat-foot">
        <span>
          <ShieldCheck size={13} /> Model-assisted. Verify before you repair.
        </span>
        <span>Enter to send · Shift + Enter for a new line</span>
      </div>
    </div>
  );
}
function CopyMessage({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      className="copy-message"
      aria-label={copied ? 'Copied' : 'Copy response'}
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => setCopied(true))
          .catch(() => setCopied(false));
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}{' '}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
export function ChatPanel({
  session,
  busy,
  status,
  error,
  liveLimit,
  onGuidedDemo,
  pending,
  onSend,
  onRetry,
  onReport,
  onStartOwn,
  onResolved,
}: {
  session: Session;
  busy: boolean;
  status: string;
  error: string;
  liveLimit: string;
  onGuidedDemo: () => void;
  pending: {
    text: string;
    image?: string;
  } | null;
  onSend: (text: string, image?: string) => Promise<boolean>;
  onRetry: () => void;
  onReport: () => void;
  onStartOwn: () => void;
  onResolved: () => void;
}) {
  const messages = useRef<HTMLDivElement>(null);
  const [prompt, setPrompt] = useState('');
  // Scroll APIs can return a Promise in modern browsers. Never return that
  // value from an effect: React would invoke it as a cleanup and crash on send.
  useEffect(() => {
    const panel = messages.current;
    if (panel) {
      const entries = panel.querySelectorAll<HTMLElement>(
        busy ? '.message.pending' : '.message.assistant',
      );
      const latest = entries[entries.length - 1];
      const top = latest
        ? panel.scrollTop +
          latest.getBoundingClientRect().top -
          panel.getBoundingClientRect().top -
          20
        : panel.scrollHeight;
      panel.scrollTo({ top, behavior: 'instant' });
    }
  }, [session.id, session.messages.length, busy]);
  return (
    <section className="chat-panel" aria-label="Diagnostic conversation">
      {session.mode === 'demo' && (
        <div className="demo-notice">
          Guided demo{' '}
          <span>
            Simulated outcomes. Tip: tell FixPilot the device model, symptom,
            what changed and what you tried.
          </span>
        </div>
      )}
      <div
        className="messages"
        ref={messages}
        role="log"
        aria-label="Conversation messages"
        aria-live="polite"
      >
        <div className="conversation-start">
          <span>DIAGNOSIS STARTED</span>
          <span>
            {new Date(
              session.messages[0]?.created_at || session.updated_at,
            ).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
          </span>
        </div>
        {session.messages.map((m) => (
          <article className={'message ' + m.role} key={m.id}>
            {m.role === 'assistant' && (
              <span className="avatar">
                <Activity size={19} />
              </span>
            )}
            <div className="message-body">
              <div className="message-by">
                {m.role === 'assistant' ? 'FixPilot' : 'You'}
                <span>
                  {m.role === 'assistant'
                    ? 'Diagnostic agent'
                    : new Date(m.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                </span>
              </div>
              {m.image && (
                <img
                  className="message-image"
                  src={m.image}
                  alt="Uploaded diagnostic evidence"
                />
              )}
              <FormattedText text={m.text} />
              {m.role === 'assistant' && <CopyMessage text={m.text} />}
            </div>
          </article>
        ))}
        {pending && (
          <article className="message user pending">
            <div className="message-body">
              <div className="message-by">
                You <span>Sending</span>
              </div>
              {pending.image && (
                <img
                  className="message-image"
                  src={pending.image}
                  alt="Submitted diagnostic evidence"
                />
              )}
              <FormattedText text={pending.text} />
            </div>
          </article>
        )}
        {busy && (
          <div className="thinking" role="status">
            <span className="avatar">
              <Activity size={18} />
            </span>
            <div>
              <strong>FixPilot is investigating</strong>
              <span>
                <LoaderCircle size={13} className="spin" />
                {status || 'Connecting the evidence…'}
              </span>
            </div>
          </div>
        )}
        {!busy && (
          <div className="agent-action">
            <SafetyWarning
              text={session.state.safety_warning}
              stopped={session.state.status === 'safety_stop'}
            />
            {session.state.next_test && (
              <TestCard
                test={session.state.next_test}
                disabled={busy}
                onResult={(text) =>
                  text === 'Different result'
                    ? setPrompt('I observed a different result: ')
                    : void onSend(text)
                }
              />
            )}{' '}
            {session.state.status === 'diagnosed' && (
              <FinalDiagnosis
                state={session.state}
                onReport={onReport}
                demo={session.mode === 'demo'}
                onStartOwn={onStartOwn}
                onResolved={onResolved}
                resolved={Boolean(session.resolved_at)}
              />
            )}
          </div>
        )}
        {error && (
          <div className="inline-error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={onRetry} disabled={busy}>
              Retry message
            </button>
          </div>
        )}
      </div>
      {liveLimit && (
        <div className="live-limit" role="status">
          <strong>Guided demos are still available</strong>
          <p>{liveLimit}</p>
          <button type="button" className="text-button" onClick={onGuidedDemo}>
            Try a guided demo
          </button>
        </div>
      )}
      <MessageComposer
        key={session.id}
        busy={busy}
        stopped={session.state.status === 'safety_stop'}
        safetyText={session.state.safety_warning}
        demo={session.mode === 'demo'}
        observing={Boolean(session.state.next_test)}
        onSend={onSend}
        prompt={prompt}
        onPromptUsed={() => setPrompt('')}
      />
    </section>
  );
}
