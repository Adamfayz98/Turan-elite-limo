import { Tabs, Redirect } from "expo-router";
import { Home as HomeIcon, History, User } from "lucide-react-native";
import { colors } from "@/theme";
import { useAuth } from "@/store/auth";

export default function RiderTabsLayout() {
  const user = useAuth(s => s.user);
  const hydrated = useAuth(s => s.hydrated);
  if (hydrated && !user) return <Redirect href="/(rider)/auth" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "rgba(0,0,0,0.95)",
          borderTopColor: "rgba(255,255,255,0.06)",
          height: 78,
          paddingTop: 8,
          paddingBottom: 18,
        },
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: "rgba(255,255,255,0.5)",
        tabBarLabelStyle: { fontSize: 10, letterSpacing: 0.5, fontWeight: "500" },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Book",
          tabBarIcon: ({ color }) => <HomeIcon size={20} color={color} strokeWidth={1.6} />,
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: "Trips",
          tabBarIcon: ({ color }) => <History size={20} color={color} strokeWidth={1.6} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <User size={20} color={color} strokeWidth={1.6} />,
        }}
      />
    </Tabs>
  );
}
