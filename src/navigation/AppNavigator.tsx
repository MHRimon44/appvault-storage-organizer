/* eslint-disable react-native/no-inline-styles */
import React, { useEffect } from 'react';
import { BackHandler, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Label, type IconName } from '../components/UI';
import { ScanProgress } from '../components/ScanProgress';
import { HomeScreen } from '../screens/HomeScreen';
import { PermissionScreen } from '../screens/PermissionScreen';
import { FileBrowserScreen } from '../screens/FileBrowserScreen';
import { CleanScreen } from '../screens/CleanScreen';
import { DuplicateScreen } from '../screens/DuplicateScreen';
import { DetailsScreen } from '../screens/DetailsScreen';
import {
  CleanupReviewScreen,
  CleanupResultScreen,
} from '../screens/CleanupScreens';
import { SettingsScreen } from '../screens/SettingsScreen';
import {
  AboutScreen,
  HistoryScreen,
  PremiumScreen,
} from '../screens/InfoScreens';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../theme';
import { usePremiumLifecycle } from '../hooks/usePremium';
import type { Route } from '../types';
const tabs: { name: Route['name']; label: string; icon: IconName }[] = [
  { name: 'home', label: 'Home', icon: 'home-outline' },
  { name: 'files', label: 'Files', icon: 'folder-outline' },
  { name: 'clean', label: 'Clean', icon: 'broom' },
  { name: 'search', label: 'Search', icon: 'magnify' },
  { name: 'settings', label: 'Settings', icon: 'cog-outline' },
];
export function AppNavigator() {
  const routes = useAppStore(s => s.routes);
  const route: Route = routes[routes.length - 1] ?? { name: 'home' };
  const busy = useAppStore(s => s.busy);
  const t = useTheme();
  usePremiumLifecycle();
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (useAppStore.getState().busy) return true;
      if (useAppStore.getState().routes.length > 1) {
        useAppStore.getState().back();
        return true;
      }
      if (useAppStore.getState().routes[0]?.name !== 'home') {
        useAppStore.getState().tab('home');
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, []);
  let content: React.ReactNode;
  switch (route.name) {
    case 'home':
      content = <HomeScreen />;
      break;
    case 'permission':
      content = <PermissionScreen />;
      break;
    case 'clean':
      content = <CleanScreen />;
      break;
    case 'settings':
      content = <SettingsScreen />;
      break;
    case 'duplicates':
      content = <DuplicateScreen />;
      break;
    case 'details':
      content = route.file ? (
        <DetailsScreen file={route.file} />
      ) : (
        <HomeScreen />
      );
      break;
    case 'review':
      content = (
        <CleanupReviewScreen
          files={route.files ?? []}
          protectDuplicates={route.protectDuplicates}
        />
      );
      break;
    case 'result':
      content = route.result ? (
        <CleanupResultScreen result={route.result} />
      ) : (
        <HomeScreen />
      );
      break;
    case 'history':
      content = <HistoryScreen />;
      break;
    case 'premium':
      content = <PremiumScreen />;
      break;
    case 'about':
      content = <AboutScreen />;
      break;
    default:
      content = <FileBrowserScreen route={route} />;
  }
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <SafeAreaView
        edges={routes.length > 1 ? ['bottom'] : []}
        key={`${routes.length}:${route.name}:${route.category ?? ''}`}
        style={{ flex: 1 }}
      >
        {content}
      </SafeAreaView>
      {routes.length === 1 && (
        <SafeAreaView
          edges={['bottom', 'left', 'right']}
          style={{
            backgroundColor: t.surface,
            borderTopWidth: 1,
            borderTopColor: t.line,
          }}
        >
          <View style={{ flexDirection: 'row', minHeight: 62 }}>
            {tabs.map(tab => (
              <Pressable
                key={tab.name}
                accessibilityRole="tab"
                accessibilityState={{ selected: route.name === tab.name }}
                disabled={busy}
                onPress={() => useAppStore.getState().tab(tab.name)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                }}
              >
                <Icon
                  name={tab.icon}
                  color={route.name === tab.name ? t.primary : t.muted}
                />
                <Label
                  style={{
                    fontSize: 10,
                    color: route.name === tab.name ? t.primary : t.muted,
                  }}
                >
                  {tab.label}
                </Label>
              </Pressable>
            ))}
          </View>
        </SafeAreaView>
      )}
      <ScanProgress />
    </View>
  );
}
