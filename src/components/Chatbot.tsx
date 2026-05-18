import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { MessageCircle, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerFn } from "@tanstack/react-start";
import { chat } from "@/lib/chat.functions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

interface Msg { role: "user" | "assistant"; content: string }

export function Chatbot({ applicationId }: { applicationId?: string | null }) {
  const { user } = useAuth();
  const chatFn = useServerFn(chat);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", content: "Hi! I'm ACREDIA's assistant. Ask me about ETEEAP, requirements, how matching works, or your application." },
  ]);
  const [convId, setConvId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, open]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    try {
      const res = await chatFn({ data: { message: text, conversationId: convId, userId: user?.id ?? null, applicationId: applicationId ?? null } });
      setConvId(res.conversationId);
      setMsgs((m) => [...m, { role: "assistant", content: res.reply }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chat error");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-maroon-gradient text-gold shadow-elegant transition hover:scale-105"
        aria-label="Open ACREDIA assistant"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex h-[560px] w-[380px] flex-col rounded-2xl border border-border bg-card shadow-elegant">
      <header className="flex items-center justify-between rounded-t-2xl bg-maroon-gradient px-4 py-3 text-primary-foreground">
        <div>
          <p className="font-display text-lg leading-none text-gold">ACREDIA Assistant</p>
          <p className="text-xs opacity-80">Informational only · not an official decision</p>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Close"><X className="h-5 w-5 text-gold" /></button>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground" : "mr-auto max-w-[90%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-foreground"}>
            <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-1 [&_*]:!text-current">
              <ReactMarkdown>{m.content}</ReactMarkdown>
            </div>
          </div>
        ))}
        {loading && <div className="text-xs italic text-muted-foreground">Thinking…</div>}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="flex gap-2 border-t border-border p-3"
      >
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything…" disabled={loading} />
        <Button type="submit" size="icon" disabled={loading || !input.trim()}><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}
