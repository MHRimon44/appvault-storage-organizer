/* eslint-disable react-native/no-inline-styles */
/* eslint-disable no-void */
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import {
  Button,
  Card,
  Empty,
  Icon,
  Label,
  Loading,
  Row,
  Screen,
  styles,
} from '../components/UI';
import { categoryIcons } from '../components/FileItem';
import { storage } from '../services/native';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../theme';
import { useTask } from '../hooks/useTask';
import { useAds } from '../hooks/useAds';
import { bytes, date, errorMessage } from '../utils/format';
import type { AccessState, Summary } from '../types';
export function HomeScreen() {
  const t = useTheme();
  const push = useAppStore(s => s.push);
  const revision = useAppStore(s => s.revision);
  const settings = useAppStore(s => s.settings);
  const busy = useAppStore(s => s.busy);
  const task = useTask();
  const ads = useAds();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [access, setAccess] = useState<AccessState | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void Promise.all([
      storage.summary(settings.largeMB, settings.oldDays),
      storage.access(),
    ])
      .then(([s, a]) => {
        if (active) {
          setSummary(s);
          setAccess(a);
          setError('');
        }
      })
      .catch(e => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [revision, settings.largeMB, settings.oldDays]);
  return (
    <Screen title="AppVault" subtitle="Find what matters. Make room safely.">
      {error ? (
        <Card>
          <Empty title="Index unavailable" body={error} />
          <Button
            title="Try again"
            onPress={() => useAppStore.getState().refresh()}
          />
        </Card>
      ) : !summary ? (
        <Loading />
      ) : (
        <>
          <Card
            style={{
              backgroundColor: t.isDark ? '#253353' : '#E9EEFF',
              borderColor: 'transparent',
            }}
          >
            <View style={styles.between}>
              <Label
                style={{ fontSize: 12, color: t.primary, fontWeight: '700' }}
              >
                STORAGE OVERVIEW
              </Label>
              <Icon name="shield-check-outline" color={t.primary} />
            </View>
            <Label style={{ fontSize: 30, lineHeight: 38, fontWeight: '700' }}>
              {bytes(summary.storageFree)} <Label muted>free</Label>
            </Label>
            <View
              style={{
                height: 7,
                backgroundColor: t.line,
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height: 7,
                  width: `${
                    summary.storageTotal
                      ? Math.min(
                          100,
                          Math.max(
                            0,
                            (1 - summary.storageFree / summary.storageTotal) *
                              100,
                          ),
                        )
                      : 0
                  }%`,
                  backgroundColor: '#4058D6',
                }}
              />
            </View>
            <Label muted style={{ fontSize: 12 }}>
              {bytes(summary.storageTotal - summary.storageFree)} used of{' '}
              {bytes(summary.storageTotal)} · primary volume
            </Label>
            <View style={styles.between}>
              <View>
                <Label style={{ fontWeight: '700' }}>
                  {summary.totalFiles.toLocaleString()}
                </Label>
                <Label muted style={{ fontSize: 12 }}>
                  indexed files
                </Label>
              </View>
              <View>
                <Label style={{ fontWeight: '700' }}>
                  {bytes(summary.totalBytes)}
                </Label>
                <Label muted style={{ fontSize: 12 }}>
                  accessible content
                </Label>
              </View>
            </View>
            <Button
              title={
                summary.lastScan
                  ? 'Rescan accessible files'
                  : 'Scan accessible files'
              }
              icon="radar"
              disabled={busy}
              onPress={() => void task('scan')}
            />
          </Card>
          <Pressable
            onPress={() => push({ name: 'permission' })}
            accessibilityRole="button"
          >
            <Card>
              <View style={styles.between}>
                <Icon name="folder-lock-outline" color={t.accent} />
                <View style={{ flex: 1 }}>
                  <Label style={{ fontWeight: '600' }}>
                    Your scan coverage
                  </Label>
                  <Label muted style={{ fontSize: 12 }}>
                    {access?.partial && !access.images && !access.videos
                      ? 'Selected photos and videos'
                      : 'Only media and sources you grant'}{' '}
                    · {access?.sources.length ?? 0} selected sources
                  </Label>
                </View>
                <Icon name="chevron-right" />
              </View>
              <Label muted style={{ fontSize: 12 }}>
                Add folders or files to include PDFs, APKs and downloads.
              </Label>
            </Card>
          </Pressable>
          <View style={styles.between}>
            <Label title>Explore your files</Label>
            <Pressable onPress={() => push({ name: 'files' })}>
              <Label style={{ color: t.primary }}>See all</Label>
            </Pressable>
          </View>
          <View style={[styles.wrap, { gap: 10 }]}>
            {summary.categories.map(c => (
              <Pressable
                key={c.category}
                onPress={() => push({ name: 'category', category: c.category })}
                style={{ width: '48%', flexGrow: 1 }}
              >
                <Card>
                  <Icon name={categoryIcons[c.category]} color={t.primary} />
                  <Label
                    style={{ fontWeight: '600', textTransform: 'capitalize' }}
                  >
                    {c.category}
                  </Label>
                  <Label muted style={{ fontSize: 12 }}>
                    {c.count.toLocaleString()} files · {bytes(c.bytes)}
                  </Label>
                </Card>
              </Pressable>
            ))}
          </View>
          {summary.totalFiles === 0 && (
            <Empty
              title="Your files, made clear"
              body="Choose the sources you want AppVault to organize, then run your first scan."
            />
          )}
          <Label title>Worth reviewing</Label>
          <Card>
            <Row
              icon="file-find-outline"
              title="Large files"
              subtitle={`${summary.largeCount} files over ${settings.largeMB} MB`}
              onPress={() => push({ name: 'large' })}
            />
            <Row
              icon="content-copy"
              title="Exact duplicates"
              subtitle={
                summary.duplicateBytes
                  ? `${bytes(summary.duplicateBytes)} estimated extra copies`
                  : 'Run a separate scan to verify matches'
              }
              onPress={() => push({ name: 'duplicates' })}
            />
            <Row
              icon="clock-outline"
              title="Older files"
              subtitle={`${summary.oldCount} files not modified in ${settings.oldDays} days`}
              onPress={() => push({ name: 'old' })}
            />
          </Card>
          <Label muted style={{ fontSize: 12 }}>
            Last complete scan:{' '}
            {summary.lastScan ? date(summary.lastScan) : 'Not yet scanned'}.
            Large files and older files overlap; their sizes are never added as
            guaranteed savings.
          </Label>
          {ads.enabled && (
            <View style={{ alignItems: 'center', gap: 5 }}>
              <Label muted style={{ fontSize: 10 }}>
                ADVERTISEMENT
              </Label>
              <BannerAd
                unitId={ads.unitId}
                size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
                onAdFailedToLoad={() => {}}
              />
            </View>
          )}
        </>
      )}
    </Screen>
  );
}
