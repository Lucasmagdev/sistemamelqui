import { useState } from 'react';
import { backendRequest } from '@/lib/backendClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

type AssistantSource = {
  type: string;
  label: string;
};

type AssistantFilter = {
  label: string;
  value: string;
};

type AssistantPeriod = {
  label: string;
  startDate?: string | null;
  endDate?: string | null;
  timezone?: string | null;
  allTime?: boolean;
};

type ClarificationOption = {
  id: string;
  label: string;
  description?: string;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  domain?: string;
  sources?: AssistantSource[];
  appliedFilters?: AssistantFilter[];
  period?: AssistantPeriod | null;
  mode?: 'answer' | 'clarification';
  options?: ClarificationOption[];
  clarificationType?: string;
};

type AssistantAnswerResponse = {
  ok: true;
  mode: 'answer';
  domain: string;
  answer: string;
  sources?: AssistantSource[];
  applied_filters?: AssistantFilter[];
  period?: AssistantPeriod;
  conversationId?: string;
};

type AssistantClarificationResponse = {
  ok: true;
  mode: 'clarification';
  domain: string;
  clarification: string;
  options: ClarificationOption[];
  pending_intent?: {
    type?: string;
  };
  conversationId?: string;
};

type AssistantResponse = AssistantAnswerResponse | AssistantClarificationResponse;

function createConversationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `assistant-${Date.now()}`;
}

export default function AssistentePage() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId] = useState(createConversationId);
  const [lastQuestion, setLastQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Assistente administrativo pronto. Pergunte sobre pedidos, vendas, financeiro, funcionarios e clientes.',
      domain: 'central',
      mode: 'answer',
    },
  ]);

  const pushAssistantMessage = (payload: AssistantResponse) => {
    if (payload.mode === 'clarification') {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: payload.clarification,
          domain: payload.domain,
          mode: 'clarification',
          options: payload.options || [],
          clarificationType: payload.pending_intent?.type || 'choice',
        },
      ]);
      return;
    }

    setMessages((prev) => [
      ...prev,
      {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: payload.answer,
        domain: payload.domain,
        mode: 'answer',
        sources: payload.sources || [],
        appliedFilters: payload.applied_filters || [],
        period: payload.period || null,
      },
    ]);
  };

  const submitQuestion = async (trimmed: string) => {
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setQuestion('');
    setLastQuestion(trimmed);
    setLoading(true);

    try {
      const payload = await backendRequest<AssistantResponse>('/api/assistant/query', {
        method: 'POST',
        body: JSON.stringify({
          question: trimmed,
          conversationId,
        }),
      });

      pushAssistantMessage(payload);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao consultar o assistente');
    } finally {
      setLoading(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    await submitQuestion(trimmed);
  };

  const handleClarification = async (type: string, selectedId: string) => {
    if (!lastQuestion || loading) return;

    setLoading(true);
    try {
      const payload = await backendRequest<AssistantResponse>('/api/assistant/query', {
        method: 'POST',
        body: JSON.stringify({
          question: lastQuestion,
          conversationId,
          confirmation: {
            type,
            selectedId,
          },
        }),
      });

      pushAssistantMessage(payload);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao confirmar a opcao');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Assistente administrativo</h1>
        <p className="text-sm text-muted-foreground">
          Camada read-only para responder perguntas de operacao e gestao com base nos dados do sistema
        </p>
      </div>

      <Card className="border-border/70 bg-card p-5">
        <div className="mb-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border/70 px-3 py-1">Pedidos</span>
          <span className="rounded-full border border-border/70 px-3 py-1">Vendas</span>
          <span className="rounded-full border border-border/70 px-3 py-1">Financeiro</span>
          <span className="rounded-full border border-border/70 px-3 py-1">Funcionarios</span>
          <span className="rounded-full border border-border/70 px-3 py-1">Clientes</span>
        </div>

        <p className="mb-4 text-xs text-muted-foreground">
          Exemplos: "quantos pedidos foram feitos semana passada?", "qual foi o pedido mais caro?" ou
          "quanto foi pago ao Joao em fevereiro?".
        </p>

        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`rounded-2xl border p-4 ${
                message.role === 'assistant'
                  ? 'border-primary/20 bg-primary/5'
                  : 'border-border/70 bg-background'
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {message.role === 'assistant' ? `Assistente ${message.domain || 'central'}` : 'Pergunta'}
                </span>
              </div>

              <div className="whitespace-pre-wrap text-sm text-foreground">{message.content}</div>

              {message.period && (
                <div className="mt-3 rounded-xl border border-border/60 bg-background px-3 py-2 text-xs text-muted-foreground">
                  Periodo: {message.period.label}
                  {message.period.startDate && message.period.endDate
                    ? ` (${message.period.startDate} ate ${message.period.endDate})`
                    : ''}
                </div>
              )}

              {message.appliedFilters && message.appliedFilters.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.appliedFilters.map((filter) => (
                    <span
                      key={`${message.id}-${filter.label}-${filter.value}`}
                      className="rounded-full border border-border/70 bg-background px-3 py-1 text-[11px] text-muted-foreground"
                    >
                      {filter.label}: {filter.value}
                    </span>
                  ))}
                </div>
              )}

              {message.sources && message.sources.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.sources.map((source) => (
                    <span
                      key={`${message.id}-${source.type}-${source.label}`}
                      className="rounded-full border border-border/70 bg-background px-3 py-1 text-[11px] text-muted-foreground"
                    >
                      {source.label}
                    </span>
                  ))}
                </div>
              )}

              {message.mode === 'clarification' && message.options && message.options.length > 0 && (
                <div className="mt-4 space-y-2">
                  {message.options.map((option) => (
                    <button
                      key={`${message.id}-${option.id}`}
                      type="button"
                      onClick={() => handleClarification(message.clarificationType || 'choice', option.id)}
                      className="flex w-full items-start justify-between gap-3 rounded-xl border border-border/70 bg-background px-4 py-3 text-left transition hover:border-primary/40"
                      disabled={loading}
                    >
                      <div>
                        <div className="text-sm font-medium text-foreground">{option.label}</div>
                        {option.description && (
                          <div className="mt-1 text-xs text-muted-foreground">{option.description}</div>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">Selecionar</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <form className="mt-6 space-y-3" onSubmit={submit}>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="min-h-[120px] w-full rounded-xl border border-input bg-background px-4 py-3 text-sm"
            placeholder="Ex.: quanto vendemos no delivery esta semana? qual cliente mais comprou no mes passado?"
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={loading}>
              {loading ? 'Consultando...' : 'Perguntar'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
