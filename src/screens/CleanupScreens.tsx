/* eslint-disable no-void */
/* eslint-disable react-native/no-inline-styles */
import React, { useState } from 'react';
import { Alert, FlatList, View } from 'react-native';
import { Button, Card, Icon, Label, Screen, styles } from '../components/UI';
import { FileItem } from '../components/FileItem';
import { storage } from '../services/native';
import { useAppStore } from '../store/useAppStore';
import { bytes, errorMessage } from '../utils/format';
import type { AppFile, CleanupResult } from '../types';
export function CleanupReviewScreen({
  files,
  protectDuplicates = false,
}: {
  files: AppFile[];
  protectDuplicates?: boolean;
}) {
  const back = useAppStore(s => s.back);
  const [working, setWorking] = useState(false);
  const [review, setReview] = useState(files);
  const remove = async () => {
    if (working || !review.length) return;
    setWorking(true);
    useAppStore.setState({ busy: true });
    try {
      const result = await storage.delete(review, protectDuplicates);
      useAppStore.getState().refresh();
      useAppStore.getState().back();
      useAppStore.getState().push({ name: 'result', result });
    } catch (e) {
      Alert.alert('Cleanup could not finish', errorMessage(e));
      useAppStore.getState().refresh();
    } finally {
      setWorking(false);
      useAppStore.setState({ busy: false });
    }
  };
  return (
    <Screen
      title="Review before deleting"
      subtitle="Tap a file to remove it from this selection"
      back={working ? undefined : back}
      scroll={false}
    >
      <Card>
        <View style={styles.between}>
          <Label title>{review.length} files</Label>
          <Label title>
            {bytes(review.reduce((sum, file) => sum + file.size, 0))}
          </Label>
        </View>
        <Label muted>
          Selected file size, not guaranteed freed space. Deletion is permanent.
          Keep anything important or share a backup first.
        </Label>
      </Card>
      <FlatList
        data={review}
        keyExtractor={file => file.id}
        renderItem={({ item }) => (
          <FileItem
            file={item}
            selecting
            selected
            onPress={() => {
              if (!working)
                setReview(previous =>
                  previous.filter(file => file.id !== item.id),
                );
            }}
            onLongPress={() => {}}
          />
        )}
        contentContainerStyle={{ paddingVertical: 12 }}
      />
      <View style={{ paddingVertical: 12, gap: 8 }}>
        <Button
          title={
            working ? 'Waiting for deletion…' : `Confirm ${review.length} files`
          }
          disabled={working || !review.length}
          danger
          icon="delete-outline"
          onPress={() => void remove()}
        />
        <Button title="Cancel" disabled={working} secondary onPress={back} />
      </View>
    </Screen>
  );
}
export function CleanupResultScreen({ result }: { result: CleanupResult }) {
  return (
    <Screen
      title={result.canceled ? 'Cleanup stopped' : 'Cleanup complete'}
      back={useAppStore(s => s.back)}
    >
      <Card>
        <Icon
          name={
            result.deletedFileCount
              ? 'check-circle-outline'
              : 'information-outline'
          }
          size={40}
        />
        <Label title>{result.deletedFileCount} files removed</Label>
        <Label style={{ fontSize: 30, lineHeight: 38, fontWeight: '700' }}>
          {bytes(result.freedBytes)}
        </Label>
        <Label muted>
          Combined verified size of files successfully removed. Actual free
          device space may differ because of filesystem allocation or other
          apps.
        </Label>
        {result.failed > 0 && (
          <Label muted>
            {result.failed} files could not be removed or changed during review.
            Reconnect access and rescan before trying again.
          </Label>
        )}
        {result.canceled && (
          <Label muted>
            You canceled the remaining deletion. Earlier successful deletions
            are included.
          </Label>
        )}
        <Label muted>
          Categories: {result.categories.join(', ') || 'None'}
        </Label>
      </Card>
      <Button
        title="Back to Home"
        onPress={() => useAppStore.getState().tab('home')}
      />
    </Screen>
  );
}
