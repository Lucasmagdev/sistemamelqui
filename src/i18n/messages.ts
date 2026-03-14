export type Locale = 'pt' | 'en';

export type TranslationKey =
  | 'common.erpPremium'
  | 'common.user'
  | 'common.admin'
  | 'common.logout'
  | 'common.newOrder'
  | 'common.newBatch'
  | 'common.loading'
  | 'common.login'
  | 'common.email'
  | 'common.password'
  | 'common.yourEmail'
  | 'common.rightsReserved'
  | 'nav.dashboard'
  | 'nav.batches'
  | 'nav.orders'
  | 'nav.customers'
  | 'nav.products'
  | 'nav.sales'
  | 'nav.finance'
  | 'nav.employees'
  | 'nav.reports'
  | 'nav.assistant'
  | 'dock.home'
  | 'header.adminPanel'
  | 'header.openProfile'
  | 'auth.invalidCredentials'
  | 'auth.noLinkedProfile'
  | 'auth.loginError'
  | 'notFound.message'
  | 'notFound.backHome'
  | 'page.batchRegistration'
  | 'page.alerts'
  | 'page.settings';

type Dictionary = Record<TranslationKey, string>;

export const messages: Record<Locale, Dictionary> = {
  pt: {
    'common.erpPremium': 'ERP Premium',
    'common.user': 'Usuario',
    'common.admin': 'Admin',
    'common.logout': 'Sair',
    'common.newOrder': 'Novo Pedido',
    'common.newBatch': 'Novo Lote',
    'common.loading': 'Entrando...',
    'common.login': 'Entrar',
    'common.email': 'E-mail',
    'common.password': 'Senha',
    'common.yourEmail': 'Seu e-mail',
    'common.rightsReserved': 'Todos os direitos reservados.',
    'nav.dashboard': 'Dashboard',
    'nav.batches': 'Lotes',
    'nav.orders': 'Pedidos',
    'nav.customers': 'Clientes',
    'nav.products': 'Produtos',
    'nav.sales': 'Vendas',
    'nav.finance': 'Financeiro',
    'nav.employees': 'Funcionarios',
    'nav.reports': 'Relatorios',
    'nav.assistant': 'Assistente',
    'dock.home': 'Inicio',
    'header.adminPanel': 'Painel Administrativo',
    'header.openProfile': 'Abrir perfil',
    'auth.invalidCredentials': 'Usuario ou senha invalidos',
    'auth.noLinkedProfile': 'Usuario sem perfil vinculado.',
    'auth.loginError': 'Erro ao tentar logar.',
    'notFound.message': 'Ops! Pagina nao encontrada',
    'notFound.backHome': 'Voltar ao inicio',
    'page.batchRegistration': 'Cadastro de Lote',
    'page.alerts': 'Alertas',
    'page.settings': 'Configuracoes',
  },
  en: {
    'common.erpPremium': 'Premium ERP',
    'common.user': 'User',
    'common.admin': 'Admin',
    'common.logout': 'Sign out',
    'common.newOrder': 'New Order',
    'common.newBatch': 'New Batch',
    'common.loading': 'Signing in...',
    'common.login': 'Sign in',
    'common.email': 'Email',
    'common.password': 'Password',
    'common.yourEmail': 'Your email',
    'common.rightsReserved': 'All rights reserved.',
    'nav.dashboard': 'Dashboard',
    'nav.batches': 'Batches',
    'nav.orders': 'Orders',
    'nav.customers': 'Customers',
    'nav.products': 'Products',
    'nav.sales': 'Sales',
    'nav.finance': 'Finance',
    'nav.employees': 'Employees',
    'nav.reports': 'Reports',
    'nav.assistant': 'Assistant',
    'dock.home': 'Home',
    'header.adminPanel': 'Admin Panel',
    'header.openProfile': 'Open profile',
    'auth.invalidCredentials': 'Invalid email or password',
    'auth.noLinkedProfile': 'User has no linked profile.',
    'auth.loginError': 'Could not sign in.',
    'notFound.message': 'Oops! Page not found',
    'notFound.backHome': 'Return to Home',
    'page.batchRegistration': 'Batch Registration',
    'page.alerts': 'Alerts',
    'page.settings': 'Settings',
  },
};
