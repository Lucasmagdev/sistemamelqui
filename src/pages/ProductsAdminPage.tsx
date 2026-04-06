import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Boxes, Pencil, Plus, RefreshCw, Search, Tag, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { backendRequest } from "@/lib/backendClient";
import { prepareImageForUpload } from "@/lib/prepareImageForUpload";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

type Product = {
  id: number;
  nome: string;
  nome_en: string | null;
  descricao: string | null;
  descricao_en: string | null;
  categoria: string | null;
  categoria_en: string | null;
  preco: number | string;
  unidade: string | null;
  foto_url: string | null;
};

type ProductFormState = {
  id?: number | null;
  nome: string;
  nome_en: string;
  descricao: string;
  descricao_en: string;
  categoria: string;
  categoria_en: string;
  preco: string;
  unidade: string;
  foto: File | null;
  foto_url?: string;
};

const emptyForm = (): ProductFormState => ({
  id: null,
  nome: "",
  nome_en: "",
  descricao: "",
  descricao_en: "",
  categoria: "",
  categoria_en: "",
  preco: "",
  unidade: "LB",
  foto: null,
  foto_url: "",
});

const normalizeProductKey = (value: unknown) =>
  String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const getMissingProductIssues = (product: Partial<Product>) => {
  const issues: string[] = [];
  if (!String(product?.nome || "").trim()) issues.push("sem nome");
  if (!String(product?.categoria || "").trim()) issues.push("sem categoria");
  if (!String(product?.unidade || "").trim()) issues.push("sem unidade");
  if (!(Number(product?.preco) > 0)) issues.push("sem preco valido");
  if (!String(product?.descricao || "").trim() && !String(product?.descricao_en || "").trim()) issues.push("sem descricao");
  return issues;
};

const money = (value: number | string | null | undefined) =>
  Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

const inputClass = "h-11 rounded-xl border border-amber-400/50 bg-zinc-900 text-white placeholder:text-zinc-500 focus-visible:ring-amber-400";
const textareaClass = "min-h-[110px] w-full rounded-xl border border-amber-400/50 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400";
const selectClass = "flex h-11 w-full rounded-xl border border-amber-400/50 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400";
const EDIT_PRODUCT_ID_STORAGE_KEY = "products-admin-edit-id";
const editDraftStorageKey = (productId: number | string) => `products-admin-edit-draft:${productId}`;

type ProductMutationPayload = {
  nome: string;
  nome_en: string | null;
  descricao: string | null;
  descricao_en: string | null;
  categoria: string | null;
  categoria_en: string | null;
  preco: number;
  unidade: string;
  imageBase64?: string;
  imageFileName?: string;
};

type ProductMutationResponse = {
  ok: boolean;
  product: Product;
};

const createEditFormFromProduct = (product: Product, draft?: Partial<ProductFormState> | null): ProductFormState => ({
  id: product.id,
  nome: draft?.nome ?? product.nome ?? "",
  nome_en: draft?.nome_en ?? product.nome_en ?? "",
  descricao: draft?.descricao ?? product.descricao ?? "",
  descricao_en: draft?.descricao_en ?? product.descricao_en ?? "",
  categoria: draft?.categoria ?? product.categoria ?? "",
  categoria_en: draft?.categoria_en ?? product.categoria_en ?? "",
  preco: draft?.preco ?? String(product.preco || ""),
  unidade: draft?.unidade ?? product.unidade ?? "LB",
  foto: null,
  foto_url: product.foto_url || "",
});

const buildProductMutationPayload = async (form: ProductFormState): Promise<ProductMutationPayload> => {
  const payload: ProductMutationPayload = {
    nome: form.nome.trim(),
    nome_en: form.nome_en.trim() || null,
    descricao: form.descricao.trim() || null,
    descricao_en: form.descricao_en.trim() || null,
    categoria: form.categoria.trim() || null,
    categoria_en: form.categoria_en.trim() || null,
    preco: parseFloat(form.preco),
    unidade: form.unidade || "LB",
  };

  if (form.foto) {
    const preparedImage = await prepareImageForUpload(form.foto);
    payload.imageBase64 = preparedImage.dataUrl;
    payload.imageFileName = preparedImage.fileName;
  }

  return payload;
};

