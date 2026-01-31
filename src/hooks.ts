import { useEffect, useState } from 'react';
import { Orders, Bids, Wallets, Messages, Reviews } from './api';

export function useOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  useEffect(() => { Orders.list().then(setOrders); }, []);
  return { orders, refresh: async () => setOrders(await Orders.list()) };
}
