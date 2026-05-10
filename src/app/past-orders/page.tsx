import { PastOrdersView } from "@/components/past-orders/past-orders-view";
import { listPastOrders, listPeople } from "@/lib/past-orders";

export const dynamic = "force-dynamic";

export default async function PastOrdersPage() {
  const [orders, people] = await Promise.all([listPastOrders(), listPeople()]);
  return <PastOrdersView initialOrders={orders} initialPeople={people} />;
}
