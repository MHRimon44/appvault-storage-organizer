/* eslint-disable no-void */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { config } from '../config/app';
import { storage } from '../services/native';
import { useAppStore } from '../store/useAppStore';
export function usePremium() {
  const premium = useAppStore(s => s.premium);
  const restore = async () => {
    if (!config.billingEnabled) {
      useAppStore.setState({
        premium: { isPro: false, ready: true, price: '', pending: false },
      });
      return;
    }
    const result = await storage.billing('restore', config.proProductId);
    useAppStore.setState({ premium: result });
  };
  const buy = async () => {
    if (!config.billingEnabled)
      throw new Error('Purchases are not configured for this build.');
    useAppStore.setState({
      premium: await storage.billing('buy', config.proProductId),
    });
  };
  return { premium, restore, buy };
}
export function usePremiumLifecycle() {
  const { restore } = usePremium();
  useEffect(() => {
    void restore().catch(() =>
      useAppStore.setState(s => ({ premium: { ...s.premium, ready: true } })),
    );
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void restore().catch(() => {});
    });
    return () => subscription.remove();
    // Ownership refresh belongs to this single root lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
