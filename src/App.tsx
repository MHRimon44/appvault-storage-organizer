/* eslint-disable no-void */
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  Button,
  Card,
  Empty,
  Icon,
  Label,
  Loading,
  Screen,
} from './components/UI';
import { AppNavigator } from './navigation/AppNavigator';
import { storage } from './services/native';
import { useAppStore } from './store/useAppStore';
import { useTheme } from './theme';
import { errorMessage } from './utils/format';
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    if (__DEV__) console.warn('[AppVault render]', error);
  }
  render() {
    return this.state.failed ? (
      <Screen title="AppVault">
        <Empty
          title="Something went wrong"
          body="Restart the screen to try again. If a file operation was interrupted, rescan to refresh the index."
        />
        <Button
          title="Try again"
          onPress={() => this.setState({ failed: false })}
        />
      </Screen>
    ) : (
      this.props.children
    );
  }
}
function Root() {
  const initialized = useAppStore(s => s.initialized);
  const t = useTheme();
  const [error, setError] = useState('');
  const boot = async () => {
    setError('');
    try {
      await useAppStore.getState().boot();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  useEffect(() => {
    void boot();
    const subscription = storage.progress(progress => {
      if (useAppStore.getState().progress) useAppStore.setState({ progress });
    });
    return () => subscription.remove();
  }, []);
  return (
    <>
      <StatusBar
        backgroundColor={t.bg}
        barStyle={t.isDark ? 'light-content' : 'dark-content'}
      />
      {initialized ? (
        <AppNavigator />
      ) : (
        <Screen title="AppVault">
          <Card>
            <Icon name="shield-check-outline" size={42} />
            <Label title>Your files. Your control.</Label>
            {error ? (
              <>
                <Label>{error}</Label>
                <Button
                  title="Retry initialization"
                  onPress={() => void boot()}
                />
              </>
            ) : (
              <Loading />
            )}
          </Card>
        </Screen>
      )}
    </>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <Root />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
