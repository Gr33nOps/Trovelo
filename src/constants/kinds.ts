import Ionicons from '@expo/vector-icons/Ionicons';

import { EntryKind, ENTRY_KINDS } from '../types';

export interface KindConfig {
  label: string;
  /** Shown as a chip in the kind picker. */
  pickerLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Label above the main text field in the editor. */
  fieldLabel: string;
  placeholder: string;
  /** The main save button's label for a new entry of this kind: an instruction, not a status. */
  saveLabel: string;
  /** What a fresh save of this kind is called in a toast, after the fact. */
  savedLabel: string;
}

export const KIND_CONFIG: Record<EntryKind, KindConfig> = {
  idea: {
    label: 'Idea',
    pickerLabel: 'idea',
    icon: 'bulb-outline',
    fieldLabel: 'The idea',
    placeholder: 'A half-formed thought, a what-if, a thing worth trying...',
    saveLabel: 'Put it in the box',
    savedLabel: 'Added to your box.',
  },
  note: {
    label: 'Note',
    pickerLabel: 'note',
    icon: 'document-text-outline',
    fieldLabel: 'The note',
    placeholder: 'Write anything you want to keep.',
    saveLabel: 'Save note',
    savedLabel: 'Note saved.',
  },
  task: {
    label: 'Task',
    pickerLabel: 'task',
    icon: 'checkbox-outline',
    fieldLabel: 'What needs doing',
    placeholder: 'What do you need to do?',
    saveLabel: 'Add task',
    savedLabel: 'Task added.',
  },
  journal: {
    label: 'Journal',
    pickerLabel: 'journal',
    icon: 'book-outline',
    fieldLabel: 'Today',
    placeholder: 'How is today going?',
    saveLabel: 'Save journal entry',
    savedLabel: 'Journal entry saved.',
  },
};

export const KIND_ORDER: readonly EntryKind[] = ENTRY_KINDS;
