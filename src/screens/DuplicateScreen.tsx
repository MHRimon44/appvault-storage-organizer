/* eslint-disable react-native/no-inline-styles */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-void */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, View } from 'react-native';
import { Button, Card, Empty, Label, Screen, styles } from '../components/UI';
import { FileItem } from '../components/FileItem';
import { useTask } from '../hooks/useTask';
import { storage } from '../services/native';
import { useAppStore } from '../store/useAppStore';
import { bytes, errorMessage } from '../utils/format';
import type { AppFile, DuplicateGroup } from '../types';
export function DuplicateScreen() {
  const task = useTask();
  const busy = useAppStore(s => s.busy);
  const back = useAppStore(s => s.back);
  const push = useAppStore(s => s.push);
  const revision = useAppStore(s => s.revision);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [selected, setSelected] = useState<Map<string, AppFile>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const more = useRef(true);
  const flight = useRef(false);
  const generation = useRef(0);
  const count = useRef(0);
  const selectionGroups = useRef(new Map<string, string>());
  const load = async (reset = false) => {
    if ((flight.current && !reset) || (!more.current && !reset)) return;
    if (reset) {
      generation.current++;
      more.current = true;
      count.current = 0;
      setGroups([]);
      setSelected(new Map());
      selectionGroups.current.clear();
    }
    const ownGeneration = generation.current;
    flight.current = true;
    setLoading(true);
    try {
      const page = await storage.duplicates(count.current);
      if (ownGeneration !== generation.current) return;
      count.current += page.length;
      more.current = page.length === 30;
      setGroups(previous => (reset ? page : [...previous, ...page]));
      setError('');
    } catch (e) {
      if (ownGeneration === generation.current) setError(errorMessage(e));
    } finally {
      if (ownGeneration === generation.current) {
        flight.current = false;
        setLoading(false);
      }
    }
  };
  useEffect(() => {
    void load(true);
    return () => {
      generation.current++;
      flight.current = false;
    };
  }, [revision]);
  const toggle = (file: AppFile, group: DuplicateGroup) =>
    setSelected(previous => {
      const next = new Map(previous);
      if (next.has(file.id)) {
        next.delete(file.id);
        selectionGroups.current.delete(file.id);
      } else if (
        [...selectionGroups.current.values()].filter(
          hash => hash === group.hash,
        ).length <
          group.totalCopies - 1 &&
        next.size < 1000
      ) {
        next.set(file.id, file);
        selectionGroups.current.set(file.id, group.hash);
      } else
        Alert.alert(
          'Keep one copy',
          'At least one copy must remain in every group.',
        );
      return next;
    });
  const choose = async (group: DuplicateGroup, newest: boolean) => {
    try {
      const candidates = await storage.selectDuplicates(group.hash, newest);
      setSelected(previous => {
        const next = new Map(previous);
        for (const id of next.keys()) {
          if (selectionGroups.current.get(id) === group.hash) {
            next.delete(id);
            selectionGroups.current.delete(id);
          }
        }
        candidates.forEach(file => {
          if (next.size < 1000) {
            next.set(file.id, file);
            selectionGroups.current.set(file.id, group.hash);
          }
        });
        return next;
      });
    } catch (e) {
      Alert.alert('Unable to select copies', errorMessage(e));
    }
  };
  return (
    <Screen
      title="Exact duplicates"
      subtitle="Verified file content · keep one copy"
      back={back}
      scroll={false}
    >
      <Label muted style={{ fontSize: 12, marginBottom: 10 }}>
        SHA-256 runs off the JS thread. Only readable local files with reliable
        identities and dates are eligible. Cached matches are reverified before
        deletion. Keep AppVault open while scanning.
      </Label>
      <Button
        title="Verify duplicate candidates"
        icon="content-copy"
        disabled={busy}
        onPress={() => void task('hash')}
      />
      {!!error && (
        <View style={{ padding: 10 }}>
          <Label>{error}</Label>
          <Button title="Retry" onPress={() => void load(true)} />
        </View>
      )}
      <FlatList
        data={groups}
        keyExtractor={group => group.hash}
        extraData={selected}
        onEndReached={() => void load()}
        onEndReachedThreshold={0.4}
        contentContainerStyle={{ gap: 12, paddingVertical: 16 }}
        ListEmptyComponent={
          !loading ? (
            <Empty
              title="No verified duplicates"
              body="Scan your accessible sources, then verify duplicate candidates. Matching names alone never count."
            />
          ) : null
        }
        ListFooterComponent={loading ? <ActivityIndicator /> : null}
        renderItem={({ item: group }) => (
          <Card>
            <View style={styles.between}>
              <Label style={{ fontWeight: '700' }}>
                {group.totalCopies} identical copies
              </Label>
              <Label muted>{bytes(group.savings)} extra</Label>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                title="Keep newest"
                secondary
                onPress={() => void choose(group, true)}
              />
              <Button
                title="Keep oldest"
                secondary
                onPress={() => void choose(group, false)}
              />
            </View>
            {group.files.map(file => (
              <FileItem
                key={file.id}
                file={file}
                selecting
                selected={selected.has(file.id)}
                onPress={() => toggle(file, group)}
                onLongPress={() => push({ name: 'details', file })}
              />
            ))}
            {group.totalCopies > group.files.length && (
              <Button
                title={`Browse all ${group.totalCopies} copies`}
                secondary
                onPress={() =>
                  push({ name: 'category', duplicateHash: group.hash })
                }
              />
            )}
            <Label muted style={{ fontSize: 11 }}>
              Up to 1,000 files can be selected per cleanup. The preview shows
              at most five copies.
            </Label>
          </Card>
        )}
      />
      {selected.size > 0 && (
        <View style={{ paddingVertical: 12, gap: 8 }}>
          <Label>
            {selected.size} files ·{' '}
            {bytes(
              [...selected.values()].reduce(
                (total, file) => total + file.size,
                0,
              ),
            )}
          </Label>
          <Button
            title="Review selected copies"
            danger
            icon="delete-outline"
            onPress={() =>
              push({
                name: 'review',
                files: [...selected.values()],
                protectDuplicates: true,
              })
            }
          />
          <Button
            title="Clear selection"
            secondary
            onPress={() => {
              setSelected(new Map());
              selectionGroups.current.clear();
            }}
          />
        </View>
      )}
    </Screen>
  );
}
