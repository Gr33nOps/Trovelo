import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AI_TASKS, AiTaskId } from '../services/ai';
import { radius as radii, spacing, withAlpha } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { AiRunner } from '../hooks/useAiRunner';
import { Button } from '../ui/Button';
import { Panel, Well } from '../ui/Surface';
import { Type } from '../ui/Type';

interface Props {
  runner: AiRunner;
  tasks: AiTaskId[];
  /** Disables the buttons, e.g. while there is nothing written yet. */
  disabled?: boolean;
  onRun: (taskId: AiTaskId) => void;
  /** Applies the finished result. Omit for read-only tasks. */
  onApply?: (taskId: AiTaskId, output: string) => void;
  /** Return null for tasks whose output is only meant to be read, not applied. */
  applyLabel?: (taskId: AiTaskId) => string | null;
  onOpenSettings: () => void;
}

/**
 * The assistant strip: a row of task buttons and, once something runs, the
 * output as it streams in.
 */
export function AiPanel({
  runner,
  tasks,
  disabled = false,
  onRun,
  onApply,
  applyLabel,
  onOpenSettings,
}: Props) {
  const { palette } = useTheme();
  const { availability, engine, providerLabel, running, taskId, output, error, drifted } = runner;
  const remote = engine === 'remote';

  if (availability === 'disabled' || availability === 'no-model') {
    return (
      <Panel style={styles.offCard} borderRadius={radii.lg}>
        <View style={styles.offHeader}>
          <Ionicons name={remote ? 'cloud-outline' : 'hardware-chip-outline'} size={18} color={palette.inkFaint} />
          <Type role="bodyStrong" pressed>
            {remote ? 'Cloud assistant' : 'Local assistant'}
          </Type>
        </View>
        <Type role="caption">
          {availability === 'disabled'
            ? 'Polish your writing, suggest a title, or add tags, all on this phone. Nothing is sent online.'
            : remote
              ? 'The assistant is on but no cloud provider is set up yet. Add one to get started.'
              : 'The assistant is on but has no model yet. Pick one to get started.'}
        </Type>
        <Button
          label={availability === 'disabled' ? 'Set up the assistant' : remote ? 'Set up a provider' : 'Choose a model'}
          variant="secondary"
          size="sm"
          onPress={onOpenSettings}
        />
      </Panel>
    );
  }

  const activeTask = taskId ? AI_TASKS[taskId] : null;
  const showOutput = !!activeTask && (running || !!output);
  const applyText = activeTask ? (applyLabel ? applyLabel(activeTask.id) : 'Use this') : null;

  return (
    <View style={styles.wrap}>
      {/*
        Which engine is about to handle the note is worth saying every time,
        not just the first time: it is the one thing here that decides
        whether any of this text leaves the phone.
      */}
      <View style={styles.engineRow}>
        <Ionicons name={remote ? 'cloud-outline' : 'phone-portrait-outline'} size={13} color={palette.inkFaint} />
        <Type role="caption" color={palette.inkFaint}>
          {remote ? `${providerLabel ?? 'Cloud'} · leaves this phone` : 'On this phone · nothing leaves it'}
        </Type>
      </View>

      <View style={styles.buttons}>
        {tasks.map((id) => {
          const task = AI_TASKS[id];
          const isActive = running && taskId === id;
          return (
            <Button
              key={id}
              label={isActive ? `${task.runningLabel}…` : task.label}
              onPress={() => onRun(id)}
              disabled={disabled || (running && !isActive)}
              loading={isActive}
              size="sm"
              variant={isActive ? 'primary' : 'secondary'}
              accessibilityHint={task.description}
              // Matches the label colour the Button itself uses for this
              // variant; an inkSoft icon beside ink text read as two-tone.
              icon={
                isActive ? undefined : (
                  <Ionicons
                    name={task.icon as keyof typeof Ionicons.glyphMap}
                    size={14}
                    color={palette.ink}
                  />
                )
              }
            />
          );
        })}
      </View>

      {error ? (
        <View
          style={[
            styles.error,
            { borderRadius: radii.md, backgroundColor: withAlpha(palette.danger, 0.12) },
          ]}
        >
          <Ionicons name="alert-circle-outline" size={16} color={palette.danger} />
          <Type role="caption" color={palette.danger} style={styles.errorText}>
            {error}
          </Type>
        </View>
      ) : null}

      {showOutput ? (
        <Well style={styles.output} borderRadius={radii.lg}>
          <View style={styles.outputHeader}>
            <Type role="label" pressed>
              {activeTask.label}
            </Type>
            {running ? <ActivityIndicator size="small" color={palette.accent} /> : null}
          </View>

          <Type role="body" style={styles.outputText}>
            {output || 'Thinking…'}
            {running && output ? (
              <Type role="body" color={palette.accent}>
                ▌
              </Type>
            ) : null}
          </Type>

          {/*
            The assistant went off and wrote about something else. Saying so
            plainly matters more than hiding it: the result still shows, but it
            stops being the confident one-tap swap for what the user wrote.
          */}
          {!running && drifted ? (
            <View
              style={[
                styles.drift,
                { borderRadius: radii.md, backgroundColor: withAlpha(palette.danger, 0.12) },
              ]}
            >
              <Ionicons name="warning-outline" size={16} color={palette.danger} />
              <Type role="caption" color={palette.danger} style={styles.driftText}>
                This drifted away from what you wrote. Check it before using it.
              </Type>
            </View>
          ) : null}

          <View style={styles.outputActions}>
            {running ? (
              <Button label="Stop" variant="secondary" size="sm" onPress={runner.cancel} />
            ) : (
              <>
                {onApply && output && applyText ? (
                  <Button
                    label={drifted ? `${applyText} anyway` : applyText}
                    variant={drifted ? 'secondary' : 'primary'}
                    size="sm"
                    haptic="success"
                    onPress={() => onApply(activeTask.id, output)}
                  />
                ) : null}
                <Button
                  label={applyText ? (drifted ? 'Keep mine' : 'Dismiss') : 'Done'}
                  variant={drifted ? 'primary' : 'plain'}
                  size="sm"
                  onPress={runner.reset}
                />
              </>
            )}
          </View>
        </Well>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  engineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  offCard: {
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  offHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
  },
  errorText: {
    flex: 1,
  },
  drift: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
  },
  driftText: {
    flex: 1,
    lineHeight: 19,
  },
  output: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  outputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  outputText: {
    lineHeight: 24,
  },
  outputActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
