/**
 * Customer post-trip rating screen.
 *  - 5-star tap input, optional comment, sends to /api/customer/bookings/{id}/rate
 *  - Backend aggregates avg rating + count onto the driver record.
 */
import { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Star } from "lucide-react-native";
import Button from "@/components/Button";
import { colors, radius } from "@/theme";
import { customerRateTrip } from "@/api";

export default function RateTrip() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bid: string; driver?: string }>();
  const bid = params.bid as string;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (rating < 1) {
      Alert.alert("Pick a rating", "Tap a star from 1–5 to rate your trip.");
      return;
    }
    setSubmitting(true);
    try {
      await customerRateTrip(bid, rating, comment.trim() || undefined);
      Alert.alert("Thank you!", "Your feedback was sent to your chauffeur.", [
        { text: "OK", onPress: () => router.replace("/trips") },
      ]);
    } catch (e: any) {
      Alert.alert("Could not submit", e?.response?.data?.detail || "Try again later.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={s.header}>
          <Pressable testID="rate-back" onPress={() => router.back()} hitSlop={10} style={s.iconBtn}>
            <ChevronLeft size={20} color="#fff" />
          </Pressable>
          <Text style={s.title}>Rate your trip</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 22 }}>
          <Text style={s.h1}>How was <Text style={s.h1Em}>{params.driver || "your chauffeur"}</Text>?</Text>
          <Text style={s.sub}>Your rating helps us maintain the highest standard of service.</Text>

          <View style={s.stars}>
            {[1, 2, 3, 4, 5].map(n => (
              <Pressable
                key={n}
                testID={`rate-star-${n}`}
                onPress={() => setRating(n)}
                hitSlop={6}
              >
                <Star
                  size={42}
                  color={n <= rating ? colors.gold : "rgba(255,255,255,0.2)"}
                  fill={n <= rating ? colors.gold : "transparent"}
                  strokeWidth={1.6}
                />
              </Pressable>
            ))}
          </View>

          {rating > 0 && (
            <Text style={s.ratingLabel}>{["", "Poor", "Fair", "Good", "Great", "Outstanding"][rating]}</Text>
          )}

          <Text style={[s.label, { marginTop: 28 }]}>SHARE YOUR EXPERIENCE (OPTIONAL)</Text>
          <TextInput
            testID="rate-comment"
            value={comment}
            onChangeText={setComment}
            placeholder="What stood out? Anything we should know?"
            placeholderTextColor="rgba(255,255,255,0.35)"
            multiline
            numberOfLines={5}
            maxLength={600}
            style={s.textarea}
          />

          <Button
            testID="rate-submit"
            onPress={submit}
            loading={submitting}
            disabled={rating < 1}
            style={{ marginTop: 22 }}
          >
            Submit Rating
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 14, fontWeight: "600", letterSpacing: 0.5 },
  h1: { color: "#fff", fontSize: 26, lineHeight: 30, marginTop: 4 },
  h1Em: { color: colors.gold, fontStyle: "italic" },
  sub: { color: "rgba(255,255,255,0.55)", fontSize: 13, lineHeight: 18, marginTop: 8 },
  stars: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 32 },
  ratingLabel: { color: colors.gold, fontSize: 14, textAlign: "center", marginTop: 14, fontStyle: "italic", fontWeight: "500" },
  label: { color: "rgba(255,255,255,0.45)", fontSize: 10, letterSpacing: 2, fontWeight: "600", marginBottom: 8 },
  textarea: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14, color: "#fff", fontSize: 14, minHeight: 110, textAlignVertical: "top" },
});
