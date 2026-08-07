import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AI_MODELS, AIModelInfo } from '../constants/models';
import { radius as radii, spacing, withAlpha } from '../constants/theme';
import { useDownload } from '../context/DownloadContext';
import { useSettings } from '../context/SettingsContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useHaptics } from '../hooks/useHaptics';
import { RootStackParamList } from '../navigation';
import { unloadModel } from '../services/ai';
import {
  LocalModelFile,
  deleteModelFile,
  formatBytes,
  getModelPath,
  importModelFromFile,
  isUsableModel,
  listLocalModels,
} from '../services/modelStore';
import { Button } from '../ui/Button';
import { Badge, ProgressBar } from '../ui/Controls';
import { SectionHeader } from '../ui/Group';
import { NavBar } from '../ui/NavBar';
import { Backdrop, Panel } from '../ui/Surface';
import { Type } from '../ui/Type';

type Props = NativeStackScreenProps<RootStackParamList, 'Models'>;

const CATALOG_FILE_NAMES = new Set(AI_MODELS.map((model) => model.fileName));

const SPEED_LABEL: Record<AIModelInfo['speed'], string> = {
  fastest: 'Fastest',
  balanced: 'Recommended',
  best: 'Best writing',
};

export default function ModelsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { selectedModelPath, setSelectedModelPath, aiEnabled, setAiEnabled } = useSettings();
  const { active, error, partials, startDownload, pauseDownload, cancelDownload, dismissError } =
    useDownload();
  const haptics = useHaptics();
  const toast = useToast();

  const [installed, setInstalled] = useState<Record<string, boolean>>({});
  const [sideloaded, setSideloaded] = useState<LocalModelFile[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const files = await listLocalModels();
    setSideloaded(files.filter((file) => !CATALOG_FILE_NAMES.has(file.fileName)));

    const map: Record<string, boolean> = {};
    await Promise.all(
      AI_MODELS.map(async (model) => {
        map[getModelPath(model)] = await isUsableModel(getModelPath(model));
      }),
    );
    for (const file of files) map[file.path] = true;
    setInstalled(map);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, active?.modelId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const choose = useCallback(
    (path: string) => {
      if (selectedModelPath === path) return;
      haptics.light();
      // The live context belongs to the previous model; drop it before switching.
      void unloadModel().catch(() => {});
      setSelectedModelPath(path);
      if (!aiEnabled) setAiEnabled(true);
    },
    [selectedModelPath, haptics, setSelectedModelPath, aiEnabled, setAiEnabled],
  );

  const remove = (path: string, name: string) => {
    Alert.alert(`Remove ${name}?`, 'The file will be deleted from this phone. You can download it again later.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          if (selectedModelPath === path) {
            await unloadModel().catch(() => {});
            setSelectedModelPath(null);
          }
          await deleteModelFile(path).catch(() => {});
          haptics.warning();
          await refresh();
          toast.show({ message: `${name} removed.` });
        },
      },
    ]);
  };

  const addFromFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];

    setBusy(true);
    try {
      const path = await importModelFromFile(asset.uri, asset.name);
      haptics.success();
      await refresh();
      choose(path);
      toast.show({ message: 'Model added.', tone: 'success' });
    } catch (caught) {
      haptics.warning();
      toast.show({
        message: caught instanceof Error ? caught.message : 'That file could not be added.',
        tone: 'warning',
      });
    } finally {
      setBusy(false);
    }
  };

  const downloadHint = (model: AIModelInfo) => {
    const partial = partials[model.id] ?? 0;
    if (partial > 0) {
      return `Resume · ${Math.round((partial / model.sizeBytes) * 100)}% already downloaded`;
    }
    return undefined;
  };

  return (
    <Backdrop>
      <NavBar title="Assistant model" onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        <Panel style={styles.intro} borderRadius={radii.lg}>
          <Ionicons name="information-circle-outline" size={18} color={palette.inkFaint} />
          <Type role="caption" style={styles.introText}>
            The assistant needs a language model on this phone. It is a large one-time download, best done on
            Wi-Fi. After that it runs offline. Nothing you write is sent anywhere.
          </Type>
        </Panel>

        {error ? (
          <Panel
            style={[styles.error, { borderColor: withAlpha(palette.danger, 0.5) }]}
            borderRadius={radii.lg}
          >
            <Ionicons name="alert-circle-outline" size={18} color={palette.danger} />
            <Type role="caption" color={palette.danger} style={styles.introText}>
              {error}
            </Type>
            <Button label="OK" size="sm" variant="secondary" onPress={dismissError} />
          </Panel>
        ) : null}

        <View>
          <SectionHeader title="Available models" />
          <View style={styles.list}>
            {AI_MODELS.map((model) => {
              const path = getModelPath(model);
              const downloading = active?.modelId === model.id;
              return (
                <ModelCard
                  key={model.id}
                  name={model.name}
                  description={model.description}
                  sizeLabel={model.sizeLabel}
                  tagline={SPEED_LABEL[model.speed]}
                  highlight={model.speed === 'balanced'}
                  installed={installed[path] === true}
                  selected={selectedModelPath === path}
                  downloading={downloading}
                  paused={downloading ? active?.paused ?? false : false}
                  fraction={downloading ? active?.fraction ?? 0 : 0}
                  speed={downloading ? active?.bytesPerSecond ?? 0 : 0}
                  received={downloading ? active?.receivedBytes ?? 0 : 0}
                  total={downloading ? active?.totalBytes ?? model.sizeBytes : model.sizeBytes}
                  resumeHint={downloadHint(model)}
                  disabled={active !== null && !downloading}
                  onDownload={() => void startDownload(model)}
                  onPause={pauseDownload}
                  onCancel={cancelDownload}
                  onUse={() => choose(path)}
                  onRemove={() => remove(path, model.name)}
                />
              );
            })}
          </View>
        </View>

        {sideloaded.length > 0 ? (
          <View>
            <SectionHeader title="Added from your phone" />
            <View style={styles.list}>
              {sideloaded.map((file) => {
                const name = humanize(file.fileName);
                return (
                  <ModelCard
                    key={file.path}
                    name={name}
                    description="Added from your files"
                    sizeLabel={formatBytes(file.sizeBytes)}
                    installed
                    selected={selectedModelPath === file.path}
                    downloading={false}
                    paused={false}
                    fraction={0}
                    speed={0}
                    received={0}
                    total={file.sizeBytes}
                    disabled={active !== null}
                    onDownload={() => {}}
                    onPause={() => {}}
                    onCancel={() => {}}
                    onUse={() => choose(file.path)}
                    onRemove={() => remove(file.path, name)}
                  />
                );
              })}
            </View>
          </View>
        ) : null}

        <Button
          label="Add a GGUF file from this phone"
          variant="secondary"
          size="md"
          fullWidth
          loading={busy}
          disabled={active !== null}
          onPress={() => void addFromFiles()}
          icon={<Ionicons name="folder-open-outline" size={16} color={palette.ink} />}
        />
      </ScrollView>
    </Backdrop>
  );
}

