import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

const ProductsAdminPage: React.FC = () => {
    // ...existing code...
  const [form, setForm] = useState({
    nome: "",
    descricao: "",
    preco: "",
    categoria: "",
    foto: null as File | null,
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [products, setProducts] = useState<any[]>([]);
  const [fetching, setFetching] = useState(false);
  const [filterNome, setFilterNome] = useState("");
  const [filterCategoria, setFilterCategoria] = useState("");
  const [filterUnidade, setFilterUnidade] = useState("");
    // Filtragem dos produtos
    const filteredProducts = products.filter((prod) => {
      const nomeMatch = filterNome === "" || prod.nome.toLowerCase().includes(filterNome.toLowerCase());
      const categoriaMatch = filterCategoria === "" || prod.categoria?.toLowerCase().includes(filterCategoria.toLowerCase());
      const unidadeMatch = filterUnidade === "" || prod.unidade?.toLowerCase().includes(filterUnidade.toLowerCase());
      return nomeMatch && categoriaMatch && unidadeMatch;
    });
  // Buscar produtos cadastrados
  useEffect(() => {
    const fetchProducts = async () => {
      setFetching(true);
      const { data, error } = await supabase
        .from("products")
        .select("id, nome, descricao, categoria, preco, unidade, foto_url");
      if (!error && data) setProducts(data);
      setFetching(false);
    };
    fetchProducts();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === "file") {
      const file = (e.target as HTMLInputElement).files?.[0] || null;
      setForm({ ...form, foto: file });
      if (file) {
        setPreviewUrl(URL.createObjectURL(file));
      } else {
        setPreviewUrl(null);
      }
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      let fotoUrl = null;
      if (form.foto) {
        // Upload da imagem para o bucket 'produtos'
        const fileExt = form.foto.name.split('.').pop();
        // Nome seguro: apenas letras, números e hífen
        const safeNome = form.nome.replace(/[^a-zA-Z0-9\-]/g, '').toLowerCase();
        const fileName = `${Date.now()}-${safeNome}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('produtos')
          .upload(fileName, form.foto, { contentType: form.foto.type });
        if (uploadError) {
          setMessage(`Erro ao fazer upload da imagem: ${uploadError.message}`);
          setLoading(false);
          return;
        }
        // Obter URL pública
        const { data: publicUrlData, error: urlError } = supabase.storage
          .from('produtos')
          .getPublicUrl(fileName);
        if (urlError) {
          setMessage(`Erro ao gerar URL pública: ${urlError.message}`);
          setLoading(false);
          return;
        }
        fotoUrl = publicUrlData?.publicUrl || null;
        // Testar URL manualmente
        if (!fotoUrl) {
          setMessage('URL da imagem não gerada. Verifique o bucket.');
          setLoading(false);
          return;
        }
      }
      // Salvar dados do produto com foto_url
      const { error: insertError } = await supabase
        .from("products")
        .insert([
          {
            nome: form.nome,
            descricao: form.descricao,
            preco: parseFloat(form.preco),
            categoria: form.categoria,
            foto_url: fotoUrl,
            // estoque removido
          },
        ]);
      if (insertError) {
        setMessage(`Erro ao cadastrar produto: ${insertError.message}`);
        setLoading(false);
        return;
      }
      setMessage("Produto cadastrado com sucesso!");
      setForm({ nome: "", descricao: "", preco: "", categoria: "", foto: null });
      setPreviewUrl(null);
      setShowForm(false);
      // Atualizar lista de produtos
      const { data } = await supabase
        .from("products")
        .select("id, nome, descricao, categoria, preco, unidade, foto_url");
      if (data) setProducts(data);
    } catch (err: any) {
      setMessage("Erro inesperado: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // O return JSX deve estar apenas no final do componente
      // O return JSX deve estar apenas no final do componente
      return (
        <div className="p-4">
          <h2 className="text-xl md:text-2xl font-bold mb-4 text-gold">Administração de Produtos</h2>

          {/* Botão único para abrir o formulário */}
          <button
            className="bg-gold text-black font-bold py-3 px-6 rounded-lg shadow-lg mb-6 hover:bg-gold-dark transition text-lg"
            onClick={() => setShowForm(true)}
          >
            CADASTRAR PRODUTO
          </button>

          {/* Modal do formulário inspirado no layout da imagem (sem imagem) */}
          {showForm && (
            <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-60 z-50">
              <div
                className="bg-[#181818] border border-gold rounded-2xl shadow-2xl p-4 sm:p-8 relative w-full max-w-[500px] flex flex-col gap-6"
                style={{ boxShadow: '0 0 30px #FFD700' }}
              >
                <button
                  className="absolute top-4 right-4 text-gold text-xl font-bold bg-transparent border-none cursor-pointer"
                  onClick={() => setShowForm(false)}
                >×</button>
                <div className="flex flex-col items-center gap-2 mb-4">
                  <span className="font-bold text-gold text-lg">Imperial Tec Solution</span>
                </div>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4" encType="multipart/form-data">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex flex-col gap-2 flex-1">
                      <label className="text-gold font-semibold text-sm">Nome do Produto</label>
                      <input name="nome" type="text" value={form.nome} onChange={handleChange} required className="bg-[#222] border border-gold rounded px-3 py-2 text-white w-full" />
                      <label className="text-gold font-semibold text-sm">Categoria</label>
                      <input name="categoria" type="text" value={form.categoria} onChange={handleChange} required className="bg-[#222] border border-gold rounded px-3 py-2 text-white w-full" />
                      <label className="text-gold font-semibold text-sm">Descrição</label>
                      <textarea name="descricao" value={form.descricao} onChange={handleChange} required className="bg-[#222] border border-gold rounded px-3 py-2 text-white w-full" />
                    </div>
                    <div className="flex flex-col gap-2 flex-1">
                      <label className="text-gold font-semibold text-sm">Imagem do Produto</label>
                      <input name="foto" type="file" accept="image/*" onChange={handleChange} className="bg-[#222] border border-gold rounded px-3 py-2 text-white w-full" />
                      {previewUrl && (
                        <div className="mt-2 flex justify-center">
                          <img src={previewUrl} alt="Preview" className="h-24 w-24 object-cover rounded border border-gold" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 flex-1">
                      <label className="text-gold font-semibold text-sm">Unidade de Medida</label>
                      <div className="flex gap-2 mb-2">
                        <button type="button" className="bg-gold text-black rounded px-3 py-1 font-bold">LB</button>
                        <button type="button" className="bg-[#222] text-gold border border-gold rounded px-3 py-1 font-bold">KG</button>
                      </div>
                      <label className="text-gold font-semibold text-sm">Preço de Venda</label>
                      <input name="preco" type="number" step="0.01" value={form.preco} onChange={handleChange} required className="bg-[#222] border border-gold rounded px-3 py-2 text-white w-full" />
                      <label className="text-gold font-semibold text-sm">Custo</label>
                      <input name="custo" type="number" step="0.01" className="bg-[#222] border border-gold rounded px-3 py-2 text-white w-full" />
                      {/* Campo estoque removido */}
                    </div>
                  </div>
                  <div className="flex gap-4 mt-4">
                    <button type="submit" disabled={loading} className="bg-gold text-black font-bold py-2 px-4 rounded hover:bg-gold-dark transition flex-1 text-lg w-full sm:w-auto">{loading ? "Salvando..." : "CADASTRAR PRODUTO"}</button>
                    <button type="button" className="bg-[#222] border border-gold text-gold font-bold py-2 px-4 rounded flex-1 text-lg w-full sm:w-auto" onClick={() => setShowForm(false)}>Cancelar</button>
                  </div>
                  {message && <div className="text-sm text-red-500 mt-2">{message}</div>}
                </form>
              </div>
            </div>
          )}

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Filtrar por nome"
              value={filterNome}
              onChange={e => setFilterNome(e.target.value)}
              className="border border-sidebar-border rounded px-3 py-2 bg-sidebar-foreground text-sidebar-primary placeholder-gold-dark focus:ring-gold focus:border-gold"
            />
            <input
              type="text"
              placeholder="Filtrar por categoria"
              value={filterCategoria}
              onChange={e => setFilterCategoria(e.target.value)}
              className="border border-sidebar-border rounded px-3 py-2 bg-sidebar-foreground text-sidebar-primary placeholder-gold-dark focus:ring-gold focus-border-gold"
            />
            <input
              type="text"
              placeholder="Filtrar por unidade"
              value={filterUnidade}
              onChange={e => setFilterUnidade(e.target.value)}
              className="border border-sidebar-border rounded px-3 py-2 bg-sidebar-foreground text-sidebar-primary placeholder-gold-dark focus:ring-gold focus-border-gold"
            />
          </div>
          {fetching ? (
            <div>Carregando produtos...</div>
          ) : (
            <div className="w-full overflow-x-auto">
              <div className="rounded-xl border border-gold-dark bg-black shadow-lg p-1 min-w-[320px]">
                <table className="min-w-full text-xs md:text-sm text-left text-white">
                  <thead>
                    <tr>
                      <th className="px-1 py-1 text-gold text-xs md:text-lg">Foto</th>
                      <th className="px-1 py-1 text-gold text-xs md:text-lg">Nome</th>
                      <th className="px-1 py-1 text-gold text-xs md:text-lg">Descrição</th>
                      <th className="px-1 py-1 text-gold text-xs md:text-lg">Categoria</th>
                      <th className="px-1 py-1 text-gold text-xs md:text-lg">Preço</th>
                      <th className="px-1 py-1 text-gold text-xs md:text-lg">Unidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-1 py-4 text-center text-muted">Nenhum produto encontrado.</td>
                      </tr>
                    ) : (
                      filteredProducts.map((prod) => (
                        <tr key={prod.id} className="border-b border-gold-dark last:border-none hover:bg-gold-light/10 transition">
                          <td className="px-1 py-1 text-center">
                            {prod.foto_url ? (
                              <img src={prod.foto_url} alt={prod.nome} className="h-6 w-6 md:h-12 md:w-12 object-cover rounded border border-gold-dark mx-auto" />
                            ) : (
                              <span className="text-muted">-</span>
                            )}
                          </td>
                          <td className="px-1 py-1 font-bold text-white text-xs md:text-base">{prod.nome}</td>
                          <td className="px-1 py-1 text-white/80">{prod.descricao || '-'}</td>
                          <td className="px-1 py-1 text-white/80">{prod.categoria || '-'}</td>
                          <td className="px-1 py-1 text-gold-dark">R$ {prod.preco}</td>
                          <td className="px-1 py-1 text-white/80">{prod.unidade || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      );
};

export default ProductsAdminPage;
