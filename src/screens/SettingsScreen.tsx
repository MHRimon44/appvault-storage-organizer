/* eslint-disable react-native/no-inline-styles */
/* eslint-disable no-void */
import React from 'react';
import { Alert, View } from 'react-native';
import { AdsConsent } from 'react-native-google-mobile-ads';
import {
  Button,
  Card,
  Chip,
  Label,
  Row,
  Screen,
  styles,
} from '../components/UI';
import { useAppStore } from '../store/useAppStore';
import { useTask } from '../hooks/useTask';
import { usePremium } from '../hooks/usePremium';
import { storage } from '../services/native';
import { errorMessage } from '../utils/format';
import type { AppSettings, FileSort } from '../types';
import { config } from '../config/app';
export function SettingsScreen() {
  const settings = useAppStore(s => s.settings);
  const update = useAppStore(s => s.update);
  const push = useAppStore(s => s.push);
  const busy = useAppStore(s => s.busy);
  const task = useTask();
  const { restore, premium } = usePremium();
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      Alert.alert('Unable to finish', errorMessage(e));
    }
  };
  const backup = async (kind: 'export' | 'import') =>
    run(async () => {
      const result = await storage.choose(kind);
      if (!result.canceled) {
        await useAppStore.getState().boot();
        useAppStore.getState().refresh();
        Alert.alert(
          kind === 'export' ? 'Backup exported' : 'Backup imported',
          kind === 'export'
            ? 'Only settings, favorite references and scan history were exported.'
            : 'Settings and history were merged. Favorites are restored only for currently indexed references. Regrant storage access separately.',
        );
      }
    });
  return (
    <Screen title="Settings" subtitle="Local by design">
      <Card>
        <Label style={{ fontWeight: '600' }}>Appearance</Label>
        <View style={styles.wrap}>
          {(['system', 'light', 'dark'] as AppSettings['theme'][]).map(
            theme => (
              <Chip
                key={theme}
                title={theme}
                active={settings.theme === theme}
                onPress={() => void run(() => update({ theme }))}
              />
            ),
          )}
        </View>
        <Label style={{ fontWeight: '600' }}>Default sorting</Label>
        <View style={styles.wrap}>
          {(
            ['newest', 'oldest', 'largest', 'smallest', 'name'] as FileSort[]
          ).map(sort => (
            <Chip
              key={sort}
              title={sort}
              active={settings.sort === sort}
              onPress={() => void run(() => update({ sort }))}
            />
          ))}
        </View>
        <Label style={{ fontWeight: '600' }}>Large file threshold</Label>
        <View style={styles.wrap}>
          {[10, 50, 100, 500].map(largeMB => (
            <Chip
              key={largeMB}
              title={`${largeMB} MB`}
              active={settings.largeMB === largeMB}
              onPress={() => void run(() => update({ largeMB }))}
            />
          ))}
        </View>
        <Label style={{ fontWeight: '600' }}>Older file threshold</Label>
        <View style={styles.wrap}>
          {[30, 90, 180, 365, 730].map(oldDays => (
            <Chip
              key={oldDays}
              title={`${oldDays} days`}
              active={settings.oldDays === oldDays}
              onPress={() => void run(() => update({ oldDays }))}
            />
          ))}
        </View>
      </Card>
      <Card>
        <Row
          title="Scan coverage & permissions"
          icon="folder-lock-outline"
          subtitle="Manage accessible media, files and folders"
          onPress={() => push({ name: 'permission' })}
        />
        <Row
          title="Favorites"
          icon="star-outline"
          onPress={() => push({ name: 'favorites' })}
        />
        <Row
          title="Documents & PDFs"
          icon="file-document-outline"
          onPress={() => push({ name: 'documents' })}
        />
        <Row
          title="Scan history"
          icon="history"
          onPress={() => push({ name: 'history' })}
        />
        <Row
          title="Clear search history"
          icon="magnify"
          onPress={() => void run(() => storage.clearRecent())}
        />
        <Row
          title="Clear local scan cache"
          subtitle="Preserves favorite references, settings and history"
          icon="database-outline"
          onPress={() => {
            if (busy) return;
            Alert.alert(
              'Clear index availability?',
              'No user files are deleted. Rescan afterward to rebuild availability and hashes.',
              [
                { text: 'Cancel' },
                {
                  text: 'Clear cache',
                  onPress: () =>
                    void run(async () => {
                      await storage.clearCache();
                      useAppStore.getState().refresh();
                    }),
                },
              ],
            );
          }}
        />
      </Card>
      <Button
        title="Rescan accessible files"
        icon="radar"
        disabled={busy}
        onPress={() => void task('scan')}
      />
      <Card>
        <Row
          title="Export local backup"
          icon="export"
          onPress={() => void backup('export')}
        />
        <Row
          title="Import local backup"
          icon="import"
          onPress={() =>
            Alert.alert(
              'Import local backup?',
              'This merges settings and history. It grants no file permissions and changes no purchase ownership.',
              [
                { text: 'Cancel' },
                { text: 'Choose backup', onPress: () => void backup('import') },
              ],
            )
          }
        />
        <Row
          title={premium.isPro ? 'AppVault Pro active' : 'AppVault Pro'}
          subtitle="One-time upgrade · remove ads"
          icon="shield-star-outline"
          onPress={() => push({ name: 'premium' })}
        />
        <Row
          title="Restore purchases"
          icon="restore"
          onPress={() =>
            void run(async () => {
              await restore();
              Alert.alert(
                'Restore finished',
                useAppStore.getState().premium.isPro
                  ? 'AppVault Pro is active.'
                  : config.billingEnabled
                  ? 'No active Pro purchase was found.'
                  : 'Purchases are not enabled in this build.',
              );
            })
          }
        />
        <Row
          title="Ad privacy choices"
          icon="shield-account-outline"
          onPress={() => void run(() => AdsConsent.showPrivacyOptionsForm())}
        />
        <Row
          title="Privacy, terms & about"
          subtitle={`AppVault ${config.version}`}
          icon="information-outline"
          onPress={() => push({ name: 'about' })}
        />
      </Card>
    </Screen>
  );
}
