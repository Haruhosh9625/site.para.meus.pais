"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, errorMessage } from "@/lib/api-client";
import { formatCents } from "@/lib/money";
import { formatDate, formatPhone, formatRelative } from "@/lib/format";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "@/components/ui";

type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  active: boolean;
  createdAt: string;
  orderCount: number;
  totalSpentCents: number;
  averageTicketCents: number;
  lastOrderAt: string | null;
};

/**
 * Administração de clientes.
 *
 * A API devolve apenas dados de contato e métricas — nunca a senha nem o
 * hash dela. Não existe, em lugar nenhum do sistema, uma forma de um
 * administrador ver a senha de um cliente.
 */
function CustomersList() {
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ limit: "100" });
      if (search.trim()) query.set("search", search.trim());
      const data = await api<{ customers: Customer[]; total: number }>(
        `/api/admin/customers?${query}`,
      );
      setCustomers(data.customers);
      setTotal(data.total);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timeout = setTimeout(() => void load(), 250);
    return () => clearTimeout(timeout);
  }, [load]);

  const totalRevenue = customers.reduce((sum, customer) => sum + customer.totalSpentCents, 0);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="display text-[clamp(1.9rem,4vw,2.5rem)]">Clientes</h1>
        <p className="muted text-sm">
          {total} {total === 1 ? "cliente cadastrado" : "clientes cadastrados"}
          {customers.length > 0 && ` · ${formatCents(totalRevenue)} em compras (lista atual)`}
        </p>
      </header>

      <div className="panel p-4">
        <label htmlFor="busca-clientes" className="mb-1 block text-xs font-semibold">
          Buscar cliente
        </label>
        <input
          id="busca-clientes"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Nome, e-mail ou telefone"
          className="w-full rounded-xl border bg-[var(--surface)] px-3.5 py-2.5 text-sm"
        />
      </div>

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : customers.length === 0 ? (
        <EmptyState
          icon="👥"
          title={search ? "Nenhum cliente encontrado" : "Nenhum cliente ainda"}
          description={
            search ? "Tente outro termo de busca." : "Os clientes aparecem aqui após o cadastro."
          }
          action={
            search ? (
              <Button variant="outline" onClick={() => setSearch("")}>
                Limpar busca
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Tabela no desktop */}
          <div className="panel hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <caption className="sr-only">Lista de clientes com métricas de compra</caption>
              <thead className="border-b bg-[var(--surface-sunken)] text-left">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Cliente</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Contato</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Cadastro</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Pedidos</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Gasto total</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Ticket médio</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Último pedido</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-[var(--surface-sunken)]">
                    <td className="px-4 py-3">
                      <span className="font-medium">{customer.name}</span>
                      {!customer.active && (
                        <Badge tone="danger" className="ml-2">Desativado</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="block">{customer.email}</span>
                      <span className="muted block text-xs">{formatPhone(customer.phone)}</span>
                    </td>
                    <td className="muted px-4 py-3">{formatDate(customer.createdAt)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {customer.orderCount}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {formatCents(customer.totalSpentCents)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCents(customer.averageTicketCents)}
                    </td>
                    <td className="muted px-4 py-3 text-xs">
                      {customer.lastOrderAt ? formatRelative(customer.lastOrderAt) : "Nunca pediu"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cartões no celular */}
          <ul className="space-y-2 lg:hidden">
            {customers.map((customer) => (
              <li key={customer.id} className="panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{customer.name}</p>
                    <p className="muted truncate text-sm">{customer.email}</p>
                    <p className="muted text-sm">{formatPhone(customer.phone)}</p>
                  </div>
                  {!customer.active && <Badge tone="danger">Desativado</Badge>}
                </div>

                <dl className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-center text-xs">
                  <div>
                    <dt className="muted">Pedidos</dt>
                    <dd className="font-bold tabular-nums">{customer.orderCount}</dd>
                  </div>
                  <div>
                    <dt className="muted">Gasto</dt>
                    <dd className="font-bold tabular-nums">
                      {formatCents(customer.totalSpentCents)}
                    </dd>
                  </div>
                  <div>
                    <dt className="muted">Ticket</dt>
                    <dd className="font-bold tabular-nums">
                      {formatCents(customer.averageTicketCents)}
                    </dd>
                  </div>
                </dl>

                <p className="muted mt-2 text-xs">
                  Cadastro em {formatDate(customer.createdAt)} · Último pedido:{" "}
                  {customer.lastOrderAt ? formatRelative(customer.lastOrderAt) : "nunca"}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function AdminCustomersPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <CustomersList />
    </Suspense>
  );
}
