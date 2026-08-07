import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, fontSizes, spacing, weights } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { useHaptics } from '../hooks/useHaptics';
import HomeScreen from '../screens/HomeScreen';
import LibraryScreen from '../screens/LibraryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import StatsScreen from '../screens/StatsScreen';
import { Type } from '../ui/Type';
import { EntryKind } from '../types';

export type MainTabParamList = {
  Library: { tag?: string; kind?: EntryKind } | undefined;
  Home: undefined;
  New: undefined;
  Stats: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

/** Blank stand-in; the New tab never stays focused — it opens EntryEdit. */
function NewPlaceholder() {
  return <View style={{ flex: 1 }} />;
}

/**
 * Text-only bottom bar matching the editorial layout:
 * Trovelo · Surprise · + New · Settings
 *
 * Stats stays in the navigator (hidden from the bar) so Settings can still
 * open it without dropping the feature.
 */
export function MainTabs() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();

  return (
    <Tab.Navigator
      initialRouteName="Library"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.ink,
        tabBarInactiveTintColor: palette.inkSoft,
        tabBarStyle: {
          backgroundColor: palette.chromeGradient.colors[0],
          borderTopColor: palette.chromeBorder,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
          shadowOpacity: 0,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: spacing.sm,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.body,
          fontSize: fontSizes.sm,
          fontWeight: weights.regular,
        },
        tabBarIcon: () => null,
        tabBarShowLabel: true,
      }}
    >
      <Tab.Screen
        name="Library"
        component={LibraryScreen}
        options={{
          tabBarLabel: ({ color, focused }) => (
            <TabLabel label="Trovelo" color={color} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: ({ color, focused }) => (
            <TabLabel label="Surprise" color={color} focused={focused} />
          ),
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
          tabBarLabel: ({ color, focused }) => (
            <TabLabel label="+ New" color={color} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: ({ color, focused }) => (
            <TabLabel label="Settings" color={color} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Stats"
        component={StatsScreen}
        options={{
          tabBarButton: () => null,
          tabBarItemStyle: { display: 'none' },
        }}
      />
    </Tab.Navigator>
  );
}

function TabLabel({ label, color, focused }: { label: string; color: string; focused: boolean }) {
  return (
    <Type
      role="body"
      color={color}
      numberOfLines={1}
      style={[styles.tabLabel, focused && styles.tabLabelFocused]}
    >
      {label}
    </Type>
  );
}

const styles = StyleSheet.create({
  tabLabel: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    fontWeight: weights.regular,
    textAlign: 'center',
  },
  tabLabelFocused: {
    fontFamily: fonts.bodySemibold,
    fontWeight: weights.semibold,
  },
});
