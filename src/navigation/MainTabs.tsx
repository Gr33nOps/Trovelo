import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type { NavigationProp } from '@react-navigation/native';
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
import type { RootStackParamList } from './index';

export type MainTabParamList = {
  Library: { tag?: string } | undefined;
  Home: undefined;
  Stats: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

const FAB_SIZE = 52;

interface TabDef {
  readonly name: 'Library' | 'Home' | 'Settings';
  readonly label: string;
  readonly focusedIcon: keyof typeof Ionicons.glyphMap;
  readonly unfocusedIcon: keyof typeof Ionicons.glyphMap;
}

/** The bar's three real destinations. Stats stays reachable from Settings instead of taking a fourth slot. */
const VISIBLE_TABS: TabDef[] = [
  { name: 'Library', label: 'Trovelo', focusedIcon: 'cube', unfocusedIcon: 'cube-outline' },
  { name: 'Home', label: 'Surprise', focusedIcon: 'shuffle', unfocusedIcon: 'shuffle-outline' },
  { name: 'Settings', label: 'Settings', focusedIcon: 'settings', unfocusedIcon: 'settings-outline' },
];

function TabLabel({ label, color, focused }: { readonly label: string; readonly color: string; readonly focused: boolean }) {
  return (
    <Type role="caption" color={color} numberOfLines={1} style={[styles.label, focused && styles.labelFocused]}>
      {label}
    </Type>
  );
}

/**
 * A fully custom bar rather than a 4th `tabBarButton` slot: the compose
 * action floats above the row instead of sharing it, so it reads as a
 * distinct "add" affordance rather than a fourth, oversized destination.
 */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const barHeight = 56 + Math.max(insets.bottom, spacing.sm);
  const activeName = state.routes[state.index].name;

  return (
    <View
      style={[
        styles.bar,
        {
          height: barHeight,
          paddingBottom: Math.max(insets.bottom, spacing.sm),
          backgroundColor: palette.backdrop,
          borderTopColor: palette.edge,
        },
      ]}
    >
      {VISIBLE_TABS.map((tab) => {
        const focused = activeName === tab.name;
        const color = focused ? palette.ink : palette.inkSoft;
        return (
          <Pressable
            key={tab.name}
            onPress={() => {
              haptics.light();
              navigation.navigate(tab.name);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={tab.label}
            style={styles.tabItem}
          >
            <Ionicons name={focused ? tab.focusedIcon : tab.unfocusedIcon} size={22} color={color} />
            <TabLabel label={tab.label} color={color} focused={focused} />
          </Pressable>
        );
      })}

      <Pressable
        onPress={() => {
          haptics.light();
          navigation.getParent<NavigationProp<RootStackParamList>>()?.navigate('EntryEdit');
        }}
        accessibilityRole="button"
        accessibilityLabel="Add a new idea"
        hitSlop={8}
        style={styles.fabWrap}
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
          <Ionicons name="add" size={26} color={palette.accentInk} />
        </View>
        <TabLabel label="New idea" color={palette.inkSoft} focused={false} />
      </Pressable>
    </View>
  );
}

export function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Library"
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tab.Screen name="Library" component={LibraryScreen} />
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
      <Tab.Screen name="Stats" component={StatsScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.xs,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  fabWrap: {
    position: 'absolute',
    top: -(FAB_SIZE / 2),
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
});
