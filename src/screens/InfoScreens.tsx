/* eslint-disable react-native/no-inline-styles */
/* eslint-disable no-void */
import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Button, Card, Empty, Label, Loading, Screen } from '../components/UI';
import { storage } from '../services/native';
import { useAppStore } from '../store/useAppStore';
import { usePremium } from '../hooks/usePremium';
import { bytes, date, errorMessage } from '../utils/format';
import { config } from '../config/app';
import type { ScanHistory } from '../types';
export function HistoryScreen() {
  const back = useAppStore(s => s.back);
  const [history, setHistory] = useState<ScanHistory[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void storage
      .history()
      .then(value => {
        if (active) setHistory(value);
      })
      .catch(e => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <Screen
      title="Scan history"
      subtitle="Most recent 100 completed scans"
      back={back}
    >
      {error ? (
        <Empty title="History unavailable" body={error} />
      ) : !history ? (
        <Loading />
      ) : !history.length ? (
        <Empty
          title="No completed scans"
          body="Your first complete scan will appear here."
        />
      ) : (
        history.map(scan => (
          <Card key={scan.id}>
            <Label style={{ fontWeight: '600' }}>
              {date(scan.completedAt)}
            </Label>
            <Label>
              {scan.totalFiles.toLocaleString()} files ·{' '}
              {bytes(scan.totalBytes)}
            </Label>
            <Label muted>
              {scan.largeFileCount} large files · {bytes(scan.duplicateBytes)}{' '}
              verified extra copies at scan time
            </Label>
          </Card>
        ))
      )}
    </Screen>
  );
}
export function PremiumScreen() {
  const { premium, buy, restore } = usePremium();
  const [working, setWorking] = useState(false);
  const act = async (purchase: boolean) => {
    setWorking(true);
    try {
      if (purchase) await buy();
      else await restore();
    } catch (e) {
      Alert.alert('Purchase unavailable', errorMessage(e));
    } finally {
      setWorking(false);
    }
  };
  return (
    <Screen title="AppVault Pro" back={useAppStore(s => s.back)}>
      <Card>
        <Label title>
          {premium.isPro
            ? 'Your Pro upgrade is active'
            : 'A calmer, ad-free AppVault'}
        </Label>
        <Label muted>
          One-time purchase. All core scanning, search, duplicate verification
          and safe cleanup stay available for everyone.
        </Label>
        <Label>Remove banner ads across AppVault.</Label>
        <Label muted>
          Your Google Play account manages this purchase. No AppVault account is
          required.
        </Label>
        {!config.billingEnabled && (
          <Label muted>
            Purchases are disabled until the Play product and licensing key are
            configured for this build.
          </Label>
        )}
        {premium.pending && (
          <Label muted>
            Payment is pending. Pro activates only after Google Play confirms a
            completed purchase.
          </Label>
        )}
      </Card>
      <Button
        title={
          premium.isPro
            ? 'Pro active'
            : premium.price
            ? `Unlock Pro · ${premium.price}`
            : 'Unlock Pro'
        }
        disabled={
          working ||
          premium.isPro ||
          !config.billingEnabled ||
          !premium.price ||
          premium.pending
        }
        onPress={() => void act(true)}
      />
      <Button
        title="Restore purchase"
        secondary
        disabled={working || !config.billingEnabled}
        onPress={() => void act(false)}
      />
    </Screen>
  );
}
export function AboutScreen() {
  return (
    <Screen title="About AppVault" back={useAppStore(s => s.back)}>
      <Card>
        <Label title>Find what matters. Make room safely.</Label>
        <Label muted>
          AppVault {config.version} organizes file metadata locally. It is a
          file discovery and cleanup tool, not a secure encrypted file vault.
        </Label>
      </Card>
      <Card>
        <Label title>Privacy policy</Label>
        <Label>
          AppVault scans only files and media you authorize. File contents,
          filenames, hashes and scan history remain on your device; AppVault has
          no server and does not upload these records.
        </Label>
        <Label>
          Google AdMob can process device identifiers, IP addresses and
          advertising information according to your consent and Google's
          policies. Purchases are processed by Google Play. AppVault stores a
          locally verified purchase receipt for offline ad removal.
        </Label>
        <Label>
          Permissions are used to index, open, share and delete authorized
          files. Sharing sends the selected file to the app you choose. Exported
          backups contain file references and may contain sensitive names; store
          them safely.
        </Label>
        <Label>
          Clearing app data or uninstalling removes AppVault's local metadata.
          Original files remain unless you explicitly confirm deletion. Local
          database and entitlement data are excluded from Android automatic
          cloud backup.
        </Label>
        <Label>
          Use Settings → Ad privacy choices to review available consent options.
          Google may retain service data according to its own policies.
        </Label>
      </Card>
      <Card>
        <Label title>Terms of use</Label>
        <Label>
          Review files carefully before deletion. AppVault deletion is permanent
          and has no app-level undo. Indexed results cover granted sources and
          can become outdated when other apps change files. Older modification
          dates do not prove that files are unused.
        </Label>
        <Label>
          Purchase restoration requires the Google Play account that owns the
          product. AppVault does not provide cloud synchronization or guaranteed
          recovery of deleted files.
        </Label>
      </Card>
    </Screen>
  );
}
