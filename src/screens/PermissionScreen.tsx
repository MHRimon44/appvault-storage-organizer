/* eslint-disable react-native/no-inline-styles */
/* eslint-disable no-void */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AppState,
  Linking,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { Button, Card, Icon, Label, Screen } from '../components/UI';
import { storage } from '../services/native';
import { useAppStore } from '../store/useAppStore';
import { useTask } from '../hooks/useTask';
import { errorMessage } from '../utils/format';
import type { AccessState } from '../types';
export function PermissionScreen() {
  const back = useAppStore(s => s.back);
  const task = useTask();
  const busy = useAppStore(s => s.busy);
  const [access, setAccess] = useState<AccessState | null>(null);
  const reload = useCallback(async () => setAccess(await storage.access()), []);
  useEffect(() => {
    void reload().catch(() => {});
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') void reload().catch(() => {});
    });
    return () => listener.remove();
  }, [reload]);
  const fullMediaAccess =
    !!access?.images && !!access?.videos && !!access?.audio;
  const media = async () => {
    try {
      if (Number(Platform.Version) >= 33) {
        const permissions: import('react-native').Permission[] = [
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO,
        ];
        if (Number(Platform.Version) >= 34)
          permissions.push(
            PermissionsAndroid.PERMISSIONS.READ_MEDIA_VISUAL_USER_SELECTED,
          );
        const results = await PermissionsAndroid.requestMultiple(permissions);
        if (
          Object.values(results).some(
            value => value === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
          )
        )
          Alert.alert(
            'Access is limited',
            'You can change media access in Android app settings.',
            [
              { text: 'Keep limited access' },
              {
                text: 'Open settings',
                onPress: () => void Linking.openSettings(),
              },
            ],
          );
      } else
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        );
      await reload();
    } catch (error) {
      Alert.alert('Access could not change', errorMessage(error));
    }
  };
  const choose = async (kind: 'tree' | 'files') => {
    try {
      const result = await storage.choose(kind);
      if (!result.canceled) {
        await reload();
        await task('scan');
      }
    } catch (error) {
      Alert.alert('Unable to add source', errorMessage(error));
    }
  };
  return (
    <Screen
      title="Choose your scan coverage"
      subtitle="You control what AppVault can see"
      back={back}
    >
      <Card>
        <Icon name="shield-check-outline" size={32} />
        <Label title>Files stay on your device</Label>
        <Label muted>
          No account. No AppVault server. File contents and file names are
          processed locally. Google services handle ads and purchases.
        </Label>
      </Card>
      {access && !fullMediaAccess && (
        <Card>
          <Label title>Photos, videos & audio</Label>
          <Label muted>
            Optional library access lets you organize media. On supported
            Android versions, you can choose a limited selection.
          </Label>
          <Label muted style={{ fontSize: 12 }}>
            Images:{' '}
            {access?.images
              ? 'Full access'
              : access?.partial
              ? 'Selected only'
              : 'Not granted'}{' '}
            · Videos:{' '}
            {access?.videos
              ? 'Full access'
              : access?.partial
              ? 'Selected only'
              : 'Not granted'}{' '}
            · Audio: {access?.audio ? 'Granted' : 'Not granted'}
          </Label>
          <Button
            title="Choose media access"
            secondary
            icon="image-multiple-outline"
            disabled={busy}
            onPress={() => void media()}
          />
        </Card>
      )}
      <Card>
        <Label title>Folders & documents</Label>
        <Label muted>
          Select on-device folders to include documents, APKs and archives.
          Android restricts the storage root and the Download root on newer
          devices; choose a subfolder or select individual downloads.
        </Label>
        <Button
          title="Add a folder"
          icon="folder-plus-outline"
          disabled={busy}
          onPress={() => void choose('tree')}
        />
        <Button
          title="Add files or downloads"
          secondary
          icon="file-plus-outline"
          disabled={busy}
          onPress={() => void choose('files')}
        />
      </Card>
      {access && (
        <Card>
          <Label style={{ fontWeight: '600' }}>
            {access.sources.length} selected sources
          </Label>
          {access.sources.map(source => (
            <Card key={source.uri}>
              <Label muted style={{ fontSize: 12 }}>
                {source.name}
              </Label>
              <Button
                title="Remove source access"
                secondary
                disabled={busy}
                onPress={() => {
                  Alert.alert(
                    'Remove this source?',
                    'Original files remain. Indexed references become unavailable until you reconnect this source.',
                    [
                      { text: 'Cancel' },
                      {
                        text: 'Remove access',
                        onPress: () => {
                          void storage
                            .forgetSource(source.uri)
                            .then(async () => {
                              await reload();
                              useAppStore.getState().refresh();
                            })
                            .catch(error =>
                              Alert.alert(
                                'Unable to remove access',
                                errorMessage(error),
                              ),
                            );
                        },
                      },
                    ],
                  );
                }}
              />
            </Card>
          ))}
        </Card>
      )}
      <Button
        title="Scan granted sources"
        disabled={busy}
        icon="radar"
        onPress={() => void task('scan')}
      />
      <Button
        title="Android permission settings"
        secondary
        onPress={() => void Linking.openSettings()}
      />
    </Screen>
  );
}
