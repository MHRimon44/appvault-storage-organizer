/* eslint-disable no-void */
import { useEffect, useState } from 'react';
import mobileAds, { AdsConsent, TestIds } from 'react-native-google-mobile-ads';
import { config } from '../config/app';
import { useAppStore } from '../store/useAppStore';
export function useAds() {
  const premium = useAppStore(s => s.premium);
  const busy = useAppStore(s => s.busy);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    if (!premium.ready || premium.isPro) return;
    void (async () => {
      try {
        await AdsConsent.gatherConsent();
      } catch {
        /* Offline launches can reuse consent from a previous session. */
      }
      const consent = await AdsConsent.getConsentInfo();
      if (!consent.canRequestAds) return;
      await mobileAds().initialize();
      if (active) setReady(true);
    })().catch(() => {
      if (active) setReady(false);
    });
    return () => {
      active = false;
    };
  }, [premium.ready, premium.isPro]);
  return {
    enabled: ready && !premium.isPro && premium.ready && !busy,
    unitId: __DEV__ ? TestIds.BANNER : config.bannerId,
  };
}
