import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
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

const FAB_SIZE = 52;

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
        tabBarInactiveTintColor: palette.inkFaint,
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
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'cube' : 'cube-outline'} size={22} color={color} />
          ),
          tabBarLabel: ({ color, focused }) => <TabLabel label="Trovelo" color={color} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'shuffle' : 'shuffle-outline'} size={22} color={color} />
          ),
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
          tabBarLabel: () => null,
          tabBarButton: (props) => (
            <Pressable
              onPress={props.onPress}
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
                <Ionicons name="add" size={26} color={palette.accentInk} />
              </View>
            </Pressable>
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'settings' : 'settings-outline'} size={22} color={color} />
          ),
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
    marginTop: -22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
});
