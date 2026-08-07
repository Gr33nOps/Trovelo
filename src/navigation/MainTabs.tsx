import React from 'react';
import { StyleSheet, View } from 'react-native';
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

function NewPlaceholder() {
  return <View style={{ flex: 1 }} />;
}

/** Text-only bar: Trovelo · Surprise · + New · Settings. Stats stays reachable. */
export function MainTabs() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const barHeight = 52 + Math.max(insets.bottom, spacing.sm);

  return (
    <Tab.Navigator
      initialRouteName="Library"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.ink,
        tabBarInactiveTintColor: palette.inkFaint,
        tabBarStyle: {
          backgroundColor: palette.backdrop,
          borderTopColor: palette.edge,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
          shadowOpacity: 0,
          height: barHeight,
          paddingBottom: Math.max(insets.bottom, spacing.sm),
          paddingTop: spacing.sm,
        },
        tabBarItemStyle: {
          justifyContent: 'center',
          alignItems: 'center',
        },
        tabBarIcon: () => null,
        tabBarShowLabel: true,
      }}
    >
      <Tab.Screen
        name="Library"
        component={LibraryScreen}
        options={{
          tabBarLabel: ({ color, focused }) => <TabLabel label="Trovelo" color={color} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: ({ color, focused }) => <TabLabel label="Surprise" color={color} focused={focused} />,
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
          tabBarLabel: ({ color, focused }) => <TabLabel label="+ New" color={color} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: ({ color, focused }) => <TabLabel label="Settings" color={color} focused={focused} />,
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

function TabLabel({ label, color, focused }: { label: string; color: string; focused: boolean }) {
  return (
    <Type
      role="body"
      color={color}
      numberOfLines={1}
      style={[styles.label, focused && styles.labelFocused]}
    >
      {label}
    </Type>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    fontWeight: weights.regular,
    textAlign: 'center',
    marginTop: -18,
  },
  labelFocused: {
    fontFamily: fonts.bodySemibold,
    fontWeight: weights.semibold,
  },
});
