/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-native/no-inline-styles */
/* eslint-disable no-void */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { Button, Chip, Empty, Label, Screen, styles } from '../components/UI';
import { FileItem } from '../components/FileItem';
import { storage } from '../services/native';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../theme';
import { bytes, errorMessage } from '../utils/format';
import type {
  AppFile,
  FileCategory,
  FileFilter,
  FileSort,
  Route,
} from '../types';
const categories: FileCategory[] = [
  'images',
  'videos',
  'audio',
  'pdfs',
  'documents',
  'apks',
  'archives',
  'other',
];
export function FileBrowserScreen({ route }: { route: Route }) {
  const t = useTheme();
  const settings = useAppStore(s => s.settings);
  const revision = useAppStore(s => s.revision);
  const push = useAppStore(s => s.push);
  const back = useAppStore(s => s.back);
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    if (route.name === 'search')
      void storage
        .recent()
        .then(setRecent)
        .catch(() => {});
  }, [route.name, revision]);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState<FileSort>(
    route.name === 'large' ? 'largest' : settings.sort,
  );
  const [category, setCategory] = useState<FileCategory | undefined>(
    route.category,
  );
  const [extension, setExtension] = useState('');
  const [minMB, setMinMB] = useState(
    route.name === 'large' ? String(settings.largeMB) : '',
  );
  const [maxMB, setMaxMB] = useState('');
  const [oldDays, setOldDays] = useState(settings.oldDays);
  const [beforeDate, setBeforeDate] = useState('');
  const [afterDate, setAfterDate] = useState('');
  const [grid, setGrid] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [items, setItems] = useState<AppFile[]>([]);
  const [selected, setSelected] = useState<Map<string, AppFile>>(new Map());
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const inFlight = useRef(false);
  const rows = useRef<AppFile[]>([]);
  const more = useRef(true);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const filter: FileFilter = {
    duplicateHash: route.duplicateHash,
    sort,
    query: debounced,
    category,
    extension: extension.trim().toLowerCase().replace(/^\./, ''),
    limit: 60,
  };
  if (minMB && Number.isFinite(Number(minMB)))
    filter.minSize = Math.max(0, Number(minMB)) * 1048576;
  if (maxMB && Number.isFinite(Number(maxMB)))
    filter.maxSize = Math.max(0, Number(maxMB)) * 1048576;
  if (route.name === 'old') filter.before = Date.now() - oldDays * 86400000;
  if (beforeDate && !Number.isNaN(Date.parse(beforeDate)))
    filter.before = Date.parse(beforeDate) + 86399999;
  if (afterDate && !Number.isNaN(Date.parse(afterDate)))
    filter.after = Date.parse(afterDate);
  if (route.name === 'downloads') filter.downloads = true;
  if (route.name === 'favorites') filter.favorite = true;
  if (route.name === 'apks') filter.category = 'apks';
  if (route.name === 'documents' && !category) filter.category = 'documents';
  const serialized = JSON.stringify({
    ...filter,
    ...(route.name === 'old' ? { before: oldDays } : {}),
  });
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const load = useCallback(async (reset: boolean) => {
    if (!reset && (inFlight.current || !more.current)) return;
    if (reset) {
      generation.current++;
      rows.current = [];
      more.current = true;
      setItems([]);
      setSelected(new Map());
    }
    const ownGeneration = generation.current;
    inFlight.current = true;
    setLoading(true);
    setError('');
    try {
      const page = await storage.files({
        ...filterRef.current,
        offset: reset ? 0 : rows.current.length,
      });
      if (ownGeneration !== generation.current) return;
      rows.current = reset ? page : [...rows.current, ...page];
      setItems(rows.current);
      more.current = page.length === 60;
      setHasMore(more.current);
    } catch (e) {
      if (ownGeneration === generation.current) setError(errorMessage(e));
    } finally {
      if (ownGeneration === generation.current) {
        inFlight.current = false;
        setLoading(false);
      }
    }
  }, []);
  useEffect(() => {
    void load(true);
    return () => {
      generation.current++;
      inFlight.current = false;
    };
  }, [serialized, revision, load]);
  const toggle = (file: AppFile) => {
    if (!file.available) {
      Alert.alert('File unavailable', 'Reconnect the source or rescan.');
      return;
    }
    setSelected(previous => {
      const next = new Map(previous);
      if (next.has(file.id)) next.delete(file.id);
      else if (next.size < 1000) next.set(file.id, file);
      return next;
    });
  };
  const labels: Partial<Record<Route['name'], string>> = {
    files: 'All accessible files',
    large: 'Large files',
    old: 'Older files',
    downloads: 'Downloads',
    documents: 'Document finder',
    apks: 'APK files',
    favorites: 'Favorites',
    search: 'Search your files',
  };
  const title = route.duplicateHash
    ? 'Duplicate copies'
    : route.name === 'category'
    ? (route.category ?? 'Files').replace(/^./, c => c.toUpperCase())
    : labels[route.name] ?? 'Files';
  const topLevel =
    ['files', 'search'].includes(route.name) &&
    useAppStore.getState().routes.length === 1;
  const inputStyle = {
    color: t.text,
    backgroundColor: t.surface,
    borderColor: t.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 44,
    fontSize: 14,
  };
  return (
    <Screen
      title={title}
      subtitle={
        route.name === 'apks'
          ? 'Installer files only · no sideloading'
          : 'Local index · granted sources only'
      }
      back={topLevel ? undefined : back}
      scroll={false}
    >
      <TextInput
        accessibilityLabel="Search file names, extensions and locations"
        placeholder="Search names, types or locations"
        placeholderTextColor={t.muted}
        value={query}
        onChangeText={setQuery}
        style={inputStyle}
        returnKeyType="search"
        onSubmitEditing={() => {
          void storage
            .remember(query)
            .then(() => storage.recent())
            .then(setRecent)
            .catch(() => {});
        }}
      />
      {route.name === 'search' && !query && recent.length > 0 && (
        <ScrollView
          horizontal
          style={{ maxHeight: 42, marginTop: 8 }}
          showsHorizontalScrollIndicator={false}
        >
          {recent.map(term => (
            <Chip key={term} title={term} onPress={() => setQuery(term)} />
          ))}
        </ScrollView>
      )}
      <View style={[styles.between, { paddingVertical: 8 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {(
            ['newest', 'oldest', 'largest', 'smallest', 'name'] as FileSort[]
          ).map(value => (
            <Chip
              key={value}
              title={value}
              active={sort === value}
              onPress={() => setSort(value)}
            />
          ))}
        </ScrollView>
        <Button
          title={grid ? 'List' : 'Grid'}
          secondary
          onPress={() => setGrid(!grid)}
        />
      </View>
      <ScrollView
        horizontal
        style={{ maxHeight: 43 }}
        showsHorizontalScrollIndicator={false}
      >
        <Chip
          title="Filters"
          active={advanced}
          onPress={() => setAdvanced(!advanced)}
        />
        <Chip
          title="All types"
          active={!category}
          onPress={() => setCategory(undefined)}
        />
        {categories.map(value => (
          <Chip
            key={value}
            title={value}
            active={category === value}
            onPress={() => setCategory(value)}
          />
        ))}
      </ScrollView>
      {route.name === 'large' && (
        <ScrollView
          horizontal
          style={{ maxHeight: 42 }}
          showsHorizontalScrollIndicator={false}
        >
          {[10, 50, 100, 500].map(size => (
            <Chip
              key={size}
              title={`Over ${size} MB`}
              active={minMB === String(size)}
              onPress={() => setMinMB(String(size))}
            />
          ))}
        </ScrollView>
      )}
      {route.name === 'old' && (
        <ScrollView
          horizontal
          style={{ maxHeight: 42 }}
          showsHorizontalScrollIndicator={false}
        >
          {[30, 90, 180, 365, 730].map(days => (
            <Chip
              key={days}
              title={`${days} days`}
              active={oldDays === days}
              onPress={() => setOldDays(days)}
            />
          ))}
        </ScrollView>
      )}
      {advanced && (
        <View style={{ gap: 8, paddingVertical: 8 }}>
          <TextInput
            style={inputStyle}
            placeholder="Extension, e.g. pdf"
            placeholderTextColor={t.muted}
            value={extension}
            onChangeText={setExtension}
            autoCapitalize="none"
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={[inputStyle, { flex: 1 }]}
              placeholder="Min MB"
              placeholderTextColor={t.muted}
              keyboardType="numeric"
              value={minMB}
              onChangeText={setMinMB}
            />
            <TextInput
              style={[inputStyle, { flex: 1 }]}
              placeholder="Max MB"
              placeholderTextColor={t.muted}
              keyboardType="numeric"
              value={maxMB}
              onChangeText={setMaxMB}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={[inputStyle, { flex: 1 }]}
              placeholder="After YYYY-MM-DD"
              placeholderTextColor={t.muted}
              value={afterDate}
              onChangeText={setAfterDate}
            />
            <TextInput
              style={[inputStyle, { flex: 1 }]}
              placeholder="Before YYYY-MM-DD"
              placeholderTextColor={t.muted}
              value={beforeDate}
              onChangeText={setBeforeDate}
            />
          </View>
        </View>
      )}
      {error && (
        <View style={{ paddingVertical: 10, gap: 8 }}>
          <Label style={{ color: t.danger }}>{error}</Label>
          <Button title="Retry" secondary onPress={() => void load(true)} />
        </View>
      )}
      <FlatList
        key={grid ? 'grid' : 'list'}
        numColumns={grid ? 2 : 1}
        data={items}
        keyExtractor={file => file.id}
        extraData={selected}
        renderItem={({ item }) => (
          <FileItem
            file={item}
            grid={grid}
            selected={selected.has(item.id)}
            selecting={selected.size > 0}
            onPress={() =>
              selected.size
                ? toggle(item)
                : push({ name: 'details', file: item })
            }
            onLongPress={() => toggle(item)}
          />
        )}
        onEndReached={() => void load(false)}
        onEndReachedThreshold={0.4}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        ListEmptyComponent={
          !loading && !error ? (
            <Empty
              title="No matching files"
              body={
                route.name === 'favorites'
                  ? 'Open a file and tap Favorite to keep it here.'
                  : 'Try different filters, rescan, or add files and folders in Scan coverage.'
              }
            />
          ) : null
        }
        ListFooterComponent={
          loading ? (
            <ActivityIndicator style={{ padding: 16 }} color={t.primary} />
          ) : hasMore ? null : (
            <Label
              muted
              style={{ textAlign: 'center', padding: 12, fontSize: 12 }}
            >
              End of accessible index
            </Label>
          )
        }
        contentContainerStyle={{ paddingBottom: 16 }}
      />
      {selected.size > 0 && (
        <View
          style={{
            paddingVertical: 12,
            gap: 8,
            borderTopWidth: 1,
            borderTopColor: t.line,
          }}
        >
          <View style={styles.between}>
            <Label style={{ fontWeight: '600' }}>
              {selected.size} selected ·{' '}
              {bytes(
                [...selected.values()].reduce(
                  (sum, file) => sum + file.size,
                  0,
                ),
              )}
            </Label>
            <Button
              title="Clear"
              secondary
              onPress={() => setSelected(new Map())}
            />
          </View>
          <Button
            title="Share selected"
            icon="share-variant-outline"
            secondary
            onPress={() => {
              void storage
                .shareMany([...selected.values()])
                .catch(e => Alert.alert('Unable to share', errorMessage(e)));
            }}
          />
          <Button
            title="Review deletion"
            icon="delete-outline"
            danger
            onPress={() =>
              push({
                name: 'review',
                files: [...selected.values()],
                protectDuplicates: !!route.duplicateHash,
              })
            }
          />
        </View>
      )}
    </Screen>
  );
}
