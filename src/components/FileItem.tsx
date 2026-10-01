/* eslint-disable react-native/no-inline-styles */
/* eslint-disable @typescript-eslint/no-shadow */
import React, { memo } from 'react';
import { Image, Pressable, View, Text } from 'react-native';
import { Icon, Label, styles, type IconName } from './UI';
import { useTheme } from '../theme';
import { bytes, date } from '../utils/format';
import type { AppFile, FileCategory } from '../types';
export const categoryIcons: Record<FileCategory, IconName> = {
  images: 'image-outline',
  videos: 'video-outline',
  audio: 'music-note-outline',
  pdfs: 'file-pdf-box',
  documents: 'file-document-outline',
  apks: 'android',
  archives: 'folder-zip-outline',
  other: 'file-outline',
};
export const FileItem = memo(function FileItem({
  file,
  selected = false,
  selecting = false,
  grid = false,
  onPress,
  onLongPress,
}: {
  file: AppFile;
  selected?: boolean;
  selecting?: boolean;
  grid?: boolean;
  onPress(): void;
  onLongPress(): void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${file.displayName}, ${bytes(file.size)}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        grid
          ? { flex: 1, padding: 12, margin: 4, borderRadius: 12, gap: 8 }
          : styles.row,
        {
          borderBottomColor: t.line,
          backgroundColor: selected ? t.soft : grid ? t.surface : 'transparent',
        },
      ]}
    >
      {file.category === 'images' && file.available ? (
        <Image
          source={{ uri: file.uri }}
          style={{
            width: grid ? '100%' : 42,
            height: grid ? 110 : 42,
            borderRadius: 10,
          }}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={[styles.iconTile, { backgroundColor: t.soft }]}>
          <Icon name={categoryIcons[file.category]} color={t.primary} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{ color: t.text, fontSize: 14, fontWeight: '600' }}
        >
          {file.displayName}
        </Text>
        <Label muted style={{ fontSize: 12 }}>
          {bytes(file.size)} · {date(file.dateModified)}
        </Label>
        {!file.available && (
          <Label style={{ color: t.warning, fontSize: 12 }}>
            Unavailable · rescan or reconnect source
          </Label>
        )}
      </View>
      {selecting ? (
        <Icon
          name={
            selected
              ? 'checkbox-marked-circle'
              : 'checkbox-blank-circle-outline'
          }
          color={selected ? t.primary : t.muted}
        />
      ) : file.favorite ? (
        <Icon name="star" color={t.warning} size={18} />
      ) : (
        <Icon name="chevron-right" size={18} />
      )}
    </Pressable>
  );
});