function ProductModal({
  open,
  title,
  subtitle,
  form,
  previewUrl,
  loading,
  submitLabel,
  onClose,
  onText,
  onFile,
  onSubmit,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  form: ProductFormState;
  previewUrl: string | null;
  loading: boolean;
  submitLabel: string;
  onClose: () => void;
  onText: (field: keyof ProductFormState, value: string) => void;
  onFile: (file: File | null) => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal((
    <div
      className="fixed inset-0 z-[120] overflow-y-auto bg-black/80 p-2 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mx-auto flex min-h-full items-center justify-center">
        <div className="flex w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-amber-400/30 bg-[#121212] shadow-2xl max-sm:min-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-3rem)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-6">
          <div>
            <h2 className="text-xl font-bold text-white sm:text-2xl">{title}</h2>
            <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>
          </div>
          <Button variant="ghost" className="text-zinc-300 hover:text-white" onClick={onClose} type="button">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={onSubmit} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_320px]">
            <div className="space-y-5">
              <div className="rounded-3xl border border-white/8 bg-zinc-950/40 p-4 sm:p-5">
                <h3 className="text-base font-semibold text-white">Dados principais</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-amber-200">Nome do produto</label>
                    <Input value={form.nome} onChange={(e) => onText("nome", e.target.value)} required className={inputClass} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-amber-200">Nome em ingles</label>
                    <Input value={form.nome_en} onChange={(e) => onText("nome_en", e.target.value)} className={inputClass} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-amber-200">Preco</label>
                    <Input type="number" step="0.01" min="0" value={form.preco} onChange={(e) => onText("preco", e.target.value)} required className={inputClass} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-amber-200">Categoria</label>
                    <Input value={form.categoria} onChange={(e) => onText("categoria", e.target.value)} required className={inputClass} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-amber-200">Categoria em ingles</label>
                    <Input value={form.categoria_en} onChange={(e) => onText("categoria_en", e.target.value)} className={inputClass} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-amber-200">Unidade</label>
                    <select value={form.unidade} onChange={(e) => onText("unidade", e.target.value)} className={selectClass}>
                      <option value="LB">LB</option>
                      <option value="KG">KG</option>
                      <option value="UN">UN</option>
                    </select>
                  </div>
                  <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300/70">Resumo</p>
                    <p className="mt-2 text-lg font-semibold text-white">{form.nome || "Produto sem nome"}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-300">
                      <span className="rounded-full border border-white/10 px-3 py-1">{form.categoria || "Sem categoria"}</span>
                      <span className="rounded-full border border-white/10 px-3 py-1">{form.unidade || "Sem unidade"}</span>
                      <span className="rounded-full border border-white/10 px-3 py-1">{money(form.preco)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/8 bg-zinc-950/40 p-4 sm:p-5">
                <h3 className="text-base font-semibold text-white">Descricao do catalogo</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-amber-200">Descricao</label>
                    <textarea value={form.descricao} onChange={(e) => onText("descricao", e.target.value)} className={textareaClass} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-amber-200">Descricao em ingles</label>
                    <textarea value={form.descricao_en} onChange={(e) => onText("descricao_en", e.target.value)} className={textareaClass} />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-3xl border border-white/8 bg-zinc-950/40 p-4 sm:p-5">
                <h3 className="text-base font-semibold text-white">Imagem</h3>
                <div className="mt-4 flex min-h-[240px] items-center justify-center rounded-3xl border border-dashed border-amber-400/35 bg-zinc-900 p-4">
                  {previewUrl ? (
                    <img src={previewUrl} alt="Preview do produto" className="max-h-[220px] w-full rounded-2xl object-cover" />
                  ) : (
                    <div className="text-center text-sm text-zinc-500">Nenhuma imagem selecionada</div>
                  )}
                </div>
                <div className="mt-4 space-y-2">
                  <label className="text-sm font-medium text-amber-200">Arquivo</label>
                  <Input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0] || null)} className={cn(inputClass, "cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-transparent file:text-sm file:text-zinc-300")} />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" className="border-white/15 bg-transparent text-white hover:bg-white/5" onClick={onClose} type="button">
              Cancelar
            </Button>
            <Button className="bg-amber-400 text-black hover:bg-amber-300" type="submit" disabled={loading}>
              {loading ? "Salvando..." : submitLabel}
            </Button>
          </div>
        </form>
      </div>
      </div>
    </div>
  ), document.body);
}

const ProductsAdminPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [fetching, setFetching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string>("");
  const [filterNome, setFilterNome] = useState("");
  const [filterCategoria, setFilterCategoria] = useState("");
  const [filterUnidade, setFilterUnidade] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [createForm, setCreateForm] = useState<ProductFormState>(emptyForm);
  const [editForm, setEditForm] = useState<ProductFormState>(emptyForm);
  const [createPreviewUrl, setCreatePreviewUrl] = useState<string | null>(null);
  const [editPreviewUrl, setEditPreviewUrl] = useState<string | null>(null);

  const setEditSearchParam = (productId: number | null) => {
    const nextParams = new URLSearchParams(searchParams);
    if (productId) {
      nextParams.set("edit", String(productId));
    } else {
      nextParams.delete("edit");
    }
    setSearchParams(nextParams, { replace: true });
  };

  const clearPersistedEditState = (productId?: number | null) => {
    localStorage.removeItem(EDIT_PRODUCT_ID_STORAGE_KEY);
    if (productId) localStorage.removeItem(editDraftStorageKey(productId));
    setEditSearchParam(null);
  };

  const refreshProducts = async () => {
    setFetching(true);
    const { data, error } = await supabase.from("products").select("id, nome, descricao, nome_en, descricao_en, categoria, categoria_en, preco, unidade, foto_url").order("id", { ascending: false });
    if (error) {
      setFeedback(`Erro ao carregar produtos: ${error.message}`);
    } else {
      setProducts((data || []) as Product[]);
    }
    setFetching(false);
  };

  useEffect(() => {
    void refreshProducts();
  }, []);

  const duplicateGroups = useMemo(() => {
    const groups = products.reduce((acc, product) => {
      const key = normalizeProductKey(product.nome);
      if (!key) return acc;
      if (!acc[key]) acc[key] = [];
      acc[key].push(product);
      return acc;
    }, {} as Record<string, Product[]>);
    return Object.values(groups).filter((group) => group.length > 1);
  }, [products]);

  const duplicateIds = useMemo(() => new Set(duplicateGroups.flat().map((product) => Number(product.id))), [duplicateGroups]);
  const incompleteProducts = useMemo(() => products.map((product) => ({ product, issues: getMissingProductIssues(product) })).filter((item) => item.issues.length > 0), [products]);
  const filteredProducts = useMemo(() => products.filter((product) => {
    const nomeMatch = !filterNome || String(product.nome || "").toLowerCase().includes(filterNome.toLowerCase());
    const categoriaMatch = !filterCategoria || String(product.categoria || "").toLowerCase().includes(filterCategoria.toLowerCase());
    const unidadeMatch = !filterUnidade || String(product.unidade || "").toLowerCase().includes(filterUnidade.toLowerCase());
    return nomeMatch && categoriaMatch && unidadeMatch;
  }), [filterCategoria, filterNome, filterUnidade, products]);

  const setCreateText = (field: keyof ProductFormState, value: string) => setCreateForm((current) => ({ ...current, [field]: value }));
  const setEditText = (field: keyof ProductFormState, value: string) => setEditForm((current) => ({ ...current, [field]: value }));

  const upsertProduct = (nextProduct: Product) => {
    setProducts((current) => {
      const existingIndex = current.findIndex((item) => Number(item.id) === Number(nextProduct.id));
      if (existingIndex === -1) return [nextProduct, ...current];
      const next = current.slice();
      next[existingIndex] = nextProduct;
      return next;
    });
  };

  const setCreateFile = (file: File | null) => {
    setCreateForm((current) => ({ ...current, foto: file }));
    setCreatePreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  const setEditFile = (file: File | null) => {
    setEditForm((current) => ({ ...current, foto: file }));
    setEditPreviewUrl(file ? URL.createObjectURL(file) : (editForm.foto_url || null));
  };

  const handleCreateSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setFeedback("");
    try {
      const payload = await buildProductMutationPayload(createForm);
      const response = await backendRequest<ProductMutationResponse>("/api/admin/products", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (response?.product) upsertProduct(response.product);
      setShowCreateModal(false);
      setCreateForm(emptyForm());
      setCreatePreviewUrl(null);
      setFeedback("Produto cadastrado com sucesso.");
      toast.success("Produto cadastrado com sucesso.");
      void refreshProducts();
    } catch (error: any) {
      setFeedback(`Erro ao cadastrar produto: ${error.message}`);
      toast.error(error?.message || "Erro ao cadastrar produto");
    } finally {
      setLoading(false);
    }
  };

  const handleEditSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setFeedback("");
    try {
      const payload = await buildProductMutationPayload(editForm);
      const response = await backendRequest<ProductMutationResponse>(`/api/admin/products/${editForm.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      if (response?.product) upsertProduct(response.product);
      clearPersistedEditState(editProduct?.id ?? editForm.id ?? null);
      setEditProduct(null);
      setEditPreviewUrl(null);
      setEditForm(emptyForm());
      setFeedback("Produto atualizado com sucesso.");
      toast.success("Produto atualizado com sucesso.");
      void refreshProducts();
    } catch (error: any) {
      setFeedback(`Erro ao atualizar produto: ${error.message}`);
      toast.error(error?.message || "Erro ao atualizar produto");
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (product: Product, draft?: Partial<ProductFormState> | null) => {
    setEditProduct(product);
    setEditForm(createEditFormFromProduct(product, draft));
    setEditPreviewUrl(product.foto_url || null);
    localStorage.setItem(EDIT_PRODUCT_ID_STORAGE_KEY, String(product.id));
    setEditSearchParam(product.id);
  };

  useEffect(() => {
    if (!editProduct?.id) return;
    localStorage.setItem(EDIT_PRODUCT_ID_STORAGE_KEY, String(editProduct.id));
    localStorage.setItem(editDraftStorageKey(editProduct.id), JSON.stringify({
      nome: editForm.nome,
      nome_en: editForm.nome_en,
      descricao: editForm.descricao,
      descricao_en: editForm.descricao_en,
      categoria: editForm.categoria,
      categoria_en: editForm.categoria_en,
      preco: editForm.preco,
      unidade: editForm.unidade,
    }));
  }, [editForm, editProduct]);

  useEffect(() => {
    if (fetching || products.length === 0 || editProduct) return;

    const persistedEditId = searchParams.get("edit") || localStorage.getItem(EDIT_PRODUCT_ID_STORAGE_KEY);
    if (!persistedEditId) return;

    const productId = Number(persistedEditId);
    const product = products.find((item) => Number(item.id) === productId);

    if (!product) {
      clearPersistedEditState(productId);
      return;
    }

    let draft: Partial<ProductFormState> | null = null;
    const rawDraft = localStorage.getItem(editDraftStorageKey(productId));
    if (rawDraft) {
      try {
        draft = JSON.parse(rawDraft) as Partial<ProductFormState>;
      } catch {
        localStorage.removeItem(editDraftStorageKey(productId));
      }
    }

    openEditModal(product, draft);
  }, [editProduct, fetching, products, searchParams]);

  const totalCategories = new Set(products.map((product) => String(product.categoria || "").trim()).filter(Boolean)).size;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300/80">Catalogo admin</p>
          <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">Produtos</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Melhorei a area de novo produto e editar para ficar larga, clara e usavel no celular e no desktop.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="border-white/15 bg-transparent text-white hover:bg-white/5" onClick={() => void refreshProducts()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
          <Button className="bg-amber-400 text-black hover:bg-amber-300" onClick={() => setShowCreateModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo produto
          </Button>
        </div>
      </div>

      {feedback ? <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-50">{feedback}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Produtos", value: products.length, icon: Boxes },
          { label: "Categorias", value: totalCategories, icon: Tag },
          { label: "Duplicados", value: duplicateIds.size, icon: AlertTriangle },
          { label: "Incompletos", value: incompleteProducts.length, icon: AlertTriangle },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="border-white/10 bg-zinc-950/60">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">{item.label}</p>
                  <p className="mt-3 text-3xl font-black text-white">{item.value}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-amber-300">
                  <Icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-white/10 bg-zinc-950/60">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl text-white">Filtros</CardTitle>
          <CardDescription>Busque rapido antes de editar.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 lg:grid-cols-[1.2fr_repeat(2,minmax(0,1fr))_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input value={filterNome} onChange={(e) => setFilterNome(e.target.value)} placeholder="Buscar por nome" className={cn(inputClass, "pl-10")} />
            </div>
            <Input value={filterCategoria} onChange={(e) => setFilterCategoria(e.target.value)} placeholder="Categoria" className={inputClass} />
            <Input value={filterUnidade} onChange={(e) => setFilterUnidade(e.target.value)} placeholder="Unidade" className={inputClass} />
            <Button variant="outline" className="border-white/15 bg-transparent text-white hover:bg-white/5" onClick={() => { setFilterNome(""); setFilterCategoria(""); setFilterUnidade(""); }}>
              Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      {(duplicateGroups.length > 0 || incompleteProducts.length > 0) ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="border-amber-500/30 bg-amber-500/10">
            <CardHeader><CardTitle className="text-lg text-amber-100">Duplicidade</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm text-amber-50">
              {duplicateGroups.slice(0, 6).map((group, index) => <div key={index}>{group[0]?.nome}: IDs {group.map((item) => item.id).join(", ")}</div>)}
            </CardContent>
          </Card>
          <Card className="border-red-500/30 bg-red-500/10">
            <CardHeader><CardTitle className="text-lg text-red-100">Cadastro incompleto</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm text-red-50">
              {incompleteProducts.slice(0, 6).map(({ product, issues }) => <div key={product.id}>{product.nome || `ID ${product.id}`}: {issues.join(", ")}</div>)}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {fetching ? (
        <Card className="border-white/10 bg-zinc-950/60 p-8 text-center text-zinc-400">Carregando produtos...</Card>
      ) : filteredProducts.length === 0 ? (
        <Card className="border-white/10 bg-zinc-950/60 p-8 text-center text-zinc-400">Nenhum produto encontrado.</Card>
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {filteredProducts.map((product) => {
              const issues = getMissingProductIssues(product);
              const isDuplicate = duplicateIds.has(Number(product.id));
              return (
                <Card key={`mobile-${product.id}`} className="border-white/10 bg-zinc-950/60">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="h-20 w-20 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                        {product.foto_url ? <img src={product.foto_url} alt={product.nome} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-zinc-500">Sem foto</div>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold text-white">{product.nome}</p>
                            <p className="text-sm text-zinc-400">{product.categoria || "Sem categoria"}</p>
                          </div>
                          <Button size="sm" className="bg-amber-400 text-black hover:bg-amber-300" onClick={() => openEditModal(product)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full border border-white/10 px-2.5 py-1 text-zinc-200">{money(product.preco)}</span>
                          <span className="rounded-full border border-white/10 px-2.5 py-1 text-zinc-200">{product.unidade || "-"}</span>
                          {isDuplicate ? <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-amber-200">Duplicado</span> : null}
                          {issues.map((issue) => <span key={`${product.id}-${issue}`} className="rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-red-200">{issue}</span>)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="hidden overflow-hidden border-white/10 bg-zinc-950/60 md:block">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-white/5 text-left text-xs uppercase tracking-[0.24em] text-zinc-500">
                  <tr>
                    <th className="px-4 py-4">Foto</th>
                    <th className="px-4 py-4">Nome</th>
                    <th className="px-4 py-4">Categoria</th>
                    <th className="px-4 py-4">Descricao</th>
                    <th className="px-4 py-4">Preco</th>
                    <th className="px-4 py-4">Unidade</th>
                    <th className="px-4 py-4">Status</th>
                    <th className="px-4 py-4 text-right">Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => {
                    const issues = getMissingProductIssues(product);
                    const isDuplicate = duplicateIds.has(Number(product.id));
                    return (
                      <tr key={product.id} className="border-t border-white/8 align-top">
                        <td className="px-4 py-4">{product.foto_url ? <img src={product.foto_url} alt={product.nome} className="h-14 w-14 rounded-2xl object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 text-[11px] text-zinc-500">Sem foto</div>}</td>
                        <td className="px-4 py-4"><div className="font-semibold text-white">{product.nome}</div><div className="text-xs text-zinc-500">{product.nome_en || "-"}</div></td>
                        <td className="px-4 py-4"><div className="text-white">{product.categoria || "-"}</div><div className="text-xs text-zinc-500">{product.categoria_en || "-"}</div></td>
                        <td className="max-w-[280px] px-4 py-4 text-zinc-300"><div className="line-clamp-3">{product.descricao || product.descricao_en || "-"}</div></td>
                        <td className="px-4 py-4 font-semibold text-amber-300">{money(product.preco)}</td>
                        <td className="px-4 py-4 text-zinc-300">{product.unidade || "-"}</td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            {isDuplicate ? <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200">Duplicado</span> : null}
                            {issues.map((issue) => <span key={`${product.id}-${issue}`} className="rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-[11px] text-red-200">{issue}</span>)}
                            {!isDuplicate && issues.length === 0 ? <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-200">OK</span> : null}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <Button size="sm" className="bg-amber-400 text-black hover:bg-amber-300" onClick={() => openEditModal(product)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <ProductModal
        open={showCreateModal}
        title="Cadastrar novo produto"
        subtitle="Formulario mais largo e organizado para cadastro rapido."
        form={createForm}
        previewUrl={createPreviewUrl}
        loading={loading}
        submitLabel="Cadastrar produto"
        onClose={() => {
          setShowCreateModal(false);
          setCreateForm(emptyForm());
          setCreatePreviewUrl(null);
        }}
        onText={setCreateText}
        onFile={setCreateFile}
        onSubmit={handleCreateSubmit}
      />

      <ProductModal
        open={Boolean(editProduct)}
        title="Editar produto"
        subtitle="Edite textos, categoria, unidade, preco e imagem sem aperto."
        form={editForm}
        previewUrl={editPreviewUrl}
        loading={loading}
        submitLabel="Salvar alteracoes"
        onClose={() => {
          clearPersistedEditState(editProduct?.id ?? editForm.id ?? null);
          setEditProduct(null);
          setEditForm(emptyForm());
          setEditPreviewUrl(null);
        }}
        onText={setEditText}
        onFile={setEditFile}
        onSubmit={handleEditSubmit}
      />
    </div>
  );
};

export default ProductsAdminPage;
