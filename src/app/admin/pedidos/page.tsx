import type { Metadata } from "next";
import { OrdersClient } from "./orders-client";

export const metadata: Metadata = { title: "Pedidos" };
export const dynamic = "force-dynamic";

export default function AdminOrdersPage() {
  return <OrdersClient />;
}
