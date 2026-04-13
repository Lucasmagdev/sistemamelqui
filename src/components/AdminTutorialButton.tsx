import { BookOpen, CheckCircle2, HelpCircle, Lightbulb, ListChecks, MousePointerClick } from 'lucide-react';
import type { ComponentType } from 'react';
import { useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

type TutorialContent = {
  title: string;
  description: string;
  whereToClick: string[];
  quickStart: string[];
  dailyUse: string[];
  tips: string[];
};

const defaultTutorial: TutorialContent = {
  title: 'Tutorial da area administrativa',
  description: 'Guia rapido para usar a tela atual sem precisar de video ou treinamento separado.',
  whereToClick: [
    'Use o menu lateral esquerdo para mudar de modulo: Dashboard, Estoque, Pedidos, Clientes, Produtos, Vendas, Financeiro, Relatorios e Configuracoes.',
    'Use os botoes do canto superior direito, como Novo pedido e Novo lote, para iniciar cadastros rapidos.',
    'Use filtros, busca e cards da propria tela antes de editar ou salvar informacoes.',
  ],
  quickStart: [
    'Primeiro confira em qual aba voce esta olhando o titulo no topo da pagina.',
    'Depois procure o botao principal da tela, normalmente Novo, Salvar, Atualizar, Confirmar ou Gerar.',
    'Ao terminar uma alteracao, volte na listagem ou atualize os dados para confirmar se ficou correto.',
  ],
  dailyUse: [
    'Mantenha os campos obrigatorios completos para evitar erro em pedidos, relatorios e documentos.',
    'Revise valores, status, endereco, metodo de pagamento e observacoes antes de confirmar uma acao.',
    'Se tiver duvida, abra este Tutorial de novo e siga o fluxo da tela por etapas.',
  ],
  tips: [
    'Evite cadastros duplicados, principalmente em clientes e produtos.',
    'Nao altere status ou estoque sem ter certeza da operacao real.',
    'Use este guia como checklist antes de treinar alguem novo no sistema.',
  ],
};

const tutorialsByPath: Record<string, TutorialContent> = {
  '/admin': {
    title: 'Dashboard',
    description: 'Tela inicial para acompanhar pedidos, vendas, alertas e atalhos da operacao.',
    whereToClick: [
      'Clique nos cards de indicadores para identificar rapidamente faturamento, pedidos e alertas.',
      'Clique no sino do cabecalho para ir para a area de estoque e conferir alertas.',
      'Clique em Novo pedido no cabecalho quando precisar cadastrar um pedido manual sem sair procurando no menu.',
      'Use o menu lateral para abrir Pedidos, Vendas, Financeiro ou Relatorios quando precisar ver o detalhe de um numero.',
    ],
    quickStart: [
      'Abra o Dashboard no inicio do dia e confira se ha pedidos novos ou atrasados.',
      'Leia os cards principais de cima para baixo antes de tomar decisao.',
      'Se algum indicador chamar atencao, entre na aba correspondente pelo menu lateral.',
    ],
    dailyUse: [
      'Use o Dashboard como painel de acompanhamento, nao como fechamento definitivo de caixa.',
      'Confira alertas de estoque antes de aceitar pedidos grandes.',
      'Quando houver divergencia, valide a informacao na tela de origem: Pedidos, Vendas ou Financeiro.',
    ],
    tips: [
      'Se um numero parecer desatualizado, recarregue a pagina e confira a tela detalhada.',
      'Nao conclua analise financeira somente pelo Dashboard.',
      'Treine o operador a olhar primeiro pedidos pendentes e depois estoque.',
    ],
  },
  '/admin/estoque': {
    title: 'Estoque e lotes',
    description: 'Tela para conferir saldo, validade, lotes e movimentacoes de estoque.',
    whereToClick: [
      'Clique em Novo lote no cabecalho ou entre em Estoque > Novo lote para registrar mercadoria nova.',
      'Use a busca ou filtros da tela para localizar produto, lote ou situacao de validade.',
      'Clique no item/lote desejado para abrir detalhes quando precisar conferir saldo ou movimentacao.',
      'Use botoes de ajuste somente quando a quantidade fisica foi conferida no estoque real.',
    ],
    quickStart: [
      'Comece filtrando os itens com baixo estoque ou validade proxima.',
      'Confira se o produto usado em pedidos possui saldo disponivel antes de confirmar preparo.',
      'Ao receber mercadoria, clique em Novo lote e registre a entrada antes de vender.',
    ],
    dailyUse: [
      'Priorize a saida dos lotes mais antigos e acompanhe validade.',
      'Use movimentacoes para entender entradas, saidas e reversoes de pedido cancelado.',
      'Revise o saldo depois de concluir ou cancelar pedidos importantes.',
    ],
    tips: [
      'Nao faca ajuste de estoque sem motivo claro.',
      'Nao misture produtos diferentes em um mesmo lote.',
      'Se houver divergencia, conte o estoque fisico antes de mexer no sistema.',
    ],
  },
  '/admin/lotes/novo': {
    title: 'Cadastro de lote',
    description: 'Fluxo para registrar a entrada de novos produtos no estoque.',
    whereToClick: [
      'Clique no campo de produto e selecione o item correto antes de preencher quantidade.',
      'Preencha quantidade, unidade, custo e validade nos campos do formulario.',
      'Use campos de observacao/origem quando precisar registrar fornecedor, etiqueta ou detalhe da compra.',
      'Clique em Salvar somente depois de revisar produto, quantidade e validade.',
    ],
    quickStart: [
      'Escolha o produto exato que entrou no estoque.',
      'Informe a quantidade na mesma unidade usada no controle interno.',
      'Salve e volte em Estoque para conferir se o saldo foi atualizado.',
    ],
    dailyUse: [
      'Use esta tela sempre que chegar mercadoria nova.',
      'Cadastre validade para facilitar alertas e conferencia.',
      'Se errar uma entrada, corrija com um ajuste rastreavel em vez de esconder a diferenca.',
    ],
    tips: [
      'Produto errado no lote causa erro em pedido e relatorio.',
      'Quantidade errada impacta diretamente a disponibilidade da vitrine.',
      'Sempre revise antes de salvar porque estoque e uma area sensivel.',
    ],
  },
  '/admin/pedidos': {
    title: 'Pedidos',
    description: 'Tela para acompanhar, atualizar, imprimir, cancelar e concluir pedidos.',
    whereToClick: [
      'Clique nos filtros de status para ver pedidos recebidos, em preparo, concluidos ou cancelados.',
      'Clique no botao de status do pedido para avancar o fluxo: confirmar, preparar, sair para entrega ou concluir.',
      'Clique em Imprimir ou PDF ao lado do pedido para gerar a Nota do Pedido.',
      'Clique em Cancelar quando precisar cancelar um pedido e informe o motivo quando o sistema pedir.',
      'Clique em Novo pedido no cabecalho para cadastrar um pedido manual.',
    ],
    quickStart: [
      'Comece pelos pedidos mais novos ou pendentes de confirmacao.',
      'Abra/conferira cliente, itens, endereco e metodo de pagamento antes de mudar status.',
      'Gere a nota quando o pedido for para conferencia, entrega ou atendimento ao cliente.',
    ],
    dailyUse: [
      'Confirme pedidos novos antes de iniciar preparo.',
      'Conclua apenas quando a venda realmente terminou.',
      'Cancele somente quando o pedido nao deve mais contar como receita.',
    ],
    tips: [
      'Ao confirmar Vemo ou Zelle, o cliente pode receber link/QR se estiver configurado.',
      'Pedido com cartao indica pagamento presencial.',
      'Cancelamento pode afetar estoque e relatorios, entao revise antes de confirmar.',
    ],
  },
  '/admin/pedidos/novo': {
    title: 'Novo pedido',
    description: 'Cadastro manual para pedido feito por telefone, WhatsApp ou presencialmente.',
    whereToClick: [
      'Clique no campo de cliente para selecionar um cliente existente ou preencher os dados do novo cliente.',
      'Clique em Adicionar produto para incluir itens no pedido.',
      'Use quantidade, unidade, observacoes e tipo de corte para detalhar cada item.',
      'Selecione o metodo de pagamento correto: Vemo, Zelle ou Cartao.',
      'Revise total e endereco, depois clique em Salvar/Criar pedido.',
    ],
    quickStart: [
      'Cadastre primeiro o cliente e confirme telefone.',
      'Adicione todos os produtos com quantidade correta.',
      'Escolha pagamento e entrega antes de salvar.',
    ],
    dailyUse: [
      'Use esta tela para pedidos que nao entraram pela loja online.',
      'Coloque observacoes de corte de forma clara para evitar erro na producao.',
      'Depois de salvar, acompanhe o pedido na aba Pedidos.',
    ],
    tips: [
      'Evite pedido duplicado verificando se o cliente ja comprou pela loja.',
      'Metodo de pagamento errado envia instrucao errada ao cliente.',
      'Endereco incompleto atrasa entrega.',
    ],
  },
  '/admin/clientes': {
    title: 'Clientes',
    description: 'Tela para buscar, revisar e organizar a base de clientes.',
    whereToClick: [
      'Use a barra de busca para procurar por nome, telefone ou email antes de criar um novo cadastro.',
      'Clique no cliente da lista para conferir dados e historico.',
      'Use o botao de editar quando precisar corrigir telefone, email, cidade ou endereco.',
      'Use controles de VIP/campanha quando quiser separar clientes para comunicacoes automaticas.',
    ],
    quickStart: [
      'Pesquise primeiro para evitar cliente duplicado.',
      'Abra o cadastro e confira contatos principais.',
      'Atualize informacoes incompletas antes de usar o cliente em pedido ou campanha.',
    ],
    dailyUse: [
      'Use esta tela para localizar clientes recorrentes.',
      'Mantenha telefone e cidade atualizados para facilitar entrega.',
      'Revise clientes VIP antes de disparar campanhas.',
    ],
    tips: [
      'Telefone e email duplicados baguncam historico e campanhas.',
      'Dados pessoais devem ser tratados com cuidado.',
      'Um cliente incompleto pode gerar problema em pedido e entrega.',
    ],
  },
  '/admin/produtos': {
    title: 'Produtos',
    description: 'Tela para cadastrar o catalogo que aparece para o cliente na loja.',
    whereToClick: [
      'Clique em Novo produto para cadastrar um item novo.',
      'Clique em Editar no card/linha do produto para corrigir preco, descricao, imagem ou categoria.',
      'Escolha uma das categorias padrao: Cortes bovinos, Cortes suinos ou Cortes de aves.',
      'Use o campo de imagem para enviar a foto do produto.',
      'Clique em Salvar e depois confira a loja do cliente para validar se apareceu corretamente.',
    ],
    quickStart: [
      'Preencha nome, categoria, unidade, preco, descricao e imagem.',
      'Use descricao objetiva para explicar o corte e evitar duvidas.',
      'Salve e confira se o produto ficou completo.',
    ],
    dailyUse: [
      'Atualize preco sempre que houver mudanca comercial.',
      'Troque imagem ruim por uma foto mais clara.',
      'Mantenha o catalogo enxuto e organizado nas 3 categorias.',
    ],
    tips: [
      'Produto sem nome, unidade, preco, descricao ou imagem nao aparece para clientes.',
      'Categoria fora do padrao pode baguncar a vitrine.',
      'Preco errado impacta pedido, venda e relatorio.',
    ],
  },
  '/admin/vendas': {
    title: 'Vendas',
    description: 'Tela para registrar e consultar vendas realizadas.',
    whereToClick: [
      'Use filtros de data para conferir vendas do dia, semana ou periodo desejado.',
      'Clique em Nova venda quando precisar registrar uma venda manual.',
      'Selecione o cliente/produtos e escolha o metodo de pagamento correto.',
      'Use Gerar recibo/Imprimir quando precisar entregar comprovante ao cliente.',
    ],
    quickStart: [
      'Confira o periodo antes de analisar a listagem.',
      'Registre vendas manuais somente quando elas nao vierem de um pedido.',
      'Revise total e pagamento antes de finalizar.',
    ],
    dailyUse: [
      'Compare as vendas do dia com o caixa real.',
      'Separe corretamente Vemo, Zelle, Cartao, Pix ou Dinheiro.',
      'Use relatorios para consolidar a visao geral.',
    ],
    tips: [
      'Venda duplicada distorce financeiro e relatorios.',
      'Metodo de pagamento errado dificulta conferencia de recebimento.',
      'Recibo deve ser gerado depois de conferir os itens.',
    ],
  },
  '/admin/financeiro': {
    title: 'Financeiro',
    description: 'Tela para cadastrar despesas, custos fixos, custos variaveis e usar OCR.',
    whereToClick: [
      'Clique em Nova despesa ou no formulario de despesa para cadastrar um custo.',
      'Marque se o custo e Fixo ou Variavel antes de salvar.',
      'Escolha a categoria para detalhar melhor a despesa.',
      'Clique na area de upload/OCR para enviar comprovante e preencher sugestoes automaticamente.',
      'Revise a sugestao do OCR e clique em Salvar somente quando valor, data e descricao estiverem corretos.',
    ],
    quickStart: [
      'Escolha o periodo que deseja analisar.',
      'Cadastre despesas separando custo fixo e variavel.',
      'Confira o resumo financeiro depois de salvar.',
    ],
    dailyUse: [
      'Registre custos no dia em que eles aparecem.',
      'Use OCR para acelerar comprovantes, mas revise tudo.',
      'Acompanhe resultado por periodo para entender margem.',
    ],
    tips: [
      'Custo fixo e recorrente; custo variavel muda conforme a operacao.',
      'Data errada joga a despesa no periodo errado.',
      'OCR pode errar valor ou data, entao nunca salve sem revisar.',
    ],
  },
  '/admin/funcionarios': {
    title: 'Funcionarios',
    description: 'Tela para controlar pessoas e acessos internos.',
    whereToClick: [
      'Clique em Novo funcionario para cadastrar alguem da equipe.',
      'Preencha nome, contato e funcao/papel quando esses campos aparecerem.',
      'Use Editar para corrigir dados ou alterar status do funcionario.',
      'Use controles de acesso com cuidado quando o usuario tiver permissao administrativa.',
    ],
    quickStart: [
      'Cadastre apenas pessoas que realmente fazem parte da operacao.',
      'Revise permissao antes de liberar acesso.',
      'Atualize ou desative registro quando alguem sair.',
    ],
    dailyUse: [
      'Mantenha a lista atualizada.',
      'Revise acessos periodicamente.',
      'Use dados corretos para auditoria interna.',
    ],
    tips: [
      'Nao compartilhe a mesma conta entre varias pessoas.',
      'Permissao demais aumenta risco operacional.',
      'Quando trocar equipe, revise usuarios ativos.',
    ],
  },
  '/admin/relatorios': {
    title: 'Relatorios',
    description: 'Tela para analisar vendas, pedidos, pagamentos e desempenho.',
    whereToClick: [
      'Clique nos campos de data para escolher inicio e fim do periodo.',
      'Use botoes/filtros da tela para alternar entre visoes de vendas, pagamentos e operacao.',
      'Observe graficos e tabelas para entender quais categorias, metodos e pedidos impactaram o resultado.',
      'Volte para Pedidos, Vendas ou Financeiro quando precisar corrigir a origem de algum numero.',
    ],
    quickStart: [
      'Escolha o periodo antes de olhar qualquer grafico.',
      'Confira primeiro os totais e depois os detalhes.',
      'Compare metodos de pagamento com o caixa/recebimentos.',
    ],
    dailyUse: [
      'Use no fechamento do dia ou da semana.',
      'Acompanhe produtos fortes e pontos de atencao.',
      'Use os dados para planejar compra de estoque.',
    ],
    tips: [
      'Relatorio depende de pedidos e vendas cadastrados corretamente.',
      'Pedidos cancelados nao devem contar como receita concluida.',
      'Se um numero parecer estranho, audite na tela de origem.',
    ],
  },
  '/admin/configuracoes': {
    title: 'Configuracoes',
    description: 'Tela para ajustar loja, marca, pagamentos, WhatsApp e integracoes.',
    whereToClick: [
      'No bloco de loja/branding, preencha nome da empresa, logo, cor principal e URL publica da loja.',
      'No bloco Vemo, clique em Escolher arquivo para enviar QR Code, preencha o link e clique em Salvar configuracao.',
      'No bloco Zelle, repita o mesmo processo: imagem do QR, link de pagamento e Salvar configuracao.',
      'Clique em Ver preview para conferir QR salvo sem carregar imagem pesada automaticamente.',
      'No bloco Z-API, revise conexao, templates e grupo do WhatsApp antes de usar mensagens automaticas.',
    ],
    quickStart: [
      'Configure primeiro marca e URL publica, porque isso aparece na loja e na nota digital.',
      'Depois configure Vemo/Zelle se esses pagamentos estiverem ativos.',
      'Por fim, teste Z-API e grupo de WhatsApp.',
    ],
    dailyUse: [
      'Use esta tela quando mudar dados da loja ou forma de pagamento.',
      'Teste integracoes depois de alterar credenciais ou mensagens.',
      'Mantenha a URL publica correta para o QR Code da nota digital nao apontar para localhost.',
    ],
    tips: [
      'Alteracoes aqui afetam varias telas do sistema.',
      'Nao troque chave de integracao sem testar depois.',
      'QR de pagamento deve ser revisado com preview antes de usar em pedido real.',
    ],
  },
};

const getTutorialForPath = (pathname: string) => tutorialsByPath[pathname] || defaultTutorial;

function TutorialSection({
  icon: Icon,
  title,
  items,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  items: string[];
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card/70 p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
      </div>
      <ol className="space-y-2 text-sm leading-6 text-muted-foreground">
        {items.map((item, index) => (
          <li key={item} className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/30 text-[11px] font-bold text-primary">
              {index + 1}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function AdminTutorialButton() {
  const { pathname } = useLocation();
  const tutorial = getTutorialForPath(pathname);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <HelpCircle className="h-4 w-4" />
          <span className="hidden sm:inline">Tutorial</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        overlayClassName="bg-transparent"
        className="flex h-full w-[92vw] flex-col overflow-y-auto border-l border-border/70 bg-background/95 shadow-2xl backdrop-blur-xl sm:max-w-xl"
      >
        <SheetHeader className="space-y-3 text-left">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-primary">
            <BookOpen className="h-3.5 w-3.5" />
            Ajuda rapida
          </div>
          <SheetTitle className="text-2xl font-extrabold tracking-tight">{tutorial.title}</SheetTitle>
          <SheetDescription className="text-sm leading-6">{tutorial.description}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4 pb-4">
          <TutorialSection icon={MousePointerClick} title="Onde clicar nesta tela" items={tutorial.whereToClick} />
          <TutorialSection icon={ListChecks} title="Como cadastrar ou comecar" items={tutorial.quickStart} />
          <TutorialSection icon={CheckCircle2} title="Como usar no dia a dia" items={tutorial.dailyUse} />
          <TutorialSection icon={Lightbulb} title="Cuidados importantes" items={tutorial.tips} />

          <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
            Este tutorial e leve e fica dentro do sistema. Se no futuro precisar de videos, podemos adicionar links externos aqui sem pesar a aplicacao.
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
