
import React, { useState, useEffect } from 'react';
import { UserRole, Order, OrderStatus, Bid, User, Message, Review } from './types';
import StorePortal from './components/StorePortal';
import DeliveryPortal from './components/DeliveryPortal';
import Navbar from './components/Navbar';
import ChatModal from './components/ChatModal';
import AuthPortal from './components/AuthPortal';
import { supabase } from './supabaseClient';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeChatOrderId, setActiveChatOrderId] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));

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

  useEffect(() => {
    if (currentUser) {
      const updatedUser = users.find(u => u.id === currentUser.id);
      if (updatedUser) setCurrentUser(updatedUser);
    }
  }, [users, currentUser?.id]);

  // Initialize Supabase Auth Listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setCurrentUser({
          id: session.user.id,
          email: session.user.email!,
          password: '', // Managed by Supabase
          name: session.user.user_metadata.name || session.user.email?.split('@')[0] || 'User',
          role: (session.user.user_metadata.role as UserRole) || UserRole.DELIVERY,
          wallet: { balance: 0, escrowHeld: 0, transactions: [] },
          reviews: []
        });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setCurrentUser({
          id: session.user.id,
          email: session.user.email!,
          password: '', // Managed by Supabase
          name: session.user.user_metadata.name || session.user.email?.split('@')[0] || 'User',
          role: (session.user.user_metadata.role as UserRole) || UserRole.DELIVERY,
          wallet: { balance: 0, escrowHeld: 0, transactions: [] },
          reviews: []
        });
      } else {
        setCurrentUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const updateWallet = (userId: string, amount: number, type: 'IN' | 'OUT', description: string, escrowChange: number = 0) => {
    setUsers(prev => prev.map(u => {
      if (u.id === userId) {
        return {
          ...u,
          wallet: {
            ...u.wallet,
            balance: u.wallet.balance + (type === 'IN' ? amount : -amount),
            escrowHeld: u.wallet.escrowHeld + escrowChange,
            transactions: [{
              id: Math.random().toString(36).substr(2, 9),
              amount,
              type,
              description,
              timestamp: Date.now()
            }, ...u.wallet.transactions]
          }
        };
      }
      return u;
    }));
  };

  const createOrder = (productName: string, productPrice: number, deliveryFee: number, deliveryAddress: string, clientName: string, clientPhone: string) => {
    if (!currentUser) return;
    const newOrder: Order = {
      id: `ord_${Math.random().toString(36).substr(2, 9)}`,
      storeId: currentUser.id,
      storeName: currentUser.name,
      productName,
      productPrice,
      deliveryFeeOffer: deliveryFee,
      deliveryAddress,
      clientName,
      clientPhone,
      status: OrderStatus.BIDDING,
      bids: [],
      messages: [],
      storeEscrowPaid: false,
      deliveryEscrowPaid: false,
      createdAt: Date.now(),
      storeReviewed: false,
      riderReviewed: false
    };
    setOrders([newOrder, ...orders]);
  };

  const placeBid = (orderId: string, amount: number) => {
    if (!currentUser) return;
    setOrders(prev => prev.map(order => {
      if (order.id === orderId) {
        const newBid: Bid = {
          id: `bid_${Math.random().toString(36).substr(2, 9)}`,
          deliveryGuyId: currentUser.id,
          deliveryGuyName: currentUser.name,
          amount,
          timestamp: Date.now()
        };
        return { ...order, bids: [...order.bids, newBid] };
      }
      return order;
    }));
  };

  const selectBidder = (orderId: string, bidId: string) => {
    setOrders(prev => prev.map(order => {
      if (order.id === orderId) {
        const selectedBid = order.bids.find(b => b.id === bidId);
        return { 
          ...order, 
          selectedBidId: bidId, 
          deliveryGuyId: selectedBid?.deliveryGuyId,
          status: OrderStatus.AWAITING_ESCROW 
        };
      }
      return order;
    }));
  };

  const payStoreEscrow = (orderId: string) => {
    if (!currentUser) return;
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    const selectedBid = order.bids.find(b => b.id === order.selectedBidId);
    const fee = selectedBid ? selectedBid.amount : order.deliveryFeeOffer;

    if (currentUser.wallet.balance >= fee) {
      updateWallet(currentUser.id, fee, 'OUT', `Escrow deposit for ${order.productName}`, fee);
      setOrders(prev => prev.map(o => {
        if (o.id === orderId) {
          const updated = { ...o, storeEscrowPaid: true };
          if (updated.deliveryEscrowPaid) updated.status = OrderStatus.READY_FOR_PICKUP;
          return updated;
        }
        return o;
      }));
    } else {
      alert("Insufficient store balance.");
    }
  };

  const payDeliveryEscrow = (orderId: string) => {
    if (!currentUser) return;
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    if (currentUser.wallet.balance >= order.productPrice) {
      updateWallet(currentUser.id, order.productPrice, 'OUT', `Product collateral for ${order.productName}`, order.productPrice);
      setOrders(prev => prev.map(o => {
        if (o.id === orderId) {
          const updated = { ...o, deliveryEscrowPaid: true };
          if (updated.storeEscrowPaid) updated.status = OrderStatus.READY_FOR_PICKUP;
          return updated;
        }
        return o;
      }));
    } else {
      alert("Insufficient rider balance.");
    }
  };

  const updateOrderStatus = (orderId: string, status: OrderStatus) => {
    setOrders(prev => prev.map(o => (o.id === orderId ? { ...o, status } : o)));
    
    if (status === OrderStatus.COMPLETED) {
      const order = orders.find(o => o.id === orderId);
      if (order) {
        const selectedBid = order.bids.find(b => b.id === order.selectedBidId);
        const fee = selectedBid ? selectedBid.amount : order.deliveryFeeOffer;

        // Store receives the product price that the rider paid into escrow
        updateWallet(order.storeId, order.productPrice, 'IN', `Product payment from rider for ${order.productName}`, -fee);

        // Rider receives their collateral (productPrice) back PLUS the delivery fee
        if (order.deliveryGuyId) {
          const totalRelease = fee + order.productPrice;
          updateWallet(order.deliveryGuyId, totalRelease, 'IN', `Payout & collateral release for ${order.productName}`, -order.productPrice);
        }
      }
    }
  };

  const submitReview = (orderId: string, targetUserId: string, rating: number, comment: string) => {
    if (!currentUser) return;
    
    const newReview: Review = {
      id: Math.random().toString(36).substr(2, 9),
      reviewerId: currentUser.id,
      reviewerName: currentUser.name,
      rating,
      comment,
      timestamp: Date.now()
    };

    setUsers(prev => prev.map(u => {
      if (u.id === targetUserId) {
        return { ...u, reviews: [newReview, ...u.reviews] };
      }
      return u;
    }));

    setOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        if (currentUser.role === UserRole.STORE) return { ...o, storeReviewed: true };
        return { ...o, riderReviewed: true };
      }
      return o;
    }));
  };

  const sendMessage = (orderId: string, text: string) => {
    if (!currentUser) return;
    const newMessage: Message = {
      id: Math.random().toString(36).substr(2, 9),
      senderId: currentUser.id,
      text,
      timestamp: Date.now()
    };
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, messages: [...o.messages, newMessage] } : o));
  };

  const handleAuth = (user: User) => {
    setCurrentUser(user);
  };

  const handleSignup = (newUser: User) => {
    setUsers(prev => [...prev, newUser]);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
  };

  if (!currentUser) {
    return <AuthPortal onAuth={handleAuth} existingUsers={users} onSignup={handleSignup} isDarkMode={isDarkMode} onToggleTheme={toggleTheme} />;
  }

  const activeChatOrder = orders.find(o => o.id === activeChatOrderId);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300 animate-in fade-in duration-500">
      <Navbar 
        role={currentUser.role} 
        onLogout={handleLogout}
        wallet={currentUser.wallet} 
        isDarkMode={isDarkMode}
        onToggleTheme={toggleTheme}
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
          />
        ) : (
          <DeliveryPortal 
            orders={orders} 
            users={users}
            onBid={placeBid} 
            onPayEscrow={payDeliveryEscrow}
            onUpdateStatus={updateOrderStatus}
            onOpenChat={(id) => setActiveChatOrderId(id)}
            onReview={submitReview}
          />
        )}
      </main>

      {activeChatOrder && (
        <ChatModal 
          order={activeChatOrder} 
          currentUserId={currentUser.id}
          onClose={() => setActiveChatOrderId(null)}
          onSend={(text) => sendMessage(activeChatOrder.id, text)}
        />
      )}
      
      <footer className="bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 py-6 mt-12 transition-colors">
        <div className="container mx-auto px-4 text-center text-gray-500 dark:text-slate-400 text-sm">
          &copy; 2024 SwiftEscrow Delivery. Securely connecting stores and riders.
        </div>
      </footer>
    </div>
  );
};

export default App;
