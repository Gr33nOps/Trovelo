import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { fonts, fontSizes, radius as radii, spacing, weights } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { useHaptics } from '../hooks/useHaptics';
import HomeScreen from '../screens/HomeScreen';
import LibraryScreen from '../screens/LibraryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import StatsScreen from '../screens/StatsScreen';
import { Type } from '../ui/Type';

export type MainTabParamList = {
  Library: { tag?: string } | undefined;
  Home: undefined;
  New: undefined;
  Stats: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

function NewPlaceholder() {
  return <View style={{ flex: 1 }} />;
}

const FAB_SIZE = 44;

interface TabIconProps {
  readonly color: string;
  readonly focused: boolean;
}

/**
 * A factory rather than an inline arrow per tab: React Navigation calls
 * `tabBarIcon`/`tabBarLabel` as render props, but a function defined fresh
 * on every `MainTabs` render is still a fresh identity every time, which
 * defeats memoisation the same way an unstable nested component would.
 * Calling the factory once at module load keeps each tab's renderer a
 * single stable reference for the life of the app.
 */
function makeTabIcon(focusedName: keyof typeof Ionicons.glyphMap, unfocusedName: keyof typeof Ionicons.glyphMap) {
  return function TabIcon({ color, focused }: TabIconProps) {
    return <Ionicons name={focused ? focusedName : unfocusedName} size={22} color={color} />;
  };
}

function makeTabLabel(label: string) {
  return function TabLabelRenderer({ color, focused }: TabIconProps) {
    return <TabLabel label={label} color={color} focused={focused} />;
  };
}

const libraryTabIcon = makeTabIcon('cube', 'cube-outline');
const surpriseTabIcon = makeTabIcon('shuffle', 'shuffle-outline');
const settingsTabIcon = makeTabIcon('settings', 'settings-outline');

const libraryTabLabel = makeTabLabel('Trovelo');
const surpriseTabLabel = makeTabLabel('Surprise');
const settingsTabLabel = makeTabLabel('Settings');

/**
 * The raised "+" compose button. A real component (not an inline render prop)
 * since it needs live theme colours. Carries a caption label like every other
 * tab, rather than relying on the icon alone to be self-explanatory.
 */
function ComposeTabButton({ onPress }: BottomTabBarButtonProps) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Add a new idea"
      hitSlop={8}
      style={styles.fabSlot}
    >
      <View
        style={[
          styles.fab,
          {
            backgroundColor: palette.accent,
            borderRadius: radii.pill,
            shadowColor: palette.shadow,
          },
        ]}
      >
        <Ionicons name="add" size={22} color={palette.accentInk} />
      </View>
      <TabLabel label="New idea" color={palette.inkSoft} focused={false} />
    </Pressable>
  );
}

/** Trovelo · Surprise · (+) · Settings, each a destination except the raised compose button. Stats stays reachable. */
export function MainTabs() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const barHeight = 56 + Math.max(insets.bottom, spacing.sm);

  return (
    <Tab.Navigator
      initialRouteName="Library"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.ink,
        tabBarInactiveTintColor: palette.inkSoft,
        tabBarStyle: {
          backgroundColor: palette.backdrop,
          borderTopColor: palette.edge,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
          shadowOpacity: 0,
          height: barHeight,
          paddingBottom: Math.max(insets.bottom, spacing.sm),
          paddingTop: spacing.xs,
        },
        tabBarItemStyle: {
          justifyContent: 'center',
          alignItems: 'center',
        },
        tabBarShowLabel: true,
      }}
    >
      <Tab.Screen
        name="Library"
        component={LibraryScreen}
        options={{
          tabBarIcon: libraryTabIcon,
          tabBarLabel: libraryTabLabel,
        }}
      />
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: surpriseTabIcon,
          tabBarLabel: surpriseTabLabel,
        }}
      />
      <Tab.Screen
        name="New"
        component={NewPlaceholder}
        listeners={({ navigation }) => ({
          tabPress: (event) => {
            event.preventDefault();
            haptics.light();
            navigation.getParent()?.navigate('EntryEdit');
          },
        })}
        options={{
          tabBarButton: ComposeTabButton,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: settingsTabIcon,
          tabBarLabel: settingsTabLabel,
        }}
      />
      <Tab.Screen
        name="Stats"
        component={StatsScreen}
        options={{
          tabBarButton: () => null,
          tabBarItemStyle: { display: 'none', width: 0 },
        }}
      />
    </Tab.Navigator>
  );
}

function TabLabel({ label, color, focused }: { readonly label: string; readonly color: string; readonly focused: boolean }) {
  return (
    <Type role="caption" color={color} numberOfLines={1} style={[styles.label, focused && styles.labelFocused]}>
      {label}
    </Type>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xxs,
    fontWeight: weights.regular,
    textAlign: 'center',
    marginTop: 2,
  },
  labelFocused: {
    fontFamily: fonts.bodySemibold,
    fontWeight: weights.semibold,
  },
  fabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    // Pulled up so the circle's net footprint below this point matches a
    // plain 22px tab icon — with a label now following underneath (unlike
    // before), the raised circle can't also claim as much vertical space as
    // it used to or it pushes the label past the tab bar's fixed height.
    marginTop: -(FAB_SIZE - 22),
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 7,
    elevation: 4,
  },
});
