import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { backendRequest } from "@/lib/backendClient";

type DateRange = {
  start: string;
  end: string;
};

type OrdersFilters = DateRange & {
  status?: string;
  city?: string;
  search?: string;
  onlyOpen?: boolean;
  page?: number;
  pageSize?: number;
};

type ClientsFilters = {
  search?: string;
  segment?: "all" | "vip" | "non_vip";
  withOrders?: boolean;
  page?: number;
  pageSize?: number;
  sortField?: "nome" | "email" | "vip" | "pedidos";
  sortDir?: "asc" | "desc";
};

const DEFAULT_QUERY_OPTIONS = {
  staleTime: 60_000,
  refetchOnWindowFocus: false,
  placeholderData: keepPreviousData,
};

const buildQueryString = (params: Record<string, unknown>) => {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "boolean") {
      searchParams.set(key, value ? "true" : "false");
      continue;
    }
    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
};

export const adminQueryKeys = {
  orders: (filters: OrdersFilters) => ["admin", "orders", filters] as const,
  clients: (filters: ClientsFilters) => ["admin", "clients", filters] as const,
  operationalReport: (range: DateRange) => ["admin", "operational-report", range] as const,
  stockProducts: () => ["admin", "stock-products"] as const,
  storeSalesHistory: (range: DateRange) => ["admin", "store-sales-history", range] as const,
  financeOverview: (range: DateRange) => ["admin", "finance-overview", range] as const,
  expensesHistory: (range: DateRange) => ["admin", "expenses-history", range] as const,
  employees: () => ["admin", "employees"] as const,
  employeePaymentsSummary: (range: DateRange) => ["admin", "employee-payments-summary", range] as const,
  employeePaymentsHistory: (range: DateRange) => ["admin", "employee-payments-history", range] as const,
};

export function useAdminOrdersQuery(filters: OrdersFilters) {
  return useQuery({
    queryKey: adminQueryKeys.orders(filters),
    queryFn: () =>
      backendRequest(`/api/orders/admin${buildQueryString(filters)}`),
    ...DEFAULT_QUERY_OPTIONS,
  });
}

export function useAdminClientsQuery(filters: ClientsFilters) {
  return useQuery({
    queryKey: adminQueryKeys.clients(filters),
    queryFn: () =>
      backendRequest(`/api/clients/admin${buildQueryString(filters)}`),
    ...DEFAULT_QUERY_OPTIONS,
  });
}

export function useOperationalReportQuery(range: DateRange) {
  return useQuery({
    queryKey: adminQueryKeys.operationalReport(range),
    queryFn: () =>
      backendRequest(`/api/reports/operational${buildQueryString(range)}`),
    ...DEFAULT_QUERY_OPTIONS,
  });
}

export function useStockProductsQuery() {
  return useQuery({
    queryKey: adminQueryKeys.stockProducts(),
    queryFn: () => backendRequest("/api/stock/balance"),
    ...DEFAULT_QUERY_OPTIONS,
  });
}

export function useStoreSalesHistoryQuery(range: DateRange, enabled: boolean) {
  return useQuery({
    queryKey: adminQueryKeys.storeSalesHistory(range),
    queryFn: () =>
      backendRequest(`/api/store-sales${buildQueryString(range)}`),
    enabled,
    ...DEFAULT_QUERY_OPTIONS,
  });
}

export function useFinanceOverviewQuery(range: DateRange) {
  return useQuery({
    queryKey: adminQueryKeys.financeOverview(range),
    queryFn: () =>
      backendRequest(`/api/finance/overview${buildQueryString(range)}`),
    ...DEFAULT_QUERY_OPTIONS,
  });
}

export function useExpensesHistoryQuery(range: DateRange, enabled: boolean) {
  return useQuery({
    queryKey: adminQueryKeys.expensesHistory(range),
    queryFn: () =>
      backendRequest(`/api/expenses${buildQueryString(range)}`),
    enabled,
    ...DEFAULT_QUERY_OPTIONS,
  });
}

export function useEmployeesQuery() {
  return useQuery({
    queryKey: adminQueryKeys.employees(),
    queryFn: () => backendRequest("/api/employees"),
    ...DEFAULT_QUERY_OPTIONS,
  });
}

export function useEmployeePaymentsSummaryQuery(range: DateRange) {
  return useQuery({
    queryKey: adminQueryKeys.employeePaymentsSummary(range),
    queryFn: () =>
      backendRequest(`/api/employee-payments/summary${buildQueryString(range)}`),
    ...DEFAULT_QUERY_OPTIONS,
  });
}

export function useEmployeePaymentsHistoryQuery(range: DateRange, enabled: boolean) {
  return useQuery({
    queryKey: adminQueryKeys.employeePaymentsHistory(range),
    queryFn: () =>
      backendRequest(`/api/employee-payments${buildQueryString(range)}`),
    enabled,
    ...DEFAULT_QUERY_OPTIONS,
  });
}
