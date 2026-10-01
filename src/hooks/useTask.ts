import { Alert } from 'react-native';
import { storage } from '../services/native';
import { useAppStore } from '../store/useAppStore';
import { errorMessage } from '../utils/format';
export function useTask() {
  return async (kind: 'scan' | 'hash') => {
    if (useAppStore.getState().busy) return;
    useAppStore.setState({
      busy: true,
      progress: { phase: kind, processed: 0, bytes: 0, label: 'Preparing…' },
    });
    try {
      if (kind === 'scan') {
        await storage.scan();
      } else {
        const result = await storage.hash();
        if (result.warnings)
          Alert.alert(
            'Some files were skipped',
            `${result.warnings} files changed or could not be read. Only verified matching files appear.`,
          );
        if (
          !result.canceled &&
          useAppStore.getState().routes[
            useAppStore.getState().routes.length - 1
          ]?.name !== 'duplicates'
        )
          useAppStore.getState().push({ name: 'duplicates' });
      }
      useAppStore.getState().refresh();
    } catch (error) {
      Alert.alert('Unable to finish', errorMessage(error));
    } finally {
      useAppStore.setState({ busy: false, progress: null });
    }
  };
}
