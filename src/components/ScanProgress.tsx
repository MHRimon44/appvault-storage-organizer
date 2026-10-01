/* eslint-disable react-native/no-inline-styles */
/* eslint-disable no-void */
import React from 'react';
import { ActivityIndicator, Alert, Modal, View } from 'react-native';
import { Button, Card, Label } from './UI';
import { useAppStore } from '../store/useAppStore';
import { storage } from '../services/native';
import { useTheme } from '../theme';
import { bytes, errorMessage } from '../utils/format';
export function ScanProgress() {
  const progress = useAppStore(s => s.progress);
  const t = useTheme();
  const cancel = () => {
    void storage
      .cancel()
      .catch(error => Alert.alert('Unable to stop', errorMessage(error)));
  };
  return (
    <Modal
      visible={!!progress}
      transparent
      animationType="fade"
      onRequestClose={cancel}
    >
      <View
        style={{
          flex: 1,
          padding: 24,
          justifyContent: 'center',
          backgroundColor: '#00000088',
        }}
      >
        <Card>
          <ActivityIndicator size="large" color={t.primary} />
          <Label title>
            {progress?.phase === 'hash'
              ? 'Verifying identical content'
              : 'Indexing granted sources'}
          </Label>
          <Label>
            {progress?.processed.toLocaleString() ?? 0} files processed
          </Label>
          <Label muted>
            {progress?.phase === 'hash' ? 'Read' : 'Indexed'}:{' '}
            {bytes(progress?.bytes ?? 0)}
          </Label>
          <Label muted>{progress?.label ?? 'Preparing…'}</Label>
          <Label muted style={{ fontSize: 12 }}>
            Keep AppVault open. The total depends on your sources, so progress
            is shown as a real count rather than an estimated percentage.
          </Label>
          <Button title="Stop scan" secondary onPress={cancel} />
        </Card>
      </View>
    </Modal>
  );
}
