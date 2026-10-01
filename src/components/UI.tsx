/* eslint-disable react-native/no-inline-styles */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons/static';
import { useTheme } from '../theme';
export type IconName = React.ComponentProps<typeof MaterialDesignIcons>['name'];
export function Icon({
  name,
  color,
  size = 22,
}: {
  name: IconName;
  color?: string;
  size?: number;
}) {
  const t = useTheme();
  return (
    <MaterialDesignIcons name={name} size={size} color={color ?? t.muted} />
  );
}
export function Label({
  children,
  muted = false,
  title = false,
  style,
}: {
  children: React.ReactNode;
  muted?: boolean;
  title?: boolean;
  style?: StyleProp<import('react-native').TextStyle>;
}) {
  const t = useTheme();
  return (
    <Text
      style={[
        {
          color: muted ? t.muted : t.text,
          fontSize: title ? 19 : 14,
          fontWeight: title ? '700' : '400',
          lineHeight: title ? 26 : 21,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: t.surface, borderColor: t.line },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Button({
  title,
  onPress,
  icon,
  iconOnly = false,
  danger = false,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress(): void;
  icon?: IconName;
  iconOnly?: boolean;
  danger?: boolean;
  secondary?: boolean;
  disabled?: boolean;
}) {
  const t = useTheme();
  const color = secondary ? t.primary : '#FFFFFF';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        iconOnly && icon ? styles.iconOnlyButton : undefined,
        {
          backgroundColor: secondary ? t.soft : danger ? t.danger : '#4058D6',
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
      ]}
    >
      {icon && <Icon name={icon} color={color} size={iconOnly ? 22 : 19} />}
      {(!iconOnly || !icon) && (
        <Text style={{ color, fontWeight: '600', fontSize: 14 }}>{title}</Text>
      )}
    </Pressable>
  );
}
export function Chip({
  title,
  icon,
  iconOnly = false,
  active = false,
  onPress,
}: {
  title: string;
  icon?: IconName;
  iconOnly?: boolean;
  active?: boolean;
  onPress(): void;
}) {
  const t = useTheme();
  const { fontScale } = useWindowDimensions();
  const height = Math.max(36, Math.ceil(18 * fontScale + 16));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ selected: active }}
      hitSlop={{ top: 4, bottom: 4 }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          height,
          backgroundColor: active ? t.soft : t.surface,
          borderColor: active ? t.primary : t.line,
        },
      ]}
    >
      {icon && (
        <Icon name={icon} size={18} color={active ? t.primary : t.muted} />
      )}
      {(!iconOnly || !icon) && (
        <Text
          numberOfLines={1}
          style={{
            fontSize: 12,
            lineHeight: 18,
            fontWeight: '500',
            color: active ? t.primary : t.muted,
            textAlign: 'center',
            textAlignVertical: 'center',
            includeFontPadding: false,
          }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}
export function ChipBar({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { fontScale } = useWindowDimensions();
  const height = Math.max(36, Math.ceil(18 * fontScale + 16)) + 8;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={[{ height, minHeight: height, flexGrow: 0, flexShrink: 0 }, style]}
      contentContainerStyle={{ alignItems: 'center', paddingVertical: 3 }}
    >
      {children}
    </ScrollView>
  );
}
export function Screen({
  title,
  subtitle,
  back,
  children,
  scroll = true,
}: {
  title: string;
  subtitle?: string;
  back?: () => void;
  children: React.ReactNode;
  scroll?: boolean;
}) {
  const t = useTheme();
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={{ flex: 1, backgroundColor: t.bg }}
    >
      <View style={styles.header}>
        {back && (
          <Pressable
            onPress={back}
            accessibilityLabel="Go back"
            accessibilityRole="button"
            style={styles.iconButton}
          >
            <Icon name="arrow-left" color={t.text} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Label title>{title}</Label>
          {subtitle && (
            <Label muted style={{ fontSize: 12 }}>
              {subtitle}
            </Label>
          )}
        </View>
      </View>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingHorizontal: 16 }}>{children}</View>
      )}
    </SafeAreaView>
  );
}
export function Empty({
  title,
  body,
  icon = 'folder-outline',
}: {
  title: string;
  body: string;
  icon?: IconName;
}) {
  const t = useTheme();
  return (
    <View style={styles.empty}>
      <Icon name={icon} color={t.primary} size={38} />
      <Label title>{title}</Label>
      <Label muted style={{ textAlign: 'center' }}>
        {body}
      </Label>
    </View>
  );
}
export function Loading() {
  const t = useTheme();
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={t.primary} />
      <Label muted>Loading your index…</Label>
    </View>
  );
}
export function Row({
  title,
  subtitle,
  icon,
  onPress,
  right,
}: {
  title: string;
  subtitle?: string;
  icon: IconName;
  onPress(): void;
  right?: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.row, { borderBottomColor: t.line }]}
    >
      <View style={[styles.iconTile, { backgroundColor: t.soft }]}>
        <Icon name={icon} color={t.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Label style={{ fontWeight: '600' }}>{title}</Label>
        {subtitle && (
          <Label muted style={{ fontSize: 12 }}>
            {subtitle}
          </Label>
        )}
      </View>
      {right ?? <Icon name="chevron-right" />}
    </Pressable>
  );
}
export const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 16, borderWidth: 1, gap: 12 },
  button: {
    minHeight: 46,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  iconOnlyButton: { width: 44, minHeight: 44, paddingHorizontal: 0 },
  chip: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 0,
    flexShrink: 0,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 20,
    marginRight: 8,
  },
  header: {
    padding: 16,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 16 },
  empty: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 72,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconTile: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
});
