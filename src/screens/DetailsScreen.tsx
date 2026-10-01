/* eslint-disable no-void */
/* eslint-disable react-native/no-inline-styles */
import React from 'react';
import { Alert, View } from 'react-native';
import { Button, Card, Icon, Label, Screen, styles } from '../components/UI';
import { categoryIcons } from '../components/FileItem';
import { storage } from '../services/native';
import { useAppStore } from '../store/useAppStore';
import { bytes, date, errorMessage } from '../utils/format';
import type { AppFile } from '../types';
export function DetailsScreen({ file }: { file: AppFile }) {
  const back = useAppStore(s => s.back);
  const push = useAppStore(s => s.push);
  const action = async (kind: 'open' | 'share' | 'favorite') => {
    try {
      if (kind === 'favorite') {
        await storage.favorite(file.id);
        useAppStore.getState().refresh();
        back();
      } else await storage.open(file, kind === 'share');
    } catch (e) {
      Alert.alert('Unable to finish', errorMessage(e));
    }
  };
  const fields = [
    ['Type', file.category],
    ['Extension', file.extension || 'None'],
    ['MIME type', file.mimeType],
    ['Size', bytes(file.size)],
    ['Last modified', date(file.dateModified)],
    ['Added', date(file.dateAdded)],
    ['Location', file.relativePath || 'Provider does not expose a location'],
    [
      'Source',
      file.source.startsWith('media:')
        ? 'Android media library'
        : 'User-selected source',
    ],
    ...(file.width && file.height
      ? [['Dimensions', `${file.width} × ${file.height}`]]
      : []),
    ...(file.duration
      ? [['Duration', `${Math.round(file.duration / 1000)} seconds`]]
      : []),
  ];
  return (
    <Screen title="File details" back={back}>
      <Card>
        <Icon name={categoryIcons[file.category]} size={36} />
        <Label title>{file.displayName}</Label>
        {!file.available && (
          <Label muted>
            This reference is currently unavailable. Reconnect its source and
            rescan.
          </Label>
        )}
      </Card>
      <Card>
        {fields.map(([title, value]) => (
          <View
            key={title}
            style={[styles.between, { alignItems: 'flex-start' }]}
          >
            <Label muted style={{ width: 100, fontSize: 12 }}>
              {title}
            </Label>
            <Label style={{ flex: 1, fontSize: 12 }}>{value}</Label>
          </View>
        ))}
      </Card>
      <Button
        title="Open file"
        icon="open-in-new"
        disabled={!file.available}
        onPress={() => void action('open')}
      />
      <Button
        title="Share file"
        secondary
        icon="share-variant-outline"
        disabled={!file.available}
        onPress={() => void action('share')}
      />
      <Button
        title={file.favorite ? 'Remove favorite' : 'Favorite'}
        secondary
        icon="star-outline"
        onPress={() => void action('favorite')}
      />
      <Button
        title="Review deletion"
        danger
        icon="delete-outline"
        disabled={!file.available}
        onPress={() => push({ name: 'review', files: [file] })}
      />
    </Screen>
  );
}
