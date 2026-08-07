import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { radius as radii, spacing, withAlpha } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { PROVIDER_PRESETS, getPreset } from '../services/aiProvider';
import { AiProviderPreset, RemoteAiConfig } from '../types';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Controls';
import { Field } from '../ui/Field';
import { Type } from '../ui/Type';

interface Props {
  config: RemoteAiConfig | null;
  /** Whether an API key is already stored, without ever seeing the key itself. */
  hasStoredKey: boolean;
  /** Leave `key` empty to keep whatever is already stored. */
  onSave: (config: RemoteAiConfig, key: string) => void;
  onClearKey: () => void;
}

/**
 * The form for a user-configured OpenAI-compatible provider: a preset to
 * fill in the common ones, or Custom for anything else that speaks the same
 * `/chat/completions` shape (Ollama, LM Studio, a self-host). The key field
 * is never prefilled with a stored key, only ever written to or left alone,
 * consistent with never displaying a secret back once it has been entered.
 */
export function RemoteAiSettings({ config, hasStoredKey, onSave, onClearKey }: Props) {
  const { palette } = useTheme();
  const [preset, setPreset] = useState<AiProviderPreset>(config?.preset ?? 'groq');
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl ?? getPreset('groq').baseUrl);
  const [model, setModel] = useState(config?.model ?? getPreset('groq').defaultModel);
  const [key, setKey] = useState('');

  const presetInfo = getPreset(preset);

  useEffect(() => {
    if (!config) return;
    setPreset(config.preset);
    setBaseUrl(config.baseUrl);
    setModel(config.model);
  }, [config]);

  const pickPreset = (next: AiProviderPreset) => {
    setPreset(next);
    const info = getPreset(next);
    if (next !== 'custom') {
      setBaseUrl(info.baseUrl);
      setModel(info.defaultModel);
    }
  };

  const canSave = baseUrl.trim().length > 0 && model.trim().length > 0 && (key.trim().length > 0 || hasStoredKey);

  const save = () => {
    onSave(
      { preset, label: presetInfo.label, baseUrl: baseUrl.trim(), model: model.trim() },
      key.trim(),
    );
    setKey('');
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.chipRow}>
        {PROVIDER_PRESETS.map((option) => (
          <Chip key={option.id} label={option.label} active={preset === option.id} onPress={() => pickPreset(option.id)} />
        ))}
      </View>

      {presetInfo.freeTierNote ? (
        <Type role="caption" color={palette.inkFaint}>
          {presetInfo.freeTierNote}
        </Type>
      ) : null}

      <Field
        label="Base URL"
        value={baseUrl}
        onChangeText={setBaseUrl}
        placeholder="https://api.example.com/v1"
        autoCapitalize="none"
        autoCorrect={false}
        editable={preset === 'custom'}
      />

      <Field
        label="Model"
        value={model}
        onChangeText={setModel}
        placeholder={presetInfo.modelHint}
        hint={preset !== 'custom' ? presetInfo.modelHint : undefined}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Field
        label="API key"
        value={key}
        onChangeText={setKey}
        placeholder={hasStoredKey ? 'Saved. Leave blank to keep it.' : 'Paste your key'}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        hint="Stored in this phone's secure keystore, never in a backup."
      />

      {presetInfo.keyUrl ? (
        <Button
          label={`Get a ${presetInfo.label} key`}
          variant="plain"
          size="sm"
          icon={<Ionicons name="open-outline" size={14} color={palette.accent} />}
          onPress={() => void Linking.openURL(presetInfo.keyUrl)}
        />
      ) : null}

      <View
        style={[
          styles.notice,
          { borderRadius: radii.md, backgroundColor: withAlpha(palette.danger, 0.1) },
        ]}
      >
        <Ionicons name="cloud-upload-outline" size={15} color={palette.danger} />
        <Type role="caption" color={palette.danger} style={styles.noticeText}>
          Note text run through the assistant will be sent to this address. Read the provider's own privacy
          policy before using it for anything sensitive.
        </Type>
      </View>

      <View style={styles.actions}>
        <Button label="Save" variant="primary" size="sm" disabled={!canSave} onPress={save} />
        {hasStoredKey ? (
          <Button label="Remove key" variant="secondary" size="sm" onPress={onClearKey} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
  },
  noticeText: {
    flex: 1,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
