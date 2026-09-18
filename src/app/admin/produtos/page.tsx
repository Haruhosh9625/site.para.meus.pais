"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api-client";
import { useToast } from "@/components/providers";
import { formatCents, parseMoneyToCents } from "@/lib/money";
import { Badge, Button, EmptyState, ErrorState, Field, Input, Select, Skeleton, Textarea } from "@/components/ui";
import { cx } from "@/lib/cx";

type Category = { id: string; name: string };
type Product = {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string | null;
  available: boolean;
  active: boolean;
  position: number;
  category: Category;
  _count: { items: number };
};

type FormState = {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  imageUrl: string;
  available: boolean;
  active: boolean;
  position: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  price: "",
  categoryId: "",
  imageUrl: "",
  available: true,
  active: true,
  position: "0",
};

/**
 * Gestão do cardápio.
 *
 * Produto já vendido nunca é apagado de verdade: o backend converte a
 * exclusão em desativação para preservar o histórico dos pedidos. A tela
 * avisa isso antes de a pessoa clicar.
 */
export default function AdminProductsPage() {
  const { push } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ products: Product[]; categories: Category[] }>("/api/admin/products");
      setProducts(data.products);
      setCategories(data.categories);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startCreate() {
    setCreating(true);
    setEditing(null);
    setFormError(null);
    setForm({ ...EMPTY_FORM, categoryId: categories[0]?.id ?? "" });
  }

  function startEdit(product: Product) {
    setEditing(product);
    setCreating(false);
    setFormError(null);
    setForm({
      name: product.name,
      description: product.description,
      price: (product.priceCents / 100).toFixed(2).replace(".", ","),
      categoryId: product.category.id,
      imageUrl: product.imageUrl ?? "",
      available: product.available,
      active: product.active,
      position: String(product.position),
    });
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const priceCents = parseMoneyToCents(form.price);
    if (priceCents === null || priceCents < 0) {
      setFormError("Informe um preço válido, por exemplo 8,00.");
      return;
    }

    setSaving(true);
    try {
      const body = {
        name: form.name,
        description: form.description,
        priceCents,
        categoryId: form.categoryId,
        imageUrl: form.imageUrl,
        available: form.available,
        active: form.active,
        position: Number(form.position) || 0,
      };

      if (editing) {
        await api(`/api/admin/products/${editing.id}`, { method: "PATCH", body });
        push("Produto atualizado.", "success");
      } else {
        await api("/api/admin/products", { method: "POST", body });
        push("Produto criado.", "success");
      }
      closeForm();
      await load();
    } catch (caught) {
      setFormError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function toggleAvailability(product: Product) {
    try {
      await api(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        body: { available: !product.available },
      });
      await load();
      push(
        product.available
          ? `"${product.name}" marcado como indisponível.`
          : `"${product.name}" está disponível novamente.`,
        "success",
      );
    } catch (caught) {
      push(errorMessage(caught), "error");
    }
  }

  async function remove(product: Product) {
    try {
      const result = await api<{ deleted: boolean; message?: string }>(
        `/api/admin/products/${product.id}`,
        { method: "DELETE" },
      );
      push(result.message ?? "Produto excluído.", result.deleted ? "success" : "info");
      setConfirmDelete(null);
      await load();
    } catch (caught) {
      push(errorMessage(caught), "error");
    }
  }

  async function uploadImage(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await api<{ url: string }>("/api/admin/uploads", { method: "POST", formData });
      setForm((prev) => ({ ...prev, imageUrl: result.url }));
      push("Imagem enviada.", "success");
    } catch (caught) {
      push(errorMessage(caught), "error");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="display text-[clamp(1.9rem,4vw,2.5rem)]">Cardápio</h1>
          <p className="muted text-sm">
            {products.filter((p) => p.active).length} produtos ativos ·{" "}
            {products.filter((p) => p.active && !p.available).length} indisponíveis
          </p>
        </div>
        <Button onClick={startCreate}>+ Novo produto</Button>
      </header>

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {/* -------------------------------- formulário ------------------------ */}
      {(creating || editing) && (
        <form onSubmit={save} className="panel space-y-4 p-5" noValidate>
          <h2 className="font-bold">{editing ? `Editar: ${editing.name}` : "Novo produto"}</h2>
          {formError && <ErrorState message={formError} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" required>
              {({ id }) => (
                <Input id={id} required value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              )}
            </Field>

            <Field label="Preço" required hint="Em reais. Ex.: 8,00">
              {({ id }) => (
                <Input id={id} required inputMode="decimal" value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="8,00" />
              )}
            </Field>
          </div>

          <Field label="Descrição">
            {({ id }) => (
              <Textarea id={id} value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={600} />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Categoria" required>
              {({ id }) => (
                <Select id={id} required value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">Selecione...</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Ordem de exibição" hint="Menor aparece primeiro.">
              {({ id }) => (
                <Input id={id} type="number" min={0} value={form.position}
                  onChange={(e) => setForm({ ...form, position: e.target.value })} />
              )}
            </Field>
          </div>

          <Field label="Foto do produto" hint="Envie um arquivo ou informe a URL da imagem.">
            {({ id }) => (
              <div className="space-y-2">
                <Input id={id} value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                  placeholder="/produtos/espeto-carne.svg ou https://..." />
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif,image/svg+xml"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadImage(file);
                    }}
                    className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--surface-sunken)] file:px-3 file:py-2 file:text-sm file:font-semibold"
                  />
                  {uploading && <span className="muted text-xs">Enviando...</span>}
                </div>
                {form.imageUrl && (
                  <div className="relative size-24 overflow-hidden rounded-xl border bg-[var(--surface-sunken)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.imageUrl} alt="Pré-visualização" className="size-full object-cover" />
                  </div>
                )}
              </div>
            )}
          </Field>

          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={form.available}
                onChange={(e) => setForm({ ...form, available: e.target.checked })}
                className="size-5 accent-[var(--brand-ink)]" />
              Disponível para venda
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="size-5 accent-[var(--brand-ink)]" />
              Aparece no cardápio
            </label>
          </div>

          <div className="flex gap-2">
            <Button type="submit" loading={saving}>Salvar</Button>
            <Button type="button" variant="ghost" onClick={closeForm}>Cancelar</Button>
          </div>
        </form>
      )}

      {/* --------------------------------- lista ---------------------------- */}
      {products.length === 0 ? (
        <EmptyState
          icon="🍢"
          title="Nenhum produto cadastrado"
          description="Rode o seed ou crie o primeiro produto do cardápio."
          action={<Button onClick={startCreate}>Criar produto</Button>}
        />
      ) : (
        <ul className="space-y-2">
          {products.map((product) => (
            <li
              key={product.id}
              className={cx("panel flex flex-wrap items-center gap-4 p-4", !product.active && "opacity-55")}
            >
              <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-sunken)]">
                {product.imageUrl ? (
                  <Image src={product.imageUrl} alt="" fill sizes="64px" className="object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-2xl" aria-hidden="true">🍢</div>
                )}
              </div>

              <div className="min-w-40 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {product.name}
                  {!product.active && <Badge tone="neutral">Fora do cardápio</Badge>}
                  {product.active && !product.available && <Badge tone="danger">Indisponível</Badge>}
                  {product.active && product.available && <Badge tone="success">Disponível</Badge>}
                </p>
                <p className="muted line-clamp-1 text-sm">{product.description || "Sem descrição"}</p>
                <p className="muted text-xs">
                  {product.category.name} · {product._count.items}{" "}
                  {product._count.items === 1 ? "venda" : "vendas"}
                </p>
              </div>

              <p className="text-lg font-bold tabular-nums">{formatCents(product.priceCents)}</p>

              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <Button size="sm" variant="outline" onClick={() => startEdit(product)}>
                  Editar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void toggleAvailability(product)}>
                  {product.available ? "Marcar esgotado" : "Marcar disponível"}
                </Button>
                {confirmDelete === product.id ? (
                  <>
                    <Button size="sm" variant="danger" onClick={() => void remove(product)}>
                      {product._count.items > 0 ? "Desativar" : "Excluir"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(product.id)}>
                    {product._count.items > 0 ? "Remover do cardápio" : "Excluir"}
                  </Button>
                )}
              </div>

              {confirmDelete === product.id && product._count.items > 0 && (
                <p className="muted w-full text-xs">
                  Este produto já aparece em {product._count.items}{" "}
                  {product._count.items === 1 ? "pedido" : "pedidos"}, então ele será{" "}
                  <strong>desativado</strong> em vez de excluído — assim o histórico e os
                  relatórios continuam corretos.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
