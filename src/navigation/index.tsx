import React from 'react';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

import { useTheme } from '../context/ThemeContext';
import AddEditEntryScreen from '../screens/AddEditEntryScreen';
import AppIconScreen from '../screens/AppIconScreen';
import BackupScreen from '../screens/BackupScreen';
import EntryDetailScreen from '../screens/EntryDetailScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import ReviewScreen from '../screens/ReviewScreen';
import TidyScreen from '../screens/TidyScreen';
import { MainTabParamList, MainTabs } from './MainTabs';

export type { MainTabParamList };

export type RootStackParamList = {
  Onboarding: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  EntryDetail: { entryId: string };
  EntryEdit: { entryId?: string; initialText?: string } | undefined;
  Backup: undefined;
  Review: undefined;
  Tidy: undefined;
  AppIcon: undefined;
};

/**
 * Screen props for anything rendered inside {@link MainTabs}. It needs both
 * the tab navigator's own actions (switch tabs) and the outer stack's (push
 * EntryDetail, EntryEdit, Settings' sub-screens), which is what the two
 * halves of this composite type are each for.
 */
export type MainTabScreenProps<T extends keyof MainTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { palette, onboarded } = useTheme();

  return (
    <Stack.Navigator
      initialRouteName={onboarded ? 'MainTabs' : 'Onboarding'}
      screenOptions={{
        // Every screen draws its own NavBar so the toolbar can be themed
        // consistently. Native-stack headers only accept a flat colour.
        headerShown: false,
        contentStyle: { backgroundColor: palette.backdrop },
        animation: 'slide_from_right',
        animationDuration: 220,
      }}
    >
      <Stack.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={{ animation: 'fade' }}
      />
      <Stack.Screen name="MainTabs" component={MainTabs} options={{ animation: 'fade' }} />
      <Stack.Screen name="EntryDetail" component={EntryDetailScreen} />
      <Stack.Screen
        name="EntryEdit"
        component={AddEditEntryScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="Backup" component={BackupScreen} />
      <Stack.Screen name="Review" component={ReviewScreen} />
      <Stack.Screen name="Tidy" component={TidyScreen} />
      <Stack.Screen name="AppIcon" component={AppIconScreen} />
    </Stack.Navigator>
  );
}