interface ModelCardProps {
  name: string;
  description: string;
  sizeLabel: string;
  tagline?: string;
  highlight?: boolean;
  installed: boolean;
  selected: boolean;
  downloading: boolean;
  paused: boolean;
  fraction: number;
  speed: number;
  received: number;
  total: number;
  resumeHint?: string;
  disabled: boolean;
  onDownload: () => void;
  onPause: () => void;
  onCancel: () => void;
  onUse: () => void;
  onRemove: () => void;
}

function ModelCard({
  name,
  description,
  sizeLabel,
  tagline,
  highlight = false,
  installed,
  selected,
  downloading,
  paused,
  fraction,
  speed,
  received,
  total,
  resumeHint,
  disabled,
  onDownload,
  onPause,
  onCancel,
  onUse,
  onRemove,
}: ModelCardProps) {
  const { palette } = useTheme();

  const remaining = speed > 0 && total > received ? (total - received) / speed : null;
  const timeLeft =
    remaining === null
      ? null
      : remaining > 90
        ? `${Math.ceil(remaining / 60)} min left`
        : `${Math.ceil(remaining)} sec left`;

  return (
    <Panel
      style={styles.card}
      borderRadius={radii.lg}
      borderColor={selected ? palette.accent : undefined}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitle}>
          <Type role="bodyStrong" pressed>
            {name}
          </Type>
          <Type role="caption" style={styles.cardDescription}>
            {description}
          </Type>
        </View>
        {selected ? (
          <Badge label="In use" color={palette.accent} icon={<Ionicons name="checkmark" size={11} color={palette.accent} />} />
        ) : tagline && highlight ? (
          <Badge label={tagline} color={palette.accent} />
        ) : null}
      </View>

      <View style={styles.cardMeta}>
        <Ionicons name="download-outline" size={13} color={palette.inkFaint} />
        <Type role="caption" color={palette.inkFaint}>
          {sizeLabel}
          {tagline && !highlight ? ` · ${tagline}` : ''}
        </Type>
      </View>

      {downloading ? (
        <View style={styles.downloadArea}>
          <ProgressBar
            fraction={fraction}
            indeterminate={fraction === 0 && !paused}
            label={
              paused
                ? 'Paused'
                : `${Math.round(fraction * 100)}% · ${formatBytes(received)} of ${formatBytes(total)}${
                    timeLeft ? ` · ${timeLeft}` : ''
                  }`
            }
          />
          <View style={styles.cardActions}>
            <Button
              label={paused ? 'Resume' : 'Pause'}
              size="sm"
              variant="secondary"
              onPress={paused ? onDownload : onPause}
              style={styles.grow}
            />
            <Button label="Cancel" size="sm" variant="plain" onPress={onCancel} />
          </View>
        </View>
      ) : installed ? (
        <View style={styles.cardActions}>
          {selected ? (
            <Button label="Remove" size="sm" variant="secondary" onPress={onRemove} style={styles.grow} />
          ) : (
            <>
              <Button label="Use this one" size="sm" variant="primary" onPress={onUse} style={styles.grow} />
              <Button label="Remove" size="sm" variant="plain" onPress={onRemove} />
            </>
          )}
        </View>
      ) : (
        <View style={styles.downloadArea}>
          {resumeHint ? (
            <Type role="caption" color={palette.inkFaint}>
              {resumeHint}
            </Type>
          ) : null}
          <Button
            label={resumeHint ? 'Resume download' : 'Download'}
            size="sm"
            variant="primary"
            disabled={disabled}
            fullWidth
            onPress={onDownload}
          />
        </View>
      )}
    </Panel>
  );
}

function humanize(fileName: string): string {
  return fileName
    .replace(/\.gguf$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  intro: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
  },
  introText: {
    flex: 1,
    lineHeight: 20,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  list: {
    gap: spacing.md,
  },
  card: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    gap: 2,
  },
  cardDescription: {
    lineHeight: 19,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: -spacing.xs,
  },
  downloadArea: {
    gap: spacing.sm,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  grow: {
    flex: 1,
  },
});
