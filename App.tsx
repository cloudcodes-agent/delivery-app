
import React, { useState, useEffect, useCallback } from 'react';
import { UserRole, Order, OrderStatus, Bid, User, Message, Review } from './types';
import StorePortal from './components/StorePortal';
import DeliveryPortal from './components/DeliveryPortal';
import Navbar from './components/Navbar';
import ChatModal from './components/ChatModal';
import AuthPortal from './components/AuthPortal';
// import { supabase } from './supabaseClient';
import { Orders as OrdersAPI, Bids as BidsAPI, Wallets as WalletsAPI, Messages as MessagesAPI, Reviews as ReviewsAPI } from './src/api';
import { getSocket } from './src/realtime';
import { translations } from './translations';
// import { translations } from './lib/translations';

// Helper to map DB order to UI Order type
const mapOrder = (dbOrder: any): Order => ({
  id: dbOrder.id,
  storeId: dbOrder.storeId,
  storeName: dbOrder.storeName,
  productName: dbOrder.productName,
  productPrice: Number(dbOrder.productPrice),
  deliveryFeeOffer: Number(dbOrder.suggestedDeliveryFee),
  deliveryAddress: dbOrder.destination,
  clientName: dbOrder.clientName || '',
  clientPhone: dbOrder.clientPhone || '',
  status: dbOrder.status as OrderStatus,
  bids: (dbOrder.bids || []).map((b: any) => ({
    id: b.id,
    deliveryGuyId: b.deliveryGuyId,
    deliveryGuyName: b.deliveryGuyName,
    amount: Number(b.proposedFee),
    timestamp: new Date(b.timestamp).getTime()
  })),
  messages: [], // Messages table not provided, keeping empty
  selectedBidId: dbOrder.chosenBidId,
  deliveryGuyId: dbOrder.deliveryGuyId,
  storeEscrowPaid: dbOrder.storeDeposited,
  deliveryEscrowPaid: dbOrder.riderDeposited,
  createdAt: new Date(dbOrder.created_at).getTime(),
  storeReviewed: false,
  riderReviewed: false
});

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeChatOrderId, setActiveChatOrderId] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  const [isLoading, setIsLoading] = useState(true);
  const [lang, setLang] = useState<'en' | 'ar'>('en');

  const toggleTheme = () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    if (newTheme) {
      document.documentElement.classList.add('dark');
      localStorage.theme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.theme = 'light';
    }
  };

  const toggleLanguage = () => {
    const newLang = lang === 'en' ? 'ar' : 'en';
    setLang(newLang);
    document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = newLang;
  };

  // Define data fetching logic outside useEffect so it can be called manually
  const fetchAndSetData = useCallback(async () => {
      const [ordersData, reviewsData, messagesData] = await Promise.all([
        OrdersAPI.list(),
        ReviewsAPI.list(),
        MessagesAPI.list(),
      ]);

      // Build Users map for ratings (calculating stars based on fetched reviews)
      const userMap = new Map<string, User>();
      const ensureUser = (id: string) => {
        if (!userMap.has(id)) {
          userMap.set(id, {
            id, email: '', name: '', role: UserRole.DELIVERY, reviews: [],
            wallet: { balance: 0, escrowHeld: 0, transactions: [] }
          });
        }
      };

      reviewsData?.forEach((r: any) => {
        ensureUser(r.targetUserId);
        userMap.get(r.targetUserId)!.reviews.push({
          id: r.id, reviewerId: r.reviewerId, reviewerName: r.reviewerName,
          rating: r.rating, comment: r.comment, timestamp: new Date(r.timestamp).getTime()
        });
      });
      setUsers(Array.from(userMap.values()));

      if (ordersData) {
        const mappedOrders = ordersData.map(dbOrder => {
          const baseOrder = mapOrder(dbOrder);
          // Attach real-time messages
          baseOrder.messages = messagesData?.filter((m: any) => m.orderId === dbOrder.id).map((m: any) => ({
            id: m.id, senderId: m.senderId, text: m.text, timestamp: new Date(m.timestamp).getTime()
          })) || [];
          baseOrder.storeReviewed = (reviewsData || []).some((r: any) => r.orderId === dbOrder.id && r.reviewerId === dbOrder.storeId);
          baseOrder.riderReviewed = (reviewsData || []).some((r: any) => r.orderId === dbOrder.id && r.reviewerId === dbOrder.deliveryGuyId);
          return baseOrder;
        });

        // Self-healing: Fix any orders that are stuck in AWAITING_ESCROW but have both deposits
        mappedOrders.forEach(async (o) => {
          if (o.status === OrderStatus.AWAITING_ESCROW && o.storeEscrowPaid && o.deliveryEscrowPaid) {
            await OrdersAPI.setStatus(o.id, OrderStatus.READY_FOR_PICKUP);
          }
        });

        setOrders(mappedOrders);
      }
  }, []);

  // Initialize Supabase Auth Listener
  useEffect(() => {
    // No Supabase auth; assume user logs in via AuthPortal and we set currentUser there
    setIsLoading(false);
  }, [fetchAndSetData]);

  // Fetch Orders and Subscribe to changes
  useEffect(() => {
    fetchAndSetData();

    const id = setInterval(fetchAndSetData, 15000);
    const socket = getSocket(import.meta.env.VITE_API_BASE || 'http://localhost:3000');
    const refetch = () => fetchAndSetData();
    socket.on('orders.created', refetch);
    socket.on('orders.updated', refetch);
    socket.on('bids.created', refetch);
    socket.on('bids.updated', refetch);
    socket.on('wallets.updated', refetch);
    socket.on('messages.created', refetch);
    socket.on('reviews.created', refetch);
    return () => { clearInterval(id); socket.close(); };
  }, [fetchAndSetData]);

  // Sync Wallet from DB
  useEffect(() => {
    if (!currentUser?.id) return;

    const fetchWallet = async () => {
      let walletData = await WalletsAPI.get(currentUser.id);
      const transactionsData: any[] = []; // Not implemented in backend yet

      if (walletData) {
        setCurrentUser(prev => prev ? ({
          ...prev,
          wallet: {
            balance: Number(walletData.balance),
            escrowHeld: Number(walletData.escrow),
            transactions: transactionsData ? transactionsData.map((t: any) => ({
              id: t.id,
              amount: Number(t.amount),
              type: t.type as 'IN' | 'OUT',
              description: t.description,
              timestamp: new Date(t.timestamp).getTime()
            })) : []
          }
        }) : null);
      }
    };

    fetchWallet();

    const id = setInterval(fetchWallet, 15000);
    return () => { clearInterval(id); };
  }, [currentUser?.id]);

  const createOrder = async (productName: string, productPrice: number, deliveryFee: number, deliveryAddress: string, clientName: string, clientPhone: string) => {
    if (!currentUser) return;
    await OrdersAPI.create({
      storeId: currentUser.id,
      storeName: currentUser.name,
      productName,
      productPrice,
      suggestedDeliveryFee: deliveryFee,
      destination: deliveryAddress,
      clientName,
      clientPhone,
      status: OrderStatus.BIDDING,
    });
    fetchAndSetData();
  };

  const placeBid = async (orderId: string, amount: number) => {
    if (!currentUser) return;
    
    // Check if bid exists in current state
    const existingBid = orders.find(o => o.id === orderId)?.bids.find(b => b.deliveryGuyId === currentUser.id);

    if (existingBid) {
      await BidsAPI.update(existingBid.id, {
        amount,
      });
    } else {
      await BidsAPI.create({
        orderId,
        userId: currentUser.id,
        amount,
      });
    }
    fetchAndSetData();
  };

  const selectBidder = async (orderId: string, bidId: string) => {
    const order = orders.find(o => o.id === orderId); // Note: this gets stale state, but ID lookup is safe
    const bid = order?.bids.find(b => b.id === bidId);
    if (!bid) return;

    await OrdersAPI.setStatus(orderId, OrderStatus.AWAITING_ESCROW);
    fetchAndSetData();
  };

  const payStoreEscrow = async (orderId: string) => {
    if (!currentUser) return;
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    const selectedBid = order.bids.find(b => b.id === order.selectedBidId);
    const fee = selectedBid ? selectedBid.amount : order.deliveryFeeOffer;

    if (!currentUser.wallet || currentUser.wallet.balance < fee) return alert("Insufficient balance or wallet not loaded.");

    // Update Wallet
    await WalletsAPI.update(currentUser.id, {
      balance: currentUser.wallet.balance - fee,
      escrow: currentUser.wallet.escrowHeld + fee,
    });

    // TODO: transactions API not implemented in backend yet

    const newStatus = order.deliveryEscrowPaid ? OrderStatus.READY_FOR_PICKUP : OrderStatus.AWAITING_ESCROW;
    await OrdersAPI.setStatus(orderId, newStatus);
    
    fetchAndSetData();
  };

  const payDeliveryEscrow = async (orderId: string) => {
    if (!currentUser) return;
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    if (!currentUser.wallet || currentUser.wallet.balance < order.productPrice) return alert("Insufficient balance or wallet not loaded.");

    // Update Wallet
    await WalletsAPI.update(currentUser.id, {
      balance: currentUser.wallet.balance - order.productPrice,
      escrow: currentUser.wallet.escrowHeld + order.productPrice,
    });

    const newStatus = order.storeEscrowPaid ? OrderStatus.READY_FOR_PICKUP : OrderStatus.AWAITING_ESCROW;
    await OrdersAPI.setStatus(orderId, newStatus);

    fetchAndSetData();
  };

  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    // Guard: prevent double updates if local state already matches
    const currentOrder = orders.find(o => o.id === orderId);
    if (currentOrder?.status === status) return;

    await OrdersAPI.setStatus(orderId, status);
    // TODO: implement payout logic server-side; for now just refresh
    fetchAndSetData();
  };

  const submitReview = async (orderId: string, targetUserId: string, rating: number, comment: string) => {
    if (!currentUser) return;
    
    // Save to Supabase
    await ReviewsAPI.create({
      orderId,
      reviewerId: currentUser.id,
      reviewerName: currentUser.name,
      targetUserId,
      rating,
      comment,
    });
    fetchAndSetData();
  };

  const sendMessage = async (orderId: string, text: string) => {
    if (!currentUser) return;
    await MessagesAPI.create({
      orderId,
      senderId: currentUser.id,
      content: text,
    });
    fetchAndSetData();
  };

  const handleAuth = (user: User) => {
    setCurrentUser(user);
  };

  const handleSignup = (newUser: User) => {
    setUsers(prev => [...prev, newUser]);
  };

  const handleLogout = async () => {
    // No supabase logout yet; clear local state
    // await supabase.auth.signOut();
    setCurrentUser(null);
  };

  const t = translations[lang];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthPortal onAuth={handleAuth} existingUsers={users} onSignup={handleSignup} isDarkMode={isDarkMode} onToggleTheme={toggleTheme} t={t} onToggleLanguage={toggleLanguage} />;
  }

  const activeChatOrder = orders.find(o => o.id === activeChatOrderId);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300 animate-in fade-in duration-500">
      <Navbar 
        role={currentUser.role} 
        onLogout={handleLogout}
        wallet={currentUser.wallet || { balance: 0, escrowHeld: 0, transactions: [] }}
        isDarkMode={isDarkMode}
        onToggleTheme={toggleTheme}
        t={t}
        onToggleLanguage={toggleLanguage}
      />
      
      <main className="flex-grow container mx-auto px-4 py-8">
        {currentUser.role === UserRole.STORE ? (
          <StorePortal 
            orders={orders.filter(o => o.storeId === currentUser.id)} 
            users={users}
            onCreate={createOrder} 
            onSelectBidder={selectBidder}
            onPayEscrow={payStoreEscrow}
            onOpenChat={(id) => setActiveChatOrderId(id)}
            onUpdateStatus={updateOrderStatus}
            onReview={submitReview}
            t={t}
          />
        ) : (
          <DeliveryPortal 
            currentUser={currentUser}
            orders={orders} 
            users={users}
            onBid={placeBid} 
            onPayEscrow={payDeliveryEscrow}
            onUpdateStatus={updateOrderStatus}
            onOpenChat={(id) => setActiveChatOrderId(id)}
            onReview={submitReview}
            t={t}
          />
        )}
      </main>

      {activeChatOrder && (
        <ChatModal 
          order={activeChatOrder} 
          currentUserId={currentUser.id}
          onClose={() => setActiveChatOrderId(null)}
          onSend={(text) => sendMessage(activeChatOrder.id, text)}
          t={t}
        />
      )}
      
      <footer className="bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 py-6 mt-12 transition-colors">
        <div className="container mx-auto px-4 text-center text-gray-500 dark:text-slate-400 text-sm">
          &copy; 2024 {t.appName} Delivery. {t.secureDeliveryMarketplace}.
        </div>
      </footer>
    </div>
  );
};

export default App;
