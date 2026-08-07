import React from 'react';
import { StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';

import { fontSizes, fonts, weights } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import HomeScreen from '../screens/HomeScreen';
import LibraryScreen from '../screens/LibraryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import StatsScreen from '../screens/StatsScreen';
import { EntryKind } from '../types';

export type MainTabParamList = {
  Home: undefined;
  Library: { tag?: string; kind?: EntryKind } | undefined;
  Stats: undefined;
  Settings: undefined;
};

const TAB_ICONS: Record<
  keyof MainTabParamList,
  { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap; label: string }
> = {
  Home: { active: 'home', inactive: 'home-outline', label: 'Home' },
  Library: { active: 'albums', inactive: 'albums-outline', label: 'Library' },
  Stats: { active: 'stats-chart', inactive: 'stats-chart-outline', label: 'Stats' },
  Settings: { active: 'settings', inactive: 'settings-outline', label: 'Settings' },
};

const Tab = createBottomTabNavigator<MainTabParamList>();

/**
 * The app's four main sections, always one tap away. Before this, Home was
 * the only screen with a persistent presence and everything else (Library,
 * Stats, Settings) was buried behind a stack push, which made sense when
 * the app was only "one box you shake." It stopped making sense once the
 * app also does notes, tasks, journalling and search.
 *
 * Entry detail, editing, and the one-off tools (model management, backup,
 * review, tidy) stay outside this navigator, as plain stack screens pushed
 * on top, which is what hides the tab bar while one of them is open.
 */
export function MainTabs() {
  const { palette } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => {
        const icons = TAB_ICONS[route.name];
        return {
          headerShown: false,
          tabBarActiveTintColor: palette.accent,
          tabBarInactiveTintColor: palette.inkFaint,
          tabBarLabel: icons.label,
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? icons.active : icons.inactive} size={size} color={color} />
          ),
          tabBarLabelStyle: {
            fontFamily: fonts.body,
            fontSize: fontSizes.xxs,
            fontWeight: weights.semibold,
          },
          tabBarStyle: {
            backgroundColor: palette.chromeGradient.colors[0],
            borderTopColor: palette.chromeBorder,
            borderTopWidth: StyleSheet.hairlineWidth,
            elevation: 0,
            shadowOpacity: 0,
          },
        };
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Library" component={LibraryScreen} />
      <Tab.Screen name="Stats" component={StatsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
