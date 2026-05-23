import { Tabs } from "expo-router";
import { Home as HomeIcon, MapPin, History, User } from "lucide-react-native";
import { colors } from "@/theme";

export default function RiderTabsLayout() {
  // Tab order: Home (welcome / discover) | Book (booking flow w/ map) |
  // Trips (history) | Profile. The HOME tab gives riders a one-tap path back
  // to the brand/marketing screen no matter how deep they are. The BOOK tab
  // uses a map-pin icon to differentiate from Home and convey "make a trip".
  // Guests can use Book without signing in; auth is enforced at /pay.
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
        name="discover"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <HomeIcon size={20} color={color} strokeWidth={1.6} />,
        }}
      />
      <Tabs.Screen
        name="home"
        options={{
          title: "Book",
          tabBarIcon: ({ color }) => <MapPin size={20} color={color} strokeWidth={1.6} />,
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
