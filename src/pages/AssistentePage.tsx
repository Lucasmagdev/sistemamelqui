import { useState } from 'react';
import { backendRequest } from '@/lib/backendClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  domain?: string;
  sources?: Array<{
    type: string;
    label: string;
  }>;
};

type AssistantResponse = {
  answer: string;
  domain: string;
  report_summary: any;
  sources?: Array<{
    type: string;
    label: string;
  }>;
};

export default function AssistentePage() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Assistente central pronto. Consulte pedidos, vendas, estoque, financeiro ou funcionarios.',
      domain: 'central',
    },
  ]);

  const submit = async (event: any) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setQuestion('');
    setLoading(true);
    try {
      const payload = await backendRequest<AssistantResponse>('/api/assistant/query', {
        method: 'POST',
        body: JSON.stringify({ question: trimmed }),
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: payload.answer,
          domain: payload.domain,
          sources: payload.sources || [],
        },
      ]);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao consultar o assistente');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Assistente central</h1>
        <p className="text-sm text-muted-foreground">
          Camada read-only com leitura de operacao, tabelas do banco, SQLs e trechos do codigo
        </p>
      </div>

      <Card className="border-border/70 bg-card p-5">
        <div className="mb-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border/70 px-3 py-1">Pedidos</span>
          <span className="rounded-full border border-border/70 px-3 py-1">Vendas</span>
          <span className="rounded-full border border-border/70 px-3 py-1">Estoque</span>
          <span className="rounded-full border border-border/70 px-3 py-1">Financeiro</span>
          <span className="rounded-full border border-border/70 px-3 py-1">Funcionarios</span>
          <span className="rounded-full border border-border/70 px-3 py-1">Banco</span>
          <span className="rounded-full border border-border/70 px-3 py-1">Codigo</span>
        </div>

        <p className="mb-4 text-xs text-muted-foreground">
          Exemplos: "quais tabelas guardam pedidos e clientes?", "onde o status do pedido muda no codigo?" ou
          "me mostre colunas importantes de products e orders".
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
                  {message.role === 'assistant' ? `Especialista ${message.domain || 'central'}` : 'Pergunta'}
                </span>
              </div>
              <div className="whitespace-pre-wrap text-sm text-foreground">{message.content}</div>
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
            </div>
          ))}
        </div>

        <form className="mt-6 space-y-3" onSubmit={submit}>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="min-h-[120px] w-full rounded-xl border border-input bg-background px-4 py-3 text-sm"
            placeholder="Ex.: Onde o backend atualiza status do pedido? Quais colunas existem em orders? Quanto vendemos no delivery esta semana?"
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={loading}>
              {loading ? 'Consultando...' : 'Perguntar ao assistente'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
