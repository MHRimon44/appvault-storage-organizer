/* eslint-disable no-void */
/* eslint-disable react-native/no-inline-styles */
import React, { useState } from 'react';
import { Alert, Pressable, Switch, View } from 'react-native';
import {
  Button,
  Card,
  Icon,
  Label,
  Row,
  Screen,
  styles,
} from '../components/UI';
import { useAppStore } from '../store/useAppStore';
import { useTask } from '../hooks/useTask';
import { storage } from '../services/native';
import { errorMessage } from '../utils/format';
import type { FileSort } from '../types';
import { config } from '../config/app';
import { useTheme } from '../theme';

function SettingsDropdown<T extends string | number>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  disabled: boolean;
  onChange(value: T): void;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const expanded = open && !disabled;
  return (
    <View style={{ gap: 6 }}>
      <Label style={{ fontWeight: '600' }}>{label}</Label>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${
          options.find(option => option.value === value)?.label ?? value
        }`}
        accessibilityState={{ disabled, expanded }}
        disabled={disabled}
        onPress={() => setOpen(!open)}
        style={{
          minHeight: 44,
          paddingHorizontal: 12,
          borderWidth: 1,
          borderColor: t.line,
          borderRadius: 12,
          backgroundColor: t.bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          opacity: disabled ? 0.65 : 1,
        }}
      >
        <Label>
          {options.find(option => option.value === value)?.label ??
            String(value)}
        </Label>
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} />
      </Pressable>
      {expanded && (
        <View
          accessibilityRole="radiogroup"
          style={{
            borderWidth: 1,
            borderColor: t.line,
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          {options.map(option => (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: option.value === value }}
              onPress={() => {
                setOpen(false);
                onChange(option.value);
              }}
              style={{
                minHeight: 44,
                paddingHorizontal: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: option.value === value ? t.soft : t.surface,
              }}
            >
              <Label>{option.label}</Label>
              {option.value === value && (
                <Icon name="check" color={t.primary} />
              )}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
export function SettingsScreen() {
  const settings = useAppStore(s => s.settings);
  const update = useAppStore(s => s.update);
  const push = useAppStore(s => s.push);
  const busy = useAppStore(s => s.busy);
  const task = useTask();
  const t = useTheme();
  const [saving, setSaving] = useState(false);
  const change = async (changes: Parameters<typeof update>[0]) => {
    setSaving(true);
    try {
      await update(changes);
    } catch (e) {
      Alert.alert('Unable to save settings', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
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
        <View style={styles.between}>
          <Label title>Preferences</Label>
        </View>
        <View style={styles.between}>
          <View style={{ gap: 4 }}>
            <Label style={{ fontWeight: '600' }}>Appearance</Label>
            <Label muted>{t.isDark ? 'Dark' : 'Light'}</Label>
          </View>
          <Switch
            accessibilityLabel="Dark appearance"
            value={t.isDark}
            disabled={saving}
            onValueChange={dark =>
              void change({ theme: dark ? 'dark' : 'light' })
            }
            trackColor={{ false: t.line, true: t.primary }}
          />
        </View>
        <SettingsDropdown<FileSort>
          label="Default sorting"
          value={settings.sort}
          disabled={saving}
          options={[
            { value: 'newest', label: 'Newest first' },
            { value: 'oldest', label: 'Oldest first' },
            { value: 'largest', label: 'Largest first' },
            { value: 'smallest', label: 'Smallest first' },
            { value: 'name', label: 'Name' },
          ]}
          onChange={sort => void change({ sort })}
        />
        <SettingsDropdown
          label="Large file threshold"
          value={settings.largeMB}
          disabled={saving}
          options={[10, 50, 100, 500].map(value => ({
            value,
            label: `${value} MB`,
          }))}
          onChange={largeMB => void change({ largeMB })}
        />
        <SettingsDropdown
          label="Older file threshold"
          value={settings.oldDays}
          disabled={saving}
          options={[30, 90, 180, 365, 730].map(value => ({
            value,
            label: `${value} days`,
          }))}
          onChange={oldDays => void change({ oldDays })}
        />
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
              'This merges settings and history. It does not grant file permissions.',
              [
                { text: 'Cancel' },
                { text: 'Choose backup', onPress: () => void backup('import') },
              ],
            )
          }
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
