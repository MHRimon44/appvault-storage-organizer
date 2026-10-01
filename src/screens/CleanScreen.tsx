/* eslint-disable no-void */
import React from 'react';
import { Button, Card, Icon, Label, Row, Screen } from '../components/UI';
import { useAppStore } from '../store/useAppStore';
import { useTask } from '../hooks/useTask';
export function CleanScreen() {
  const push = useAppStore(s => s.push);
  const task = useTask();
  const busy = useAppStore(s => s.busy);
  return (
    <Screen
      title="Make room"
      subtitle="Review first. Delete only what you choose."
    >
      <Card>
        <Icon name="shield-check-outline" size={30} />
        <Label title>You stay in control</Label>
        <Label muted>
          No automatic cleanup. No misleading junk score. Exact duplicates use
          size and SHA-256, with one copy protected.
        </Label>
      </Card>
      <Card>
        <Row
          title="Large files"
          subtitle="Find files that take the most space"
          icon="file-find-outline"
          onPress={() => push({ name: 'large' })}
        />
        <Row
          title="Exact duplicates"
          subtitle="Verify identical content locally"
          icon="content-copy"
          onPress={() => push({ name: 'duplicates' })}
        />
        <Row
          title="Older files"
          subtitle="Last modified long ago; not necessarily unused"
          icon="clock-outline"
          onPress={() => push({ name: 'old' })}
        />
        <Row
          title="Downloads"
          subtitle="Accessible files with a reliable download location"
          icon="download-outline"
          onPress={() => push({ name: 'downloads' })}
        />
        <Row
          title="APK installers"
          subtitle="Review old installation files"
          icon="android"
          onPress={() => push({ name: 'apks' })}
        />
      </Card>
      <Button
        title="Scan accessible sources"
        icon="radar"
        disabled={busy}
        onPress={() => void task('scan')}
      />
    </Screen>
  );
}
